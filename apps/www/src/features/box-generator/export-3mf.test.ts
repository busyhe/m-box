import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BOX_PARAMS } from './types'
import { create3mfBlob } from './export-3mf'
import { generateStorageBox } from './geometry'

describe('3MF export', () => {
  it('writes a core 3MF package with model mesh resources', async () => {
    const blob = create3mfBlob(generateStorageBox(DEFAULT_BOX_PARAMS), 'Test Box')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const files = unzipSync(bytes)
    const model = new TextDecoder().decode(files['3D/3dmodel.model'])

    expect(files['[Content_Types].xml']).toBeDefined()
    expect(files['_rels/.rels']).toBeDefined()
    expect(model).toContain('unit="millimeter"')
    expect(model).toContain('<object id="1" type="model">')
    expect(model).toContain('<vertices>')
    expect(model).toContain('<triangles>')
  })
})
