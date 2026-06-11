import { BufferGeometry, Float32BufferAttribute, Mesh, Object3D, Vector3 } from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js'
import { DEFAULT_MODEL_TRANSFORM, type ModelFormat, type ParsedModel } from './types'
import { applyTransformToPositions, measurePositions } from './geometry'

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export const SUPPORTED_MODEL_EXTENSIONS = [
  '.stl',
  '.3mf',
  '.obj',
  '.ply',
  '.gltf',
  '.glb',
  '.amf',
] as const

export const MODEL_FILE_ACCEPT = SUPPORTED_MODEL_EXTENSIONS.join(',')

export async function parseModelFile(file: File): Promise<ParsedModel> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('文件超过 50MB，请先简化模型或使用更小的导出文件。')
  }

  const format = detectFormat(file.name)
  const buffer = await file.arrayBuffer()
  const geometry = await parseGeometry(format, buffer)
  let rawPositions = getPositions(geometry)

  if (rawPositions.length < 9) {
    throw new Error('文件中没有可用的三角网格。')
  }

  const notes: string[] = []

  // glTF 规范单位为米;若模型极小,按毫米换算
  if ((format === 'gltf' || format === 'glb') && maxDimension(rawPositions) < 5) {
    rawPositions = scalePositions(rawPositions, 1000)
    notes.push('glTF 模型单位疑似为米，已自动按 1m = 1000mm 换算。')
  }

  if (maxDimension(rawPositions) < 1) {
    notes.push('模型尺寸极小（<1mm），请确认源文件单位为毫米。')
  }

  const transformed = applyTransformToPositions(rawPositions, DEFAULT_MODEL_TRANSFORM)
  const size = measurePositions(transformed)

  return {
    fileName: file.name,
    format,
    triangleCount: Math.floor(rawPositions.length / 9),
    sizeMm: size,
    transform: DEFAULT_MODEL_TRANSFORM,
    notes,
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
  const matched = SUPPORTED_MODEL_EXTENSIONS.find((extension) => lower.endsWith(extension))
  if (!matched) {
    throw new Error(`暂不支持该格式，请使用 ${SUPPORTED_MODEL_EXTENSIONS.join(' / ')} 文件。`)
  }
  return matched.slice(1) as ModelFormat
}

async function parseGeometry(format: ModelFormat, buffer: ArrayBuffer): Promise<BufferGeometry> {
  switch (format) {
    case 'stl': {
      const geometry = new STLLoader().parse(buffer)
      geometry.computeVertexNormals()
      return geometry
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(buffer)
      geometry.computeVertexNormals()
      return geometry
    }
    case 'obj': {
      const text = new TextDecoder().decode(buffer)
      return objectToGeometry(new OBJLoader().parse(text), 'OBJ 文件中没有可用的三角网格。')
    }
    case 'amf': {
      return objectToGeometry(new AMFLoader().parse(buffer), 'AMF 文件中没有可用的三角网格。')
    }
    case '3mf': {
      return objectToGeometry(new ThreeMFLoader().parse(buffer), '3MF 文件中没有可用的三角网格。')
    }
    case 'gltf':
    case 'glb': {
      const scene = await parseGltfScene(buffer)
      return objectToGeometry(scene, 'glTF 文件中没有可用的三角网格。')
    }
  }
}

function parseGltfScene(buffer: ArrayBuffer): Promise<Object3D> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      (gltf) => resolve(gltf.scene),
      () =>
        reject(
          new Error('glTF 解析失败。若模型引用外部资源或使用 Draco 压缩，请改用内嵌的 .glb 导出。'),
        ),
    )
  })
}

/** 遍历对象树,把所有网格顶点(应用世界变换后)合并为一个非索引几何体 */
function objectToGeometry(root: Object3D, emptyMessage: string): BufferGeometry {
  root.updateMatrixWorld(true)
  const positions: number[] = []
  const vertex = new Vector3()

  root.traverse((object: Object3D) => {
    if (!(object instanceof Mesh) || !object.geometry) {
      return
    }

    const source = object.geometry as BufferGeometry
    const position = source.getAttribute('position')
    if (!position) {
      return
    }
    const index = source.getIndex()

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
    throw new Error(emptyMessage)
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

function maxDimension(positions: Float32Array) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index])
    minY = Math.min(minY, positions[index + 1])
    minZ = Math.min(minZ, positions[index + 2])
    maxX = Math.max(maxX, positions[index])
    maxY = Math.max(maxY, positions[index + 1])
    maxZ = Math.max(maxZ, positions[index + 2])
  }

  return Math.max(maxX - minX, maxY - minY, maxZ - minZ)
}

function scalePositions(positions: Float32Array, factor: number) {
  const next = new Float32Array(positions.length)
  for (let index = 0; index < positions.length; index += 1) {
    next[index] = positions[index] * factor
  }
  return next
}
