import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/landing/LandingPage'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return <LandingPage />
}
