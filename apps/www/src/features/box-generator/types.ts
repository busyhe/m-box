import type { BufferGeometry } from 'three'

export type ContourMode = 'concave' | 'convexFallback'

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
}

export type ModelFormat = 'stl' | '3mf'

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
}

export const DEFAULT_MODEL_TRANSFORM: ModelTransform = {
  scale: 1,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
}
