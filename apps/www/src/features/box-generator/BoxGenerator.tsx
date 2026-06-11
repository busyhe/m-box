import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Circle,
  Diamond,
  Download,
  Eye,
  EyeOff,
  Github,
  Hexagon,
  Octagon,
  RectangleHorizontal,
  RefreshCw,
  Square,
  Trash2,
  Triangle,
  Upload,
} from 'lucide-react'
import { ModeSwitcher } from '@/components/header/mode-switcher'
import { siteConfig } from '@/config/site'
import { Button } from '@workspace/ui/components/button'
import {
  DEFAULT_BOX_PARAMS,
  PARAM_LIMITS,
  type BasicShape,
  type BoxParams,
  type CavitySpec,
  type ParsedModel,
  type ShapeKind,
} from './types'
import {
  applyTransformToPositions,
  autoFitParamsForSize,
  cavitiesOverlapAny,
  clampBoxParams,
  createFootprint,
  createShapeCavities,
  findShapePlacement,
  generateStorageBox,
  positionsToPreviewGeometry,
} from './geometry'
import { build3mfFileName, create3mfBlob } from './export-3mf'
import {
  MODEL_FILE_ACCEPT,
  SUPPORTED_MODEL_EXTENSIONS,
  parseModelFile,
  updateParsedModelTransform,
} from './model-loader'
import { BoxPreview } from './BoxPreview'

const PARAMS_STORAGE_KEY = 'm-box:box-params:v1'

const NUMERIC_PARAM_KEYS = [
  'lengthMm',
  'widthMm',
  'heightMm',
  'wallMm',
  'bottomMm',
  'cornerRadiusMm',
  'clearanceXYMm',
  'clearanceZMm',
  'contourSmoothing',
  'cavityDepthMm',
] as const

/** 从本地缓存读取参数;逐字段校验并钳制,缓存损坏时返回 undefined */
function loadStoredParams(): BoxParams | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    const raw = window.localStorage.getItem(PARAMS_STORAGE_KEY)
    if (!raw) {
      return undefined
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined
    }
    const record = parsed as Record<string, unknown>
    const merged: BoxParams = { ...DEFAULT_BOX_PARAMS }
    NUMERIC_PARAM_KEYS.forEach((key) => {
      const value = record[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        merged[key] = value
      }
    })
    if (record.cavityMode === 'rect' || record.cavityMode === 'contour') {
      merged.cavityMode = record.cavityMode
    }
    return clampBoxParams(merged)
  } catch {
    return undefined
  }
}

const SUPPORTED_FORMATS_LABEL = SUPPORTED_MODEL_EXTENSIONS.map((extension) =>
  extension.slice(1).toUpperCase(),
).join(' · ')

const SHAPES_STORAGE_KEY = 'm-box:shapes:v1'

const SHAPE_KINDS: ShapeKind[] = [
  'circle',
  'rect',
  'hexagon',
  'ellipse',
  'slot',
  'triangle',
  'octagon',
  'diamond',
]

const SHAPE_LABELS: Record<ShapeKind, string> = {
  circle: '圆形',
  rect: '矩形',
  hexagon: '六边形',
  ellipse: '椭圆',
  slot: '长圆槽',
  triangle: '三角形',
  octagon: '八边形',
  diamond: '菱形',
}

/** 每种图形的尺寸控件配置 */
const SHAPE_DIMENSIONS: Record<ShapeKind, { xLabel: string, yLabel?: string, corner?: boolean }> = {
  circle: { xLabel: '直径' },
  rect: { xLabel: '长', yLabel: '宽', corner: true },
  hexagon: { xLabel: '直径' },
  ellipse: { xLabel: '长径', yLabel: '短径' },
  slot: { xLabel: '长', yLabel: '宽' },
  triangle: { xLabel: '边长' },
  octagon: { xLabel: '直径' },
  diamond: { xLabel: '长', yLabel: '宽' },
}

