import type { H3Event } from 'h3'

// The public origin of this deployment, behind Vercel's proxy.
export function requestOrigin(event: H3Event) {
  const proto = getHeader(event, 'x-forwarded-proto') ?? 'https'
  const host = getHeader(event, 'x-forwarded-host') ?? getHeader(event, 'host') ?? 'localhost:3000'
  return `${proto.split(',')[0]}://${host.split(',')[0]}`
}
