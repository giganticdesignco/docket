// OAuth protected-resource metadata for the MCP endpoint (RFC 9728).
// An MCP client that gets a 401 from /api/mcp reads this to learn that
// Supabase Auth is the authorization server, then runs the OAuth 2.1
// flow there. Served from middleware because Nitro does not scan
// dot-directories for route files.
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]
  if (path !== '/.well-known/oauth-protected-resource' && path !== '/.well-known/oauth-protected-resource/api/mcp') return
  const origin = requestOrigin(event)
  const supabaseUrl = (useRuntimeConfig().public.supabase as { url: string }).url
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Docket',
    resource_documentation: `${origin}/account`,
  }
})