const SHAPE_DEFAULT_SIZES: Record<ShapeKind, { x: number, y: number }> = {
  circle: { x: 20, y: 20 },
  rect: { x: 30, y: 20 },
  hexagon: { x: 24, y: 24 },
  ellipse: { x: 30, y: 18 },
  slot: { x: 40, y: 12 },
  triangle: { x: 26, y: 26 },
  octagon: { x: 24, y: 24 },
  diamond: { x: 30, y: 18 },
}

function shapeIcon(kind: ShapeKind) {
  switch (kind) {
    case 'circle':
      return <Circle className="size-3.5" />
    case 'rect':
      return <Square className="size-3.5" />
    case 'hexagon':
      return <Hexagon className="size-3.5" />
    case 'ellipse':
      return <Circle className="size-3.5 scale-y-75" />
    case 'slot':
      return <RectangleHorizontal className="size-3.5" />
    case 'triangle':
      return <Triangle className="size-3.5" />
    case 'octagon':
      return <Octagon className="size-3.5" />
    case 'diamond':
      return <Diamond className="size-3.5" />
  }
}

function createShapeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 从本地缓存读取基础图形列表;逐项校验,损坏时返回 undefined */
function loadStoredShapes(): BasicShape[] | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    const raw = window.localStorage.getItem(SHAPES_STORAGE_KEY)
    if (!raw) {
      return undefined
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return undefined
    }
    const toNumber = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback
    const shapes: BasicShape[] = []
    parsed.forEach((item) => {
      if (typeof item !== 'object' || item === null) {
        return
      }
      const record = item as Record<string, unknown>
      if (!SHAPE_KINDS.includes(record.kind as ShapeKind)) {
        return
      }
      shapes.push({
        id: typeof record.id === 'string' ? record.id : createShapeId(),
        kind: record.kind as ShapeKind,
        xMm: toNumber(record.xMm, 0),
        yMm: toNumber(record.yMm, 0),
        sizeXMm: toNumber(record.sizeXMm, 20),
        sizeYMm: toNumber(record.sizeYMm, 20),
        cornerRadiusMm: toNumber(record.cornerRadiusMm, 2),
        depthMm: toNumber(record.depthMm, 20),
      })
    })
    return shapes
  } catch {
    return undefined
  }
}

type NumberControlProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  /** 滑杆使用对数刻度,适合缩放类参数,使放大/缩小行程对称 */
  logarithmic?: boolean
  onChange: (value: number) => void
}

