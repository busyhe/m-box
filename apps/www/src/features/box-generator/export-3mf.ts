import { strToU8, zipSync } from 'fflate'
import type { MeshData } from './types'

export function create3mfBlob(mesh: MeshData, title = 'Storage Box') {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml()),
    '_rels/.rels': strToU8(rootRelationshipsXml()),
    '3D/3dmodel.model': strToU8(modelXml(mesh, title)),
  }

  return new Blob([zipSync(files)], { type: 'model/3mf' })
}

export function build3mfFileName(now = new Date()) {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `storage-box-${stamp}.3mf`
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`
}

function modelXml(mesh: MeshData, title: string) {
  const vertices = mesh.vertices
    .map(
      (vertex) =>
        `<vertex x="${formatNumber(vertex.x)}" y="${formatNumber(vertex.y)}" z="${formatNumber(vertex.z)}"/>`,
    )
    .join('')
  const triangles = mesh.triangles
    .map(
      (triangle) =>
        `<triangle v1="${triangle[0]}" v2="${triangle[1]}" v3="${triangle[2]}"/>`,
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="zh-CN" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${escapeXml(title)}</metadata>
  <metadata name="Designer">M-Box Generator</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>${vertices}</vertices>
        <triangles>${triangles}</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
