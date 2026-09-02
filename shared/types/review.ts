// What the client review page shows. Built by server/utils/reviewDoc.ts
// with the service role; nothing internal (server file links, internal
// comments, estimates, rates) is included.

export type ReviewDoc = {
  task: {
    id: string
    title: string
    description: string | null
    status: string
    due_on: string | null
    client_decision: 'approved' | 'changes_requested' | null
    client_decision_by: string | null
    client_decision_at: string | null
    updated_at: string
  }
  project: { name: string }
  client: { name: string }
  company: { name: string, email: string | null }
  files: { id: string, file_name: string, size_bytes: number | null, content_type: string | null, url: string, created_at: string }[]
  comments: { id: string, author: string, is_client: boolean, body: string, created_at: string }[]
}
