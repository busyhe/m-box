import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getHealth = createServerFn({ method: 'GET' }).handler(async () => {
  return {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  }
})

export const Route = createFileRoute('/api/health')({
  loader: () => getHealth(),
  component: HealthPage,
})

function HealthPage() {
  const data = Route.useLoaderData()
  return <pre>{JSON.stringify(data, null, 2)}</pre>
}
