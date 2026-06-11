import type { BufferGeometry } from 'three'

export type ContourMode = 'concave' | 'convexFallback'

/** 镂空方式:contour = 跟随模型俯视轮廓,rect = 矩形内腔 */
export type CavityMode = 'contour' | 'rect'

export type BoxParams = {
  lengthMm: number
  widthMm: number
  heightMm: number
  wallMm: number
  bottomMm: number
  cornerRadiusMm: number
  clearanceXYMm: number
  clearanceZMm: number
  contourMode: ContourMode
  contourSmoothing: number
  cavityMode: CavityMode
  /** 镂空深度,自顶部开口向下计算;最大为 heightMm - bottomMm(通腔到底) */
  cavityDepthMm: number
}

/** 基础图形种类 */
export type ShapeKind =
  | 'circle'
  | 'rect'
  | 'hexagon'
  | 'ellipse'
  | 'slot'
  | 'triangle'
  | 'octagon'
  | 'diamond'

/** 无需上传模型即可添加的基础镂空图形 */
export type BasicShape = {
  id: string
  kind: ShapeKind
  /** 中心相对盒体中心的偏移 */
  xMm: number
  yMm: number
  /** 主尺寸:圆/六边形/八边形为直径,三角形为边长,矩形/椭圆/长圆槽/菱形为长 */
  sizeXMm: number
  /** 次尺寸:矩形/椭圆/长圆槽/菱形为宽(其余忽略) */
  sizeYMm: number
  /** rect 圆角(其余忽略) */
  cornerRadiusMm: number
  /** 镂空深度,自盒口向下 */
  depthMm: number
}

/** 一个镂空腔:轮廓 + 腔底高度 */
export type CavitySpec = {
  contour: Point2[]
  floorZ: number
}

export type ModelFormat = 'stl' | '3mf' | 'obj' | 'ply' | 'gltf' | 'glb' | 'amf'

export type ModelTransform = {
  scale: number
  rotateX: number
  rotateY: number
  rotateZ: number
}

export type UploadedModel = {
  fileName: string
  format: ModelFormat
  triangleCount: number
  sizeMm: Size3
  transform: ModelTransform
  /** 解析过程中的提示信息(如单位换算),非错误 */
  notes: string[]
}

export type ParsedModel = UploadedModel & {
  geometry: BufferGeometry
  rawPositions: Float32Array
}

export type Point2 = {
  x: number
  y: number
}

export type Point3 = Point2 & {
  z: number
}

export type Size3 = {
  x: number
  y: number
  z: number
}

export type Triangle = [number, number, number]

export type MeshData = {
  vertices: Point3[]
  triangles: Triangle[]
}

export type FootprintResult = {
  contour: Point2[]
  mode: ContourMode
  warnings: string[]
}

export type GenerationResult = {
  mesh: MeshData
  previewGeometry: BufferGeometry
  warnings: string[]
  export3mf: () => Promise<Blob>
}

// 参数范围参考市面常见消费级打印机打印体积:
// Bambu A1 mini 180³ / A1·P1·X1 256³ / Prusa MK4S 250×210×220
// Ender-3 系列 220×220×250 / Creality K1 Max 300³
export const PARAM_LIMITS = {
  lengthMm: { min: 20, max: 350, step: 1 },
  widthMm: { min: 20, max: 350, step: 1 },
  heightMm: { min: 10, max: 300, step: 1 },
  wallMm: { min: 0.8, max: 6, step: 0.2 },
  bottomMm: { min: 0.8, max: 6, step: 0.2 },
  cornerRadiusMm: { min: 0, max: 30, step: 0.5 },
  clearanceXYMm: { min: 0.2, max: 10, step: 0.1 },
  clearanceZMm: { min: 0.2, max: 20, step: 0.1 },
  contourSmoothing: { min: 12, max: 96, step: 4 },
  cavityDepthMm: { min: 2, max: 300, step: 0.5 },
} as const satisfies Partial<Record<keyof BoxParams, { min: number, max: number, step: number }>>

export const DEFAULT_BOX_PARAMS: BoxParams = {
  lengthMm: 80,
  widthMm: 60,
  heightMm: 35,
  wallMm: 2,
  bottomMm: 2,
  cornerRadiusMm: 4,
  clearanceXYMm: 2,
  clearanceZMm: 3,
  contourMode: 'concave',
  contourSmoothing: 32,
  cavityMode: 'contour',
  cavityDepthMm: 33,
}

export const DEFAULT_MODEL_TRANSFORM: ModelTransform = {
  scale: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
}
