import { describe, expect, it } from 'vitest'
import { DEFAULT_BOX_PARAMS, DEFAULT_SQUARE_CUTOUTS } from './types'
import {
  autoFitParamsForSize,
  createFootprint,
  createSquareCutoutContours,
  generateStorageBox,
  getMeshSize,
} from './geometry'

describe('box geometry', () => {
  it('generates a printable default open box mesh', () => {
    const mesh = generateStorageBox(DEFAULT_BOX_PARAMS)
    const size = getMeshSize(mesh)

    expect(mesh.vertices.length).toBeGreaterThan(20)
    expect(mesh.triangles.length).toBeGreaterThan(20)
    expect(size).toEqual({ x: 80, y: 60, z: 35 })
  })

  it('auto-fits the box to uploaded model dimensions and clearance', () => {
    const params = autoFitParamsForSize(DEFAULT_BOX_PARAMS, { x: 42, y: 24, z: 18 })

    expect(params.lengthMm).toBe(50)
    expect(params.widthMm).toBe(32)
    expect(params.heightMm).toBe(23)
  })

  it('falls back to an empty-box rounded rectangle when no upload exists', () => {
    const footprint = createFootprint(undefined, DEFAULT_BOX_PARAMS)

    expect(footprint.mode).toBe('concave')
    expect(footprint.contour.length).toBeGreaterThan(4)
    expect(footprint.warnings).toEqual([])
  })

  it('generates multiple square cutouts when no model is uploaded', () => {
    const cutouts = createSquareCutoutContours(DEFAULT_BOX_PARAMS, {
      ...DEFAULT_SQUARE_CUTOUTS,
      enabled: true,
      columns: 3,
      rows: 2,
    })
    const mesh = generateStorageBox(DEFAULT_BOX_PARAMS, cutouts.contours)
    const size = getMeshSize(mesh)

    expect(cutouts.contours).toHaveLength(6)
    expect(mesh.vertices.length).toBeGreaterThan(60)
    expect(size).toEqual({ x: 80, y: 60, z: 35 })
  })
})
