import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three'
import {
  DEFAULT_BOX_PARAMS,
  PARAM_LIMITS,
  type BoxParams,
  type ContourMode,
  type FootprintResult,
  type MeshData,
  type ModelTransform,
  type Point2,
  type Point3,
  type Size3,
  type Triangle,
} from './types'

const EPSILON = 1e-6

export function clampBoxParams(params: BoxParams): BoxParams {
  const limits = PARAM_LIMITS
  const wallMm = clamp(params.wallMm, limits.wallMm.min, limits.wallMm.max)
  const bottomMm = clamp(params.bottomMm, limits.bottomMm.min, limits.bottomMm.max)
  // 内腔至少保留 12mm,避免生成无效盒体
  const lengthMm = clamp(
    params.lengthMm,
    Math.max(limits.lengthMm.min, wallMm * 2 + 12),
    limits.lengthMm.max,
  )
  const widthMm = clamp(
    params.widthMm,
    Math.max(limits.widthMm.min, wallMm * 2 + 12),
    limits.widthMm.max,
  )
  const heightMm = clamp(
    params.heightMm,
    Math.max(limits.heightMm.min, bottomMm + 8),
    limits.heightMm.max,
  )

  return {
    ...params,
    lengthMm,
    widthMm,
    heightMm,
    wallMm,
    bottomMm,
    cornerRadiusMm: clamp(
      params.cornerRadiusMm,
      limits.cornerRadiusMm.min,
      Math.min(limits.cornerRadiusMm.max, Math.min(lengthMm, widthMm) / 4),
    ),
    clearanceXYMm: clamp(params.clearanceXYMm, limits.clearanceXYMm.min, limits.clearanceXYMm.max),
    clearanceZMm: clamp(params.clearanceZMm, limits.clearanceZMm.min, limits.clearanceZMm.max),
    contourSmoothing: Math.round(
      clamp(params.contourSmoothing, limits.contourSmoothing.min, limits.contourSmoothing.max),
    ),
    // 深度上限为通腔到底(高 - 底厚)
    cavityDepthMm: clamp(params.cavityDepthMm, limits.cavityDepthMm.min, heightMm - bottomMm),
  }
}

export function autoFitParamsForSize(params: BoxParams, size: Size3): BoxParams {
  const next = {
    ...params,
    lengthMm: roundMm(size.x + params.wallMm * 2 + params.clearanceXYMm * 2),
    widthMm: roundMm(size.y + params.wallMm * 2 + params.clearanceXYMm * 2),
    heightMm: roundMm(size.z + params.bottomMm + params.clearanceZMm),
    // 自动适配时镂空到底,容纳完整模型
    cavityDepthMm: roundMm(size.z + params.clearanceZMm),
  }

  return clampBoxParams(next)
}

export function applyTransformToPositions(
  positions: Float32Array,
  transform: ModelTransform,
  bottomMm: number = DEFAULT_BOX_PARAMS.bottomMm,
): Float32Array {
  const next = new Float32Array(positions.length)
  const rx = toRadians(transform.rotateX)
  const ry = toRadians(transform.rotateY)
  const rz = toRadians(transform.rotateZ)
  const sinX = Math.sin(rx)
  const cosX = Math.cos(rx)
  const sinY = Math.sin(ry)
  const cosY = Math.cos(ry)
  const sinZ = Math.sin(rz)
  const cosZ = Math.cos(rz)

  for (let index = 0; index < positions.length; index += 3) {
    let x = positions[index] * transform.scale
    let y = positions[index + 1] * transform.scale
    let z = positions[index + 2] * transform.scale

    const yAfterX = y * cosX - z * sinX
    const zAfterX = y * sinX + z * cosX
    y = yAfterX
    z = zAfterX

    const xAfterY = x * cosY + z * sinY
    const zAfterY = -x * sinY + z * cosY
    x = xAfterY
    z = zAfterY

    const xAfterZ = x * cosZ - y * sinZ
    const yAfterZ = x * sinZ + y * cosZ
    x = xAfterZ
    y = yAfterZ

    next[index] = x
    next[index + 1] = y
    next[index + 2] = z
  }

  return centerPositions(next, bottomMm)
}

export function measurePositions(positions: Float32Array): Size3 {
  const bounds = getBounds(positions)

  return {
    x: roundMm(bounds.max.x - bounds.min.x),
    y: roundMm(bounds.max.y - bounds.min.y),
    z: roundMm(bounds.max.z - bounds.min.z),
  }
}