export function BoxGenerator() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [params, setParams] = useState<BoxParams>(DEFAULT_BOX_PARAMS)
  const [model, setModel] = useState<ParsedModel | undefined>()
  const [uploadError, setUploadError] = useState<string | undefined>()
  const [isParsing, setIsParsing] = useState(false)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [showModel, setShowModel] = useState(true)
  const [shapes, setShapes] = useState<BasicShape[]>([])
  const storageReadyRef = useRef(false)

  // 挂载后读取本地缓存(避免 SSR 水合不一致)
  useEffect(() => {
    const stored = loadStoredParams()
    if (stored) {
      setParams(stored)
    }
    const storedShapes = loadStoredShapes()
    if (storedShapes && storedShapes.length > 0) {
      setShapes(storedShapes)
    }
    storageReadyRef.current = true
  }, [])

  // 基础图形变化时写入本地缓存
  useEffect(() => {
    if (!storageReadyRef.current || typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(SHAPES_STORAGE_KEY, JSON.stringify(shapes))
    } catch {
      // 写入失败忽略
    }
  }, [shapes])

  // 参数变化时写入本地缓存
  useEffect(() => {
    if (!storageReadyRef.current || typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(params))
    } catch {
      // 隐私模式等场景下写入失败,忽略即可
    }
  }, [params])

  // 模型预览底面贴合腔底(高度 - 镂空深度)
  const cavityFloorZ = Math.max(params.bottomMm, params.heightMm - params.cavityDepthMm)

  const transformedPositions = useMemo(
    () =>
      model
        ? applyTransformToPositions(model.rawPositions, model.transform, cavityFloorZ)
        : undefined,
    [model, cavityFloorZ],
  )

  const footprint = useMemo(
    () => createFootprint(transformedPositions, params),
    [params, transformedPositions],
  )

  const shapeResult = useMemo(() => createShapeCavities(shapes, params), [shapes, params])

  const cavities = useMemo(() => {
    const list: CavitySpec[] = []
    if (model && footprint.contour.length >= 3) {
      list.push({ contour: footprint.contour, floorZ: cavityFloorZ })
    }
    list.push(...shapeResult.cavities)
    return list
  }, [model, footprint.contour, cavityFloorZ, shapeResult.cavities])

  const mesh = useMemo(
    () => generateStorageBox(params, cavities.length > 0 ? cavities : undefined),
    [params, cavities],
  )

  const previewGeometry = useMemo(
    () => (transformedPositions ? positionsToPreviewGeometry(transformedPositions) : undefined),
    [transformedPositions],
  )

  const warnings = [...footprint.warnings, ...shapeResult.warnings]
  if (cavities.length > 1 && cavitiesOverlapAny(cavities)) {
    warnings.push('镂空区域存在重叠，请调整图形位置或尺寸。')
  }
  if (uploadError) {
    warnings.push(uploadError)
  }
  if (model) {
    warnings.push(...model.notes)
    if (model.sizeMm.z + params.clearanceZMm > params.cavityDepthMm + 0.05) {
      warnings.push('镂空深度小于模型高度加 Z 余量，模型将高出盒口。')
    }
  }
  if (model && model.triangleCount > 250_000) {
    warnings.push('模型超过 250k 三角面，建议先简化模型以提升交互速度。')
  }
  if (model) {
    const neededLength = model.sizeMm.x + params.wallMm * 2 + params.clearanceXYMm * 2
    const neededWidth = model.sizeMm.y + params.wallMm * 2 + params.clearanceXYMm * 2
    const neededHeight = model.sizeMm.z + params.bottomMm + params.clearanceZMm
    if (
      neededLength > PARAM_LIMITS.lengthMm.max
      || neededWidth > PARAM_LIMITS.widthMm.max
      || neededHeight > PARAM_LIMITS.heightMm.max
    ) {
      warnings.push(
        `模型加余量超出 ${PARAM_LIMITS.lengthMm.max}×${PARAM_LIMITS.widthMm.max}×${PARAM_LIMITS.heightMm.max}mm 上限，盒体尺寸已被截断，可能无法完整容纳模型。`,
      )
    }
  }

  const updateParam = (key: keyof BoxParams, value: number) => {
    setParams((current) =>
      clampBoxParams({
        ...current,
        [key]: value,
      }),
    )
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) {
      return
    }

    setIsParsing(true)
    setUploadError(undefined)

    try {
      const parsed = await parseModelFile(file)
      setModel(parsed)
      setParams((current) => autoFitParamsForSize(current, parsed.sizeMm))
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : '模型解析失败，请检查文件格式或模型网格。')
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const setCavityMode = (cavityMode: BoxParams['cavityMode']) => {
    setParams((current) => ({ ...current, cavityMode }))
  }

  const setModelScalePercent = (percent: number) => {
    if (!model) {
      return
    }
    const scale = Math.min(1000, Math.max(10, percent)) / 100
    const next = updateParsedModelTransform(model, { ...model.transform, scale })
    setModel(next)
    // 缩放后按新包围盒自动重新适配盒体尺寸
    setParams((current) => autoFitParamsForSize(current, next.sizeMm))
  }

  const refitToModel = () => {
    if (model) {
      setParams((current) => autoFitParamsForSize(current, model.sizeMm))
    }
  }

  const removeModel = () => {
    setModel(undefined)
    setUploadError(undefined)
    setShowModel(true)
  }

  const addShape = (kind: ShapeKind) => {
    const maxDepth = Math.max(2, params.heightMm - params.bottomMm)
    const defaults = SHAPE_DEFAULT_SIZES[kind]
    const prototype: BasicShape = {
      id: createShapeId(),
      kind,
      xMm: 0,
      yMm: 0,
      sizeXMm: defaults.x,
      sizeYMm: defaults.y,
      cornerRadiusMm: 2,
      depthMm: Math.min(params.cavityDepthMm, maxDepth),
    }
    // 已有镂空时自动寻找不重叠的位置;实在放不下则回退到中心
    const placement = cavities.length > 0 ? findShapePlacement(prototype, cavities, params) : undefined
    setShapes((current) => [
      ...current,
      { ...prototype, xMm: placement?.x ?? 0, yMm: placement?.y ?? 0 },
    ])
  }

  const updateShape = (id: string, patch: Partial<BasicShape>) => {
    setShapes((current) =>
      current.map((shape) => (shape.id === id ? { ...shape, ...patch } : shape)),
    )
  }

  const removeShape = (id: string) => {
    setShapes((current) => current.filter((shape) => shape.id !== id))
  }

  const resetAll = () => {
    setParams(DEFAULT_BOX_PARAMS)
    setModel(undefined)
    setUploadError(undefined)
    setShowModel(true)
    setShapes([])
    setConfirmResetOpen(false)
  }

  const export3mf = () => {
    const blob = create3mfBlob(mesh, 'M-Box storage box')
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = build3mfFileName()
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-grid sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-sm border bg-muted">
                <Box className="size-4" />
              </span>
              <span className="font-bold">M-Box</span>
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 px-0">
                <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  <Github className="size-4" />
                  <span className="sr-only">GitHub</span>
                </a>
              </Button>
              <ModeSwitcher />
            </div>
          </div>
        </div>
      </header>

      <main className="container-wrapper flex flex-1 flex-col">
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <section className="relative order-1 h-[52svh] min-h-[360px] flex-1 overflow-hidden bg-secondary/60 lg:h-auto lg:min-h-[calc(100svh-3.5rem)]">
            <div className="absolute inset-0">
              <BoxPreview
                mesh={mesh}
                modelGeometry={previewGeometry}
                showModel={showModel}
                translucent={shapes.length > 0}
              />
            </div>
            {warnings.length > 0 ? (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 rounded-md border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-sm backdrop-blur dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
                {warnings.join(' ')}
              </div>
            ) : null}
          </section>

          <aside className="order-2 w-full shrink-0 lg:w-80">
            <div className="space-y-4 p-4 lg:sticky lg:top-14 lg:max-h-[calc(100svh-3.5rem)] lg:overflow-auto lg:pr-6">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 gap-2 bg-background"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  title={`支持 ${SUPPORTED_FORMATS_LABEL}`}
                >
                  <Upload className="size-4" />
                  {isParsing ? '解析中…' : '上传'}
                </Button>
                <Button
                  type="button"
                  className="h-10 flex-1 gap-2 bg-[#0f172a] text-white hover:bg-[#0f172a]/90"
                  onClick={export3mf}
                  disabled={isParsing}
                >
                  <Download className="size-4" />
                  导出
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 bg-background"
                  onClick={() => setConfirmResetOpen(true)}
                  title="重置"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                支持 {SUPPORTED_FORMATS_LABEL}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={MODEL_FILE_ACCEPT}
                className="sr-only"
                onChange={(event) => void handleUpload(event.target.files?.[0])}
              />

              {model ? (
                <section className="rounded-lg bg-secondary/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">已上传模型</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowModel((current) => !current)}
                      title={showModel ? '隐藏模型，仅查看盒体' : '显示模型'}
                    >
                      {showModel ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      <span className="sr-only">{showModel ? '隐藏模型' : '显示模型'}</span>
                    </Button>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="truncate text-foreground" title={model.fileName}>
                      {model.fileName}
                    </p>
                    <p>
                      包围盒 {model.sizeMm.x} × {model.sizeMm.y} × {model.sizeMm.z} mm
                    </p>
                    <p>{model.triangleCount.toLocaleString()} 三角面</p>
                  </div>
                  <div className="mt-3">
                    <NumberControl
                      label="缩放"
                      value={Math.round(model.transform.scale * 1000) / 10}
                      min={10}
                      max={1000}
                      step={1}
                      unit="%"
                      logarithmic
                      onChange={setModelScalePercent}
                    />
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[50, 100, 200, 400].map((percent) => (
                        <Button
                          key={percent}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 bg-background px-0 text-xs"
                          onClick={() => setModelScalePercent(percent)}
                        >
                          {percent}%
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-background"
                      onClick={refitToModel}
                    >
                      按模型适配尺寸
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-background"
                      onClick={removeModel}
                    >
                      移除模型
                    </Button>
                  </div>
                </section>
              ) : null}

              <section className="rounded-lg bg-secondary/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">基础图形</h2>
                <div className="grid grid-cols-3 gap-2">
                  {SHAPE_KINDS.map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 bg-background"
                      onClick={() => addShape(kind)}
                    >
                      {shapeIcon(kind)}
                      {SHAPE_LABELS[kind]}
                    </Button>
                  ))}
                </div>
                {shapes.map((shape, index) => {
                  const dimensions = SHAPE_DIMENSIONS[shape.kind]
                  return (
                    <div key={shape.id} className="mt-3 rounded-md border bg-background/60 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {shapeIcon(shape.kind)}
                          {SHAPE_LABELS[shape.kind]} {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeShape(shape.id)}
                          title="删除图形"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除图形</span>
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <NumberControl
                          label={dimensions.xLabel}
                          value={shape.sizeXMm}
                          min={4}
                          max={340}
                          step={0.5}
                          onChange={(value) => updateShape(shape.id, { sizeXMm: value })}
                        />
                        {dimensions.yLabel ? (
                          <NumberControl
                            label={dimensions.yLabel}
                            value={shape.sizeYMm}
                            min={4}
                            max={340}
                            step={0.5}
                            onChange={(value) => updateShape(shape.id, { sizeYMm: value })}
                          />
                        ) : null}
                        {dimensions.corner ? (
                          <NumberControl
                            label="圆角"
                            value={shape.cornerRadiusMm}
                            min={0}
                            max={Math.min(shape.sizeXMm, shape.sizeYMm) / 2}
                            step={0.5}
                            onChange={(value) => updateShape(shape.id, { cornerRadiusMm: value })}
                          />
                        ) : null}
                        <NumberControl
                          label="深度"
                          value={shape.depthMm}
                          min={2}
                          max={Math.max(2, Math.round((params.heightMm - params.bottomMm) * 10) / 10)}
                          step={0.5}
                          onChange={(value) => updateShape(shape.id, { depthMm: value })}
                        />
                        <NumberControl
                          label="X 位置"
                          value={shape.xMm}
                          min={Math.round(-params.lengthMm / 2)}
                          max={Math.round(params.lengthMm / 2)}
                          step={0.5}
                          onChange={(value) => updateShape(shape.id, { xMm: value })}
                        />
                        <NumberControl
                          label="Y 位置"
                          value={shape.yMm}
                          min={Math.round(-params.widthMm / 2)}
                          max={Math.round(params.widthMm / 2)}
                          step={0.5}
                          onChange={(value) => updateShape(shape.id, { yMm: value })}
                        />
                      </div>
                    </div>
                  )
                })}
              </section>

              <section className="rounded-lg bg-secondary/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">盒体尺寸</h2>
                <div className="space-y-4">
                  <NumberControl
                    label="长"
                    value={params.lengthMm}
                    {...PARAM_LIMITS.lengthMm}
                    onChange={(value) => updateParam('lengthMm', value)}
                  />
                  <NumberControl
                    label="宽"
                    value={params.widthMm}
                    {...PARAM_LIMITS.widthMm}
                    onChange={(value) => updateParam('widthMm', value)}
                  />
                  <NumberControl
                    label="高"
                    value={params.heightMm}
                    {...PARAM_LIMITS.heightMm}
                    onChange={(value) => updateParam('heightMm', value)}
                  />
                </div>
              </section>

              <section className="rounded-lg bg-secondary/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">打印参数</h2>
                <div className="space-y-4">
                  <NumberControl
                    label="壁厚"
                    value={params.wallMm}
                    {...PARAM_LIMITS.wallMm}
                    onChange={(value) => updateParam('wallMm', value)}
                  />
                  <NumberControl
                    label="底厚"
                    value={params.bottomMm}
                    {...PARAM_LIMITS.bottomMm}
                    onChange={(value) => updateParam('bottomMm', value)}
                  />
                  <NumberControl
                    label="圆角"
                    value={params.cornerRadiusMm}
                    {...PARAM_LIMITS.cornerRadiusMm}
                    onChange={(value) => updateParam('cornerRadiusMm', value)}
                  />
                </div>
              </section>

              <section className="rounded-lg bg-secondary/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">镂空设置</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={params.cavityMode === 'contour' ? 'default' : 'outline'}
                      className={params.cavityMode === 'contour' ? '' : 'bg-background'}
                      onClick={() => setCavityMode('contour')}
                      disabled={!model}
                    >
                      跟随模型轮廓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={params.cavityMode === 'rect' ? 'default' : 'outline'}
                      className={params.cavityMode === 'rect' ? '' : 'bg-background'}
                      onClick={() => setCavityMode('rect')}
                    >
                      矩形内腔
                    </Button>
                  </div>
                  
                  <NumberControl
                    label="镂空深度"
                    value={params.cavityDepthMm}
                    min={PARAM_LIMITS.cavityDepthMm.min}
                    max={Math.max(
                      PARAM_LIMITS.cavityDepthMm.min,
                      Math.round((params.heightMm - params.bottomMm) * 10) / 10,
                    )}
                    step={PARAM_LIMITS.cavityDepthMm.step}
                    onChange={(value) => updateParam('cavityDepthMm', value)}
                  />
                  <NumberControl
                    label="XY 余量"
                    value={params.clearanceXYMm}
                    {...PARAM_LIMITS.clearanceXYMm}
                    onChange={(value) => updateParam('clearanceXYMm', value)}
                  />
                  <NumberControl
                    label="Z 余量"
                    value={params.clearanceZMm}
                    {...PARAM_LIMITS.clearanceZMm}
                    onChange={(value) => updateParam('clearanceZMm', value)}
                  />
                  <NumberControl
                    label="轮廓平滑"
                    value={params.contourSmoothing}
                    {...PARAM_LIMITS.contourSmoothing}
                    unit=""
                    onChange={(value) => updateParam('contourSmoothing', value)}
                  />
                </div>
              </section>

            </div>
          </aside>
        </div>
      </main>

      {confirmResetOpen ? (
        <ConfirmDialog
          title="重置所有设置？"
          description="将恢复默认参数，并移除已上传的模型。此操作无法撤销。"
          confirmLabel="重置"
          cancelLabel="取消"
          onConfirm={resetAll}
          onCancel={() => setConfirmResetOpen(false)}
        />
      ) : null}
    </div>
  )
}

