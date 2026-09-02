// What the quote document shows: the admin preview, the public /q/<token>
// page, and the email all build this. Nothing internal (rates per task
// type mapping, creator) beyond what the client should see.

export type QuoteDoc = {
  quote: {
    id: string
    number: string
    title: string
    status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
    intro: string | null
    terms: string | null
    valid_until: string | null
    subtotal: number
    accepted_at: string | null
    accepted_by: string | null
    declined_at: string | null
    declined_by: string | null
    decline_reason: string | null
    created_at: string
  }
  client: { name: string }
  company: { name: string, address: string | null, email: string | null, phone: string | null }
  lines: { id: string, description: string, hours: number | null, rate: number | null, amount: number, task: string | null, pages: number }[]
  sitemap: SitemapNode[]
  expired: boolean
}

export type SitemapNode = {
  id: string
  title: string
  path: string | null
  template: string | null
  notes: string | null
  line_item_id: string | null
  children: SitemapNode[]
}
