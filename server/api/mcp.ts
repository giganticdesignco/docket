// The MCP endpoint (Streamable HTTP). POST carries JSON-RPC; GET and
// DELETE are part of the protocol and get the transport's own answers.
// No token, or a token that is not a team member's, gets 401 with the
// pointer an MCP client needs to start the OAuth flow.
export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') {
    setResponseHeaders(event, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Max-Age': '86400' })
    return null
  }
  const c = await bearerCaller(event)
  if (!c) {
    setResponseHeaders(event, {
      'WWW-Authenticate': `Bearer resource_metadata="${requestOrigin(event)}/.well-known/oauth-protected-resource"`,
      'Access-Control-Allow-Origin': '*',
    })
    throw createError({ statusCode: 401, statusMessage: 'Sign in through Docket to use this connector' })
  }
  return await handleMcp(event, c)
})
