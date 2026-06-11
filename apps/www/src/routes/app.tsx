import { createFileRoute } from '@tanstack/react-router'
import { BoxGenerator } from '@/features/box-generator/BoxGenerator'

export const Route = createFileRoute('/app')({ component: AppPage })

function AppPage() {
  return <BoxGenerator />
}