export function createFootprint(
  positions: Float32Array | undefined,
  params: BoxParams,
): FootprintResult {
  // 无模型或选择矩形内腔时,使用矩形(圆角)镂空
  if (!positions || positions.length < 9 || params.cavityMode === 'rect') {
    const innerLength = Math.max(12, params.lengthMm - params.wallMm * 2)
    const innerWidth = Math.max(12, params.widthMm - params.wallMm * 2)
    return {
      contour: roundedRectContour(
        innerLength,
        innerWidth,
        Math.max(0, params.cornerRadiusMm - params.wallMm),
        8,
      ),
      mode: 'concave',
      warnings: [],
    }
  }

  const sampled = samplePointsFromPositions(positions, 700)
  const warnings: string[] = []
  const concave = concaveHull(sampled, params.contourSmoothing)
  const inflatedConcave = concave
    ? cleanPolygon(offsetPolygonRadial(concave, params.clearanceXYMm))
    : undefined

  if (
    inflatedConcave &&
    inflatedConcave.length >= 3 &&
    !hasSelfIntersections(inflatedConcave)
  ) {
    return finalizeFootprint(inflatedConcave, 'concave', params, warnings)
  }

  warnings.push('轮廓无法稳定闭合，已使用保守凸包轮廓。')
  return finalizeFootprint(
    cleanPolygon(offsetPolygonRadial(convexHull(sampled), params.clearanceXYMm)),
    'convexFallback',
    params,
    warnings,
  )
}

/** 将镂空轮廓限制在盒体内壁以内,避免轮廓穿透壁面导致网格破损 */
function finalizeFootprint(
  contour: Point2[],
  mode: ContourMode,
  params: BoxParams,
  warnings: string[],
): FootprintResult {
  const safeHalfLength = params.lengthMm / 2 - params.wallMm
  const safeHalfWidth = params.widthMm / 2 - params.wallMm
  let clipped = false

  const constrained = contour.map((point) => {
    const x = clamp(point.x, -safeHalfLength, safeHalfLength)
    const y = clamp(point.y, -safeHalfWidth, safeHalfWidth)
    if (Math.abs(x - point.x) > EPSILON || Math.abs(y - point.y) > EPSILON) {
      clipped = true
    }
    return { x, y }
  })

  if (clipped) {
    warnings.push('模型轮廓加余量超出盒体内壁，镂空区域已被裁剪，建议增大盒体尺寸。')
  }

  const cleaned = cleanPolygon(constrained)
  if (cleaned.length < 3 || hasSelfIntersections(cleaned)) {
    warnings.push('轮廓裁剪后不可用，已退回矩形内腔。')
    return {
      contour: roundedRectContour(
        Math.max(12, params.lengthMm - params.wallMm * 2),
        Math.max(12, params.widthMm - params.wallMm * 2),
        Math.max(0, params.cornerRadiusMm - params.wallMm),
        8,
      ),
      mode: 'convexFallback',
      warnings,
    }
  }

  return {
    contour: ensureCounterClockwise(cleaned),
    mode,
    warnings,
  }
}

export function generateStorageBox(paramsInput: BoxParams, footprint?: Point2[]): MeshData {
  const params = clampBoxParams(paramsInput)
  const outer = ensureCounterClockwise(
    roundedRectContour(
      params.lengthMm,
      params.widthMm,
      params.cornerRadiusMm,
      Math.max(6, Math.round(params.contourSmoothing / 6)),
    ),
  )
  const inner = ensureCounterClockwise(
    cleanPolygon(
      footprint && footprint.length >= 3
        ? footprint
        : roundedRectContour(
            params.lengthMm - params.wallMm * 2,
            params.widthMm - params.wallMm * 2,
            Math.max(0, params.cornerRadiusMm - params.wallMm),
            8,
          ),
    ),
  )

  const vertices: Point3[] = []
  const triangles: Triangle[] = []
  const addVertex = (point: Point2, z: number) => {
    vertices.push({ x: roundMesh(point.x), y: roundMesh(point.y), z: roundMesh(z) })
    return vertices.length - 1
  }
  const addTriangle = (a: number, b: number, c: number) => {
    if (a !== b && b !== c && a !== c) {
      triangles.push([a, b, c])
    }
  }
  const addQuad = (a: number, b: number, c: number, d: number) => {
    addTriangle(a, b, c)
    addTriangle(a, c, d)
  }

  // 腔底 z = 高度 - 镂空深度,最低不低于底厚
  const cavityFloorZ = clamp(
    params.heightMm - params.cavityDepthMm,
    params.bottomMm,
    params.heightMm - 2,
  )

  const outerBottom = outer.map((point) => addVertex(point, 0))
  const outerTop = outer.map((point) => addVertex(point, params.heightMm))
  const innerFloor = inner.map((point) => addVertex(point, cavityFloorZ))
  const innerTop = inner.map((point) => addVertex(point, params.heightMm))

  addPolygonFace(outer, outerBottom, triangles, true)
  addPolygonFace(inner, innerFloor, triangles, false)
  addTopAnnulus(outer, inner, outerTop, innerTop, triangles)

  for (let index = 0; index < outer.length; index += 1) {
    const next = (index + 1) % outer.length
    addQuad(outerBottom[index], outerBottom[next], outerTop[next], outerTop[index])
  }

  for (let index = 0; index < inner.length; index += 1) {
    const next = (index + 1) % inner.length
    addQuad(innerFloor[index], innerTop[next], innerFloor[next], innerFloor[index])
    addTriangle(innerFloor[index], innerTop[index], innerTop[next])
  }

  return { vertices, triangles }
}

