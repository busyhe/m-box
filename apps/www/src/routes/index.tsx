import { createFileRoute } from '@tanstack/react-router'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <div data-wrapper="" className="border-grid flex flex-1 flex-col min-h-svh">
      <SiteHeader />
      <main className="flex flex-1 flex-col container-wrapper">
        <div className="container py-6">
          <h1 className="text-2xl font-bold">Hello World</h1>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
