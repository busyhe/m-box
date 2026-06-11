import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Box,
  Download,
  Github,
  Ruler,
  ScanLine,
  Shapes,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { ModeSwitcher } from '@/components/header/mode-switcher'
import { siteConfig } from '@/config/site'
import { Button } from '@workspace/ui/components/button'

/** 粒子星座背景:点 + 近距连线,颜色取主题色,自动适配明暗模式 */
function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    type Particle = { x: number, y: number, vx: number, vy: number, r: number }

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let raf = 0
    let running = true

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(80, Math.max(24, Math.floor((width * height) / 18000)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
      }))
    }

    const themeColor = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
      return value || '#3b82f6'
    }

    const linkDistance = 110

    const step = () => {
      if (!running) {
        return
      }
      ctx.clearRect(0, 0, width, height)
      const color = themeColor()

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > width) {
          p.vx *= -1
        }
        if (p.y < 0 || p.y > height) {
          p.vy *= -1
        }
      }

      ctx.fillStyle = color
      for (const p of particles) {
        ctx.globalAlpha = 0.45
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = color
      ctx.lineWidth = 1
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        if (!a) {
          continue
        }
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          if (!b) {
            continue
          }
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distSq = dx * dx + dy * dy
          if (distSq < linkDistance * linkDistance) {
            ctx.globalAlpha = 0.12 * (1 - Math.sqrt(distSq) / linkDistance)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(step)
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(step)
      }
    }

    resize()
    raf = requestAnimationFrame(step)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/** 进入视口时触发淡入上移动画 */
