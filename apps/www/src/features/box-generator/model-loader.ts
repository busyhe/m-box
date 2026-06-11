import { BufferGeometry, Float32BufferAttribute, Mesh, Object3D, Vector3 } from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { DEFAULT_MODEL_TRANSFORM, type ModelFormat, type ParsedModel } from './types'
import { applyTransformToPositions, measurePositions } from './geometry'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export async function parseModelFile(file: File): Promise<ParsedModel> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('文件超过 50MB，请先简化模型或使用更小的导出文件。')
  }

  const format = detectFormat(file.name)
  const buffer = await file.arrayBuffer()
  const geometry =
    format === 'stl' ? parseStl(buffer) : await parse3mf(buffer)
  const rawPositions = getPositions(geometry)
  const transformed = applyTransformToPositions(rawPositions, DEFAULT_MODEL_TRANSFORM)
  const size = measurePositions(transformed)

  return {
    fileName: file.name,
    format,
    triangleCount: Math.floor(rawPositions.length / 9),
    sizeMm: size,
    transform: DEFAULT_MODEL_TRANSFORM,
    geometry,
    rawPositions,
  }
}

export function updateParsedModelTransform(
  model: ParsedModel,
  transform: ParsedModel['transform'],
): ParsedModel {
  const transformed = applyTransformToPositions(model.rawPositions, transform)

  return {
    ...model,
    transform,
    sizeMm: measurePositions(transformed),
  }
}

function detectFormat(fileName: string): ModelFormat {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.stl')) {
    return 'stl'
  }
  if (lower.endsWith('.3mf')) {
    return '3mf'
  }
  throw new Error('暂时只支持 STL 和 3MF 文件。')
}

function parseStl(buffer: ArrayBuffer) {
  const geometry = new STLLoader().parse(buffer)
  geometry.computeVertexNormals()
  return geometry
}

async function parse3mf(buffer: ArrayBuffer) {
  const group = new ThreeMFLoader().parse(buffer)
  group.updateMatrixWorld(true)
  const positions: number[] = []

  group.traverse((object: Object3D) => {
    if (!(object instanceof Mesh) || !object.geometry) {
      return
    }

    const source = object.geometry
    const position = source.getAttribute('position')
    const index = source.getIndex()
    const vertex = new Vector3()

    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        vertex.fromBufferAttribute(position, index.getX(i))
        vertex.applyMatrix4(object.matrixWorld)
        positions.push(vertex.x, vertex.y, vertex.z)
      }
    } else {
      for (let i = 0; i < position.count; i += 1) {
        vertex.fromBufferAttribute(position, i)
        vertex.applyMatrix4(object.matrixWorld)
        positions.push(vertex.x, vertex.y, vertex.z)
      }
    }
  })

  if (positions.length < 9) {
    throw new Error('3MF 文件中没有可用的三角网格。')
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function getPositions(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()

  if (!position) {
    throw new Error('模型缺少顶点数据。')
  }

  if (!index) {
    return new Float32Array(position.array)
  }

  const positions = new Float32Array(index.count * 3)
  for (let i = 0; i < index.count; i += 1) {
    const sourceIndex = index.getX(i)
    positions[i * 3] = position.getX(sourceIndex)
    positions[i * 3 + 1] = position.getY(sourceIndex)
    positions[i * 3 + 2] = position.getZ(sourceIndex)
  }
  return positions
}