type ConfirmDialogProps = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="destructive"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function NumberControl({
  label,
  value,
  min,
  max,
  step,
  unit = 'mm',
  logarithmic = false,
  onChange,
}: NumberControlProps) {
  const safeValue = Number.isFinite(value) ? value : min

  const sliderMin = logarithmic ? Math.log10(min) : min
  const sliderMax = logarithmic ? Math.log10(max) : max
  const sliderStep = logarithmic ? (sliderMax - sliderMin) / 200 : step
  const sliderValue = logarithmic
    ? Math.log10(Math.min(max, Math.max(min, safeValue)))
    : safeValue

  const handleSliderChange = (raw: number) => {
    if (!logarithmic) {
      onChange(raw)
      return
    }
    const scaled = 10 ** raw
    // 按 step 精度取整,避免出现 153.27% 这类零碎数值
    onChange(Math.min(max, Math.max(min, Math.round(scaled / step) * step)))
  }
  // 输入草稿:输入过程中不钳制数值,失焦或回车后再提交,
  // 避免输入“150”时键入“1”被立即吸附到最小值。
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const commit = (raw: string) => {
    setDraft(null)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return
    }
    onChange(Math.min(max, Math.max(min, parsed)))
  }

  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm tabular-nums">
          <input
            aria-label={label}
            className="w-16 bg-transparent text-right outline-none"
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft ?? safeValue}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                setDraft(null)
              }
            }}
          />
          {unit}
        </span>
      </div>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderValue}
        onChange={(event) => handleSliderChange(Number(event.target.value))}
        className="h-2 w-full accent-primary"
      />
    </label>
  )
}
