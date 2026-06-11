import { createFileRoute } from '@tanstack/react-router'
import { BoxGenerator } from '@/features/box-generator/BoxGenerator'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return <BoxGenerator />
}