function Reveal({ children, delay = 0, className = '' }: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${visible ? 'animate-fade-in-up' : 'opacity-0'} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/** 悬浮的等距收纳盒插画 */
function HeroIllustration() {
  return (
    <div className="animate-float relative mx-auto w-full max-w-md">
      <div className="animate-glow absolute inset-0 -z-10 rounded-full bg-primary/25 blur-3xl" />
      <svg viewBox="0 0 320 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* 盒体外壁 */}
        <path d="M160 40 280 100v90L160 250 40 190v-90L160 40Z" className="fill-card stroke-border" strokeWidth="2" />
        {/* 顶面 */}
        <path d="M160 40 280 100 160 160 40 100 160 40Z" className="fill-secondary stroke-border" strokeWidth="2" />
        {/* 内腔 */}
        <path d="M160 64 244 106 160 148 76 106 160 64Z" className="fill-background stroke-border" strokeWidth="1.5" />
        {/* 镂空槽位 */}
        <ellipse cx="122" cy="100" rx="22" ry="11" className="fill-primary/15 stroke-primary/60" strokeWidth="1.5" />
        <ellipse cx="196" cy="112" rx="26" ry="9" className="fill-primary/15 stroke-primary/60" strokeWidth="1.5" />
        <ellipse cx="160" cy="84" rx="14" ry="7" className="fill-primary/15 stroke-primary/60" strokeWidth="1.5" />
        {/* 左右侧面投影 */}
        <path d="M40 100v90l120 60v-90L40 100Z" className="fill-secondary/70" />
        <path d="M280 100v90l-120 60v-90l120-60Z" className="fill-secondary/40" />
        {/* 棱线 */}
        <path d="M160 160v90M40 100l120 60 120-60" className="stroke-border" strokeWidth="2" />
      </svg>
    </div>
  )
}

const FEATURES = [
  {
    icon: <Upload />,
    title: '模型导入',
    description: '拖入 STL / 3MF 模型，自动解析包围盒并适配盒体尺寸，无需手动测量。',
  },
  {
    icon: <ScanLine />,
    title: '轮廓跟随镂空',
    description: '按模型实际轮廓生成贴合内腔，支持 XY / Z 余量与平滑度精细控制。',
  },
  {
    icon: <Shapes />,
    title: '基础图形内腔',
    description: '圆形、矩形、六边形等八种图形自由组合，自动避让已有镂空区域。',
  },
  {
    icon: <Ruler />,
    title: '参数化设计',
    description: '尺寸、壁厚、圆角全部可调，实时 3D 预览，所见即所得。',
  },
  {
    icon: <Download />,
    title: '一键导出 3MF',
    description: '导出标准 3MF 文件，直接进切片软件打印，零格式转换。',
  },
  {
    icon: <ShieldCheck />,
    title: '本地运行',
    description: '所有计算在浏览器内完成，模型文件不上传服务器，隐私无忧。',
  },
]

const STEPS = [
  { step: '01', title: '上传模型或添加图形', description: '导入要收纳的 STL / 3MF 模型，或直接用基础图形规划格位。' },
  { step: '02', title: '调整盒体参数', description: '设定尺寸、壁厚与镂空余量，3D 预览实时反馈每一次改动。' },
  { step: '03', title: '导出并打印', description: '一键导出 3MF，进切片软件即可打印出严丝合缝的收纳盒。' },
]

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-grid sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-4">
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <span className="flex size-6 items-center justify-center rounded-sm border bg-muted">
                <Box className="size-4" />
              </span>
              <span className="font-bold">M-Box</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 px-0">
                <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                  <Github className="size-4" />
                  <span className="sr-only">GitHub</span>
                </a>
              </Button>
              <ModeSwitcher />
              <Button asChild size="sm" className="ml-1">
                <Link to="/app">
                  开始使用
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <ParticleField className="pointer-events-none absolute inset-0 -z-10 size-full" />
          <div className="bg-grid-fade pointer-events-none absolute inset-0 -z-20" />
          <div className="container-wrapper">
            <div className="container grid items-center gap-12 py-20 md:py-28 lg:grid-cols-2 lg:py-32">
              <div className="flex flex-col items-start gap-6">
                <div className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
                  <Sparkles className="size-3.5 text-primary" />
                  开源 · 免费 · 纯浏览器运行
                </div>
                <h1
                  className="animate-fade-in-up text-4xl font-bold tracking-tight text-balance md:text-5xl lg:text-6xl"
                  style={{ animationDelay: '100ms' }}
                >
                  为你的每一件物品
                  <br />
                  <span className="text-shimmer">定制 3D 打印收纳盒</span>
                </h1>
                <p
                  className="animate-fade-in-up max-w-lg text-base text-muted-foreground text-pretty md:text-lg"
                  style={{ animationDelay: '200ms' }}
                >
                  上传模型，自动生成贴合轮廓的收纳内腔；调整参数，实时预览，一键导出可打印的
                  3MF 文件。
                </p>
                <div className="animate-fade-in-up flex flex-wrap gap-3" style={{ animationDelay: '300ms' }}>
                  <Button asChild size="lg" className="group gap-2 shadow-lg shadow-primary/20">
                    <Link to="/app">
                      免费开始制作
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="gap-2">
                    <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
                      <Github className="size-4" />
                      GitHub
                    </a>
                  </Button>
                </div>
                <p className="animate-fade-in-up text-xs text-muted-foreground" style={{ animationDelay: '400ms' }}>
                  支持 STL · 3MF 模型导入，无需注册
                </p>
              </div>
              <div className="animate-fade-in-up" style={{ animationDelay: '250ms' }}>
                <HeroIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-grid border-t">
          <div className="container-wrapper">
            <div className="container py-20 md:py-24">
              <Reveal className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">一切为打印而生</h2>
                <p className="mt-3 text-muted-foreground md:text-lg">
                  从模型解析到 3MF 导出，完整覆盖收纳盒定制的每个环节。
                </p>
              </Reveal>
              <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map((feature, index) => (
                  <Reveal key={feature.title} delay={index * 80}>
                    <div className="group h-full rounded-xl border bg-card p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 [&_svg]:size-5">
                        {feature.icon}
                      </div>
                      <h3 className="mt-4 font-semibold">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="border-grid border-t bg-secondary/30">
          <div className="container-wrapper">
            <div className="container py-20 md:py-24">
              <Reveal className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">三步完成定制</h2>
                <p className="mt-3 text-muted-foreground md:text-lg">不写一行代码，几分钟得到可打印文件。</p>
              </Reveal>
              <div className="mt-12 grid gap-6 md:grid-cols-3">
                {STEPS.map((item, index) => (
                  <Reveal key={item.step} delay={index * 120}>
                    <div className="relative h-full rounded-xl border bg-card p-6 shadow-xs">
                      <span className="text-4xl font-bold text-primary/15 tabular-nums">{item.step}</span>
                      <h3 className="mt-2 font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                      {index < STEPS.length - 1 ? (
                        <ArrowRight className="absolute top-1/2 -right-4 hidden size-4 -translate-y-1/2 text-muted-foreground/40 md:block" />
                      ) : null}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-grid relative isolate overflow-hidden border-t">
          <ParticleField className="pointer-events-none absolute inset-0 -z-10 size-full opacity-60" />
          <div className="container-wrapper">
            <div className="container flex flex-col items-center gap-6 py-20 text-center md:py-28">
              <Reveal>
                <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
                  现在就为桌面上的杂物
                  <br className="md:hidden" />
                  安个家
                </h2>
              </Reveal>
              <Reveal delay={100}>
                <Button asChild size="lg" className="group gap-2 shadow-lg shadow-primary/20">
                  <Link to="/app">
                    打开生成器
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-grid border-t">
        <div className="container-wrapper">
          <div className="container flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted-foreground md:flex-row">
            <div className="flex items-center gap-2">
              <Box className="size-4" />
              <span>M-Box Generator</span>
            </div>
            <p>
              Built by{' '}
              <a
                href={siteConfig.links.homepage}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                busyhe
              </a>
              {' '}· 开源于{' '}
              <a
                href={siteConfig.links.github}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                GitHub
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