export function meshToBufferGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(mesh.vertices.length * 3)
  mesh.vertices.forEach((vertex, index) => {
    positions[index * 3] = vertex.x
    positions[index * 3 + 1] = vertex.y
    positions[index * 3 + 2] = vertex.z
  })
  const indices = new Uint32Array(mesh.triangles.length * 3)
  mesh.triangles.forEach((triangle, index) => {
    indices[index * 3] = triangle[0]
    indices[index * 3 + 1] = triangle[1]
    indices[index * 3 + 2] = triangle[2]
  })
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function positionsToPreviewGeometry(positions: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function getMeshSize(mesh: MeshData): Size3 {
  const positions = new Float32Array(mesh.vertices.length * 3)
  mesh.vertices.forEach((vertex, index) => {
    positions[index * 3] = vertex.x
    positions[index * 3 + 1] = vertex.y
    positions[index * 3 + 2] = vertex.z
  })
  return measurePositions(positions)
}

function addTopAnnulus(
  outer: Point2[],
  inner: Point2[],
  outerIndices: number[],
  innerIndices: number[],
  triangles: Triangle[],
) {
  const hole = [...inner].reverse()
  const holeIndices = [...innerIndices].reverse()
  const faces = ShapeUtils.triangulateShape(toVector2List(outer), [toVector2List(hole)])
  const combined = [...outerIndices, ...holeIndices]
  faces.forEach((face) => {
    triangles.push([combined[face[0]], combined[face[1]], combined[face[2]]])
  })
}

function addPolygonFace(
  polygon: Point2[],
  indices: number[],
  triangles: Triangle[],
  reverse: boolean,
) {
  const faces = ShapeUtils.triangulateShape(toVector2List(polygon), [])
  faces.forEach((face) => {
    const triangle: Triangle = [indices[face[0]], indices[face[1]], indices[face[2]]]
    triangles.push(reverse ? [triangle[2], triangle[1], triangle[0]] : triangle)
  })
}

function roundedRectContour(length: number, width: number, radius: number, segments: number) {
  const halfLength = length / 2
  const halfWidth = width / 2
  const safeRadius = clamp(radius, 0, Math.min(halfLength, halfWidth) - 0.1)
  if (safeRadius <= EPSILON) {
    return [
      { x: halfLength, y: halfWidth },
      { x: -halfLength, y: halfWidth },
      { x: -halfLength, y: -halfWidth },
      { x: halfLength, y: -halfWidth },
    ]
  }

  const corners = [
    { cx: halfLength - safeRadius, cy: halfWidth - safeRadius, start: 0, end: Math.PI / 2 },
    { cx: -halfLength + safeRadius, cy: halfWidth - safeRadius, start: Math.PI / 2, end: Math.PI },
    { cx: -halfLength + safeRadius, cy: -halfWidth + safeRadius, start: Math.PI, end: (Math.PI * 3) / 2 },
    { cx: halfLength - safeRadius, cy: -halfWidth + safeRadius, start: (Math.PI * 3) / 2, end: Math.PI * 2 },
  ]

  return corners.flatMap((corner, cornerIndex) => {
    const points: Point2[] = []
    for (let step = 0; step <= segments; step += 1) {
      if (cornerIndex > 0 && step === 0) {
        continue
      }
      const t = step / segments
      const angle = corner.start + (corner.end - corner.start) * t
      points.push({
        x: corner.cx + Math.cos(angle) * safeRadius,
        y: corner.cy + Math.sin(angle) * safeRadius,
      })
    }
    return points
  })
}

function concaveHull(points: Point2[], smoothing: number): Point2[] | undefined {
  const unique = uniquePoints(points)
  if (unique.length < 4) {
    return unique
  }

  const center = centroid(unique)
  const binCount = Math.max(12, Math.min(96, smoothing))
  const bins = new Map<number, Point2>()

  unique.forEach((point) => {
    const angle = Math.atan2(point.y - center.y, point.x - center.x)
    const normalized = angle < 0 ? angle + Math.PI * 2 : angle
    const bin = Math.floor((normalized / (Math.PI * 2)) * binCount)
    const previous = bins.get(bin)
    if (!previous || distanceSquared(point, center) > distanceSquared(previous, center)) {
      bins.set(bin, point)
    }
  })

  const contour = [...bins.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, point]) => point)

  if (contour.length < 3 || Math.abs(signedArea(contour)) < 1) {
    return undefined
  }

  const cleaned = cleanPolygon(contour)
  return hasSelfIntersections(cleaned) ? undefined : cleaned
}

