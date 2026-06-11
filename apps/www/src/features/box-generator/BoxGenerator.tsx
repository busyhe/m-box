import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Github,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Upload,
} from 'lucide-react'
import { ModeSwitcher } from '@/components/header/mode-switcher'
import { siteConfig } from '@/config/site'
import { Button } from '@workspace/ui/components/button'
import {
  DEFAULT_BOX_PARAMS,
  DEFAULT_MODEL_TRANSFORM,
  type BoxParams,
  type ParsedModel,
} from './types'
import {
  applyTransformToPositions,
  autoFitParamsForSize,
  clampBoxParams,
  createFootprint,
  generateStorageBox,
  positionsToPreviewGeometry,
} from './geometry'
import { build3mfFileName, create3mfBlob } from './export-3mf'
import { parseModelFile, updateParsedModelTransform } from './model-loader'
import { BoxPreview } from './BoxPreview'

type NumberControlProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}

export function BoxGenerator() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [params, setParams] = useState<BoxParams>(DEFAULT_BOX_PARAMS)
  const [model, setModel] = useState<ParsedModel | undefined>()
  const [status, setStatus] = useState('默认空盒已生成，可直接导出 3MF。')
  const [error, setError] = useState<string | undefined>()
  const [isParsing, setIsParsing] = useState(false)
  const [showModel, setShowModel] = useState(true)

  const transformedPositions = useMemo(
    () => (model ? applyTransformToPositions(model.rawPositions, model.transform) : undefined),
    [model],
  )

  const footprint = useMemo(
    () => createFootprint(transformedPositions, params),
    [params, transformedPositions],
  )

  const mesh = useMemo(
    () => generateStorageBox(params, footprint.contour),
    [params, footprint.contour],
  )

  const previewGeometry = useMemo(
    () => (transformedPositions ? positionsToPreviewGeometry(transformedPositions) : undefined),
    [transformedPositions],
  )

  const warnings = [...footprint.warnings]
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

  const handleUpload = async (file: File | undefined) => {
    if (!file) {
      return
    }

    setIsParsing(true)
    setError(undefined)
    setStatus('正在解析模型并计算收纳轮廓...')

    try {
      const parsed = await parseModelFile(file)
      setModel(parsed)
      setParams((current) => autoFitParamsForSize(current, parsed.sizeMm))
      setStatus('模型已导入，盒体尺寸已按模型外形和余量自适应。')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模型解析失败。')
      setStatus('上传失败，请检查文件格式或模型网格。')
    } finally {
      setIsParsing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const rotateModel = (axis: 'rotateX' | 'rotateY' | 'rotateZ') => {
    if (!model) {
      return
    }
    const transform = {
      ...model.transform,
      [axis]: (model.transform[axis] + 90) % 360,
    }
    const next = updateParsedModelTransform(model, transform)
    setModel(next)
    setParams((current) => autoFitParamsForSize(current, next.sizeMm))
    setStatus('模型朝向已更新，盒体尺寸和镂空轮廓已重新计算。')
  }

  const updateScale = (scale: number) => {
    if (!model) {
      return
    }
    const next = updateParsedModelTransform(model, { ...model.transform, scale })
    setModel(next)
    setParams((current) => autoFitParamsForSize(current, next.sizeMm))
    setStatus('模型缩放已更新，盒体尺寸已重新适配。')
  }

  const resetModelTransform = () => {
    if (!model) {
      return
    }
    const next = updateParsedModelTransform(model, DEFAULT_MODEL_TRANSFORM)
    setModel(next)
    setParams((current) => autoFitParamsForSize(current, next.sizeMm))
    setStatus('模型姿态已重置。')
  }

  const resetAll = () => {
    setParams(DEFAULT_BOX_PARAMS)
    setModel(undefined)
    setError(undefined)
    setStatus('默认空盒已生成，可直接导出 3MF。')
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
    setStatus('3MF 文件已生成。')
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
          <section className="order-1 flex-1 overflow-auto bg-secondary/60 p-4 sm:p-8 lg:min-h-[calc(100svh-3.5rem)] lg:p-10">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              <BoxPreview mesh={mesh} modelGeometry={previewGeometry} showModel={showModel} />
              {warnings.length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                  {warnings.join(' ')}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="order-2 w-full shrink-0 lg:w-80">
            <div className="space-y-4 p-4 lg:sticky lg:top-14 lg:max-h-[calc(100svh-3.5rem)] lg:overflow-auto lg:py-10 lg:pr-6">
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
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      M-Box
                    </p>
                    <h1 className="text-lg font-semibold leading-tight">3D 打印收纳盒生成器</h1>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <Box className="size-5 text-foreground" />
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  {error ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  )}
                  <span className={error ? 'text-destructive' : 'text-muted-foreground'}>
                    {error ?? status}
                  </span>
                </div>
                {model ? (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {model.fileName}
                    <br />
                    {model.format.toUpperCase()} · {model.triangleCount.toLocaleString()} triangles
                    <br />
                    {model.sizeMm.x} × {model.sizeMm.y} × {model.sizeMm.z} mm
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    当前为默认空盒。上传模型后会按模型俯视轮廓生成内腔。
                  </p>
                )}
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

              <section className="rounded-lg bg-secondary/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">模型姿态</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!model}
                    onClick={() => setShowModel((value) => !value)}
                  >
                    {showModel ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    预览
                  </Button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Button type="button" variant="outline" disabled={!model} onClick={() => rotateModel('rotateX')}>
                    <RotateCw className="size-4" />X
                  </Button>
                  <Button type="button" variant="outline" disabled={!model} onClick={() => rotateModel('rotateY')}>
                    <RotateCw className="size-4" />Y
                  </Button>
                  <Button type="button" variant="outline" disabled={!model} onClick={() => rotateModel('rotateZ')}>
                    <RotateCw className="size-4" />Z
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!model}
                    onClick={resetModelTransform}
                    title="重置姿态"
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[0.1, 1, 10, 25.4].map((scale) => (
                    <Button
                      key={scale}
                      type="button"
                      variant={model?.transform.scale === scale ? 'default' : 'outline'}
                      size="sm"
                      disabled={!model}
                      onClick={() => updateScale(scale)}
                    >
                      {scale}x
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}

function NumberControl({ label, value, min, max, step, unit = 'mm', onChange }: NumberControlProps) {
  const safeValue = Number.isFinite(value) ? value : min
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
            value={safeValue}
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
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-primary"
      />
    </label>
  )
}
