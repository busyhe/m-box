import { useMemo, useRef, useState } from 'react'
import {
  Box,
  Download,
  Github,
  Grid3X3,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { ModeSwitcher } from '@/components/header/mode-switcher'
import { siteConfig } from '@/config/site'
import { Button } from '@workspace/ui/components/button'
import {
  DEFAULT_BOX_PARAMS,
  DEFAULT_SQUARE_CUTOUTS,
  type BoxParams,
  type ParsedModel,
  type SquareCutoutParams,
} from './types'
import {
  applyTransformToPositions,
  autoFitParamsForSize,
  clampBoxParams,
  clampSquareCutoutParams,
  createFootprint,
  createSquareCutoutContours,
  generateStorageBox,
  positionsToPreviewGeometry,
} from './geometry'
import { build3mfFileName, create3mfBlob } from './export-3mf'
import { parseModelFile } from './model-loader'
import { BoxPreview } from './BoxPreview'

type NumberControlProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

export function BoxGenerator() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [params, setParams] = useState<BoxParams>(DEFAULT_BOX_PARAMS)
  const [model, setModel] = useState<ParsedModel | undefined>()
  const [uploadError, setUploadError] = useState<string | undefined>()
  const [isParsing, setIsParsing] = useState(false)
  const [squareCutouts, setSquareCutouts] = useState<SquareCutoutParams>(DEFAULT_SQUARE_CUTOUTS)

  const transformedPositions = useMemo(
    () => (model ? applyTransformToPositions(model.rawPositions, model.transform) : undefined),
    [model],
  )

  const footprint = useMemo(
    () => createFootprint(transformedPositions, params),
    [params, transformedPositions],
  )

  const squareCutoutResult = useMemo(
    () => createSquareCutoutContours(params, squareCutouts),
    [params, squareCutouts],
  )

  const cavityContours = useMemo(() => {
    if (model) {
      return [footprint.contour]
    }
    return squareCutouts.enabled ? squareCutoutResult.contours : [footprint.contour]
  }, [footprint.contour, model, squareCutoutResult.contours, squareCutouts.enabled])

  const mesh = useMemo(
    () => generateStorageBox(params, cavityContours),
    [params, cavityContours],
  )

  const previewGeometry = useMemo(
    () => (transformedPositions ? positionsToPreviewGeometry(transformedPositions) : undefined),
    [transformedPositions],
  )

  const warnings = [...footprint.warnings]
  if (uploadError) {
    warnings.push(uploadError)
  }
  if (!model && squareCutouts.enabled) {
    warnings.push(...squareCutoutResult.warnings)
  }
  if (model && model.triangleCount > 250_000) {
    warnings.push('模型超过 250k 三角面，建议先简化模型以提升交互速度。')
  }

  const updateParam = (key: keyof BoxParams, value: number) => {
    setParams((current) =>
      clampBoxParams({
        ...current,
        [key]: value,
      }),
    )
  }

  const updateSquareCutout = <Key extends keyof SquareCutoutParams>(
    key: Key,
    value: SquareCutoutParams[Key],
  ) => {
    setSquareCutouts((current) =>
      clampSquareCutoutParams({
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

  const resetAll = () => {
    setParams(DEFAULT_BOX_PARAMS)
    setModel(undefined)
    setUploadError(undefined)
    setSquareCutouts(DEFAULT_SQUARE_CUTOUTS)
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
            <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
              <span className="text-foreground">收纳盒生成</span>
              <span className="text-foreground/60">STL / 3MF</span>
            </nav>
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
              <BoxPreview mesh={mesh} modelGeometry={previewGeometry} showModel />
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
                >
                  <Upload className="size-4" />
                  上传
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
                  onClick={resetAll}
                  title="重置"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.3mf,model/stl,model/3mf"
                className="sr-only"
                onChange={(event) => void handleUpload(event.target.files?.[0])}
              />

              <section className="rounded-lg bg-secondary/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">无模型镂空</h2>
                  </div>
                  <Button
                    type="button"
                    variant={!model && squareCutouts.enabled ? 'default' : 'outline'}
                    size="sm"
                    disabled={!!model}
                    onClick={() => updateSquareCutout('enabled', !squareCutouts.enabled)}
                  >
                    方形阵列
                  </Button>
                </div>
                <div className="space-y-4">
                  <NumberControl
                    label="单格边长"
                    value={squareCutouts.sizeMm}
                    min={6}
                    max={80}
                    step={1}
                    disabled={!!model || !squareCutouts.enabled}
                    onChange={(value) => updateSquareCutout('sizeMm', value)}
                  />
                  <NumberControl
                    label="列数"
                    value={squareCutouts.columns}
                    min={1}
                    max={8}
                    step={1}
                    unit=""
                    disabled={!!model || !squareCutouts.enabled}
                    onChange={(value) => updateSquareCutout('columns', value)}
                  />
                  <NumberControl
                    label="行数"
                    value={squareCutouts.rows}
                    min={1}
                    max={8}
                    step={1}
                    unit=""
                    disabled={!!model || !squareCutouts.enabled}
                    onChange={(value) => updateSquareCutout('rows', value)}
                  />
                  <NumberControl
                    label="间距"
                    value={squareCutouts.gapMm}
                    min={0}
                    max={30}
                    step={1}
                    disabled={!!model || !squareCutouts.enabled}
                    onChange={(value) => updateSquareCutout('gapMm', value)}
                  />
                  <NumberControl
                    label="口沿圆角"
                    value={squareCutouts.cornerRadiusMm}
                    min={0}
                    max={12}
                    step={0.5}
                    disabled={!!model || !squareCutouts.enabled}
                    onChange={(value) => updateSquareCutout('cornerRadiusMm', value)}
                  />
                </div>
              </section>

              <section className="rounded-lg bg-secondary/60 p-4">
                <h2 className="mb-3 text-sm font-semibold">盒体尺寸</h2>
                <div className="space-y-4">
                  <NumberControl
                    label="长"
                    value={params.lengthMm}
                    min={20}
                    max={320}
                    step={1}
                    onChange={(value) => updateParam('lengthMm', value)}
                  />
                  <NumberControl
                    label="宽"
                    value={params.widthMm}
                    min={20}
                    max={260}
                    step={1}
                    onChange={(value) => updateParam('widthMm', value)}
                  />
                  <NumberControl
                    label="高"
                    value={params.heightMm}
                    min={10}
                    max={180}
                    step={1}
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
                    min={0.8}
                    max={8}
                    step={0.2}
                    onChange={(value) => updateParam('wallMm', value)}
                  />
                  <NumberControl
                    label="底厚"
                    value={params.bottomMm}
                    min={0.8}
                    max={8}
                    step={0.2}
                    onChange={(value) => updateParam('bottomMm', value)}
                  />
                  <NumberControl
                    label="圆角"
                    value={params.cornerRadiusMm}
                    min={0}
                    max={20}
                    step={0.5}
                    onChange={(value) => updateParam('cornerRadiusMm', value)}
                  />
                  <NumberControl
                    label="XY 余量"
                    value={params.clearanceXYMm}
                    min={0.2}
                    max={12}
                    step={0.1}
                    onChange={(value) => updateParam('clearanceXYMm', value)}
                  />
                  <NumberControl
                    label="Z 余量"
                    value={params.clearanceZMm}
                    min={0.2}
                    max={20}
                    step={0.1}
                    onChange={(value) => updateParam('clearanceZMm', value)}
                  />
                  <NumberControl
                    label="轮廓平滑"
                    value={params.contourSmoothing}
                    min={12}
                    max={96}
                    step={4}
                    unit=""
                    onChange={(value) => updateParam('contourSmoothing', value)}
                  />
                </div>
              </section>
            </div>
          </aside>
        </div>
      </main>
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
  disabled = false,
  onChange,
}: NumberControlProps) {
  const safeValue = Number.isFinite(value) ? value : min
  return (
    <label className={`grid gap-2 ${disabled ? 'opacity-50' : ''}`}>
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
            value={safeValue}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          {unit}
        </span>
      </div>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-primary"
      />
    </label>
  )
}