function convexHull(points: Point2[]): Point2[] {
  const sorted = uniquePoints(points).sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  if (sorted.length <= 3) {
    return sorted
  }

  const lower: Point2[] = []
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  })

  const upper: Point2[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function samplePointsFromPositions(positions: Float32Array, maxPoints: number): Point2[] {
  const stride = Math.max(1, Math.floor(positions.length / 3 / maxPoints))
  const points: Point2[] = []
  for (let index = 0; index < positions.length; index += stride * 3) {
    points.push({ x: positions[index], y: positions[index + 1] })
  }
  return points
}

function centerPositions(positions: Float32Array, bottomMm: number) {
  const bounds = getBounds(positions)
  const offsetX = (bounds.min.x + bounds.max.x) / 2
  const offsetY = (bounds.min.y + bounds.max.y) / 2
  const offsetZ = bounds.min.z
  const next = new Float32Array(positions.length)

  for (let index = 0; index < positions.length; index += 3) {
    next[index] = positions[index] - offsetX
    next[index + 1] = positions[index + 1] - offsetY
    next[index + 2] = positions[index + 2] - offsetZ + bottomMm
  }

  return next
}

function getBounds(positions: Float32Array) {
  const min: Point3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Point3 = { x: -Infinity, y: -Infinity, z: -Infinity }

  for (let index = 0; index < positions.length; index += 3) {
    min.x = Math.min(min.x, positions[index])
    min.y = Math.min(min.y, positions[index + 1])
    min.z = Math.min(min.z, positions[index + 2])
    max.x = Math.max(max.x, positions[index])
    max.y = Math.max(max.y, positions[index + 1])
    max.z = Math.max(max.z, positions[index + 2])
  }

  return { min, max }
}

function offsetPolygonRadial(points: Point2[], amount: number) {
  const center = centroid(points)
  return points.map((point) => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const length = Math.hypot(dx, dy) || 1
    return {
      x: point.x + (dx / length) * amount,
      y: point.y + (dy / length) * amount,
    }
  })
}

function cleanPolygon(points: Point2[]) {
  const cleaned: Point2[] = []
  points.forEach((point) => {
    const previous = cleaned[cleaned.length - 1]
    if (!previous || distance(previous, point) > 0.2) {
      cleaned.push(point)
    }
  })
  if (cleaned.length > 1 && distance(cleaned[0], cleaned[cleaned.length - 1]) < 0.2) {
    cleaned.pop()
  }
  return cleaned
}

function hasSelfIntersections(points: Point2[]) {
  for (let a = 0; a < points.length; a += 1) {
    const aNext = (a + 1) % points.length
    for (let b = a + 1; b < points.length; b += 1) {
      const bNext = (b + 1) % points.length
      if (a === b || aNext === b || bNext === a) {
        continue
      }
      if (segmentsIntersect(points[a], points[aNext], points[b], points[bNext])) {
        return true
      }
    }
  }
  return false
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2) {
  const d1 = direction(c, d, a)
  const d2 = direction(c, d, b)
  const d3 = direction(a, b, c)
  const d4 = direction(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function direction(a: Point2, b: Point2, c: Point2) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)
}

function uniquePoints(points: Point2[]) {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function ensureCounterClockwise(points: Point2[]) {
  return signedArea(points) < 0 ? [...points].reverse() : points
}

function signedArea(points: Point2[]) {
  return (
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length]
      return area + point.x * next.y - next.x * point.y
    }, 0) / 2
  )
}

function centroid(points: Point2[]) {
  return points.reduce(
    (center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  )
}

function cross(origin: Point2, a: Point2, b: Point2) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function distance(a: Point2, b: Point2) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distanceSquared(a: Point2, b: Point2) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function toVector2List(points: Point2[]) {
  return points.map((point) => new Vector2(point.x, point.y))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundMm(value: number) {
  return Math.round(value * 10) / 10
}

function roundMesh(value: number) {
  return Math.round(value * 1000) / 1000
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}
