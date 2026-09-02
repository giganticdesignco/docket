// What the invoice document needs, whoever is looking at it: the admin
// editor, the public /i/<token> page, and the email route all build this.

export type InvoiceDoc = {
  invoice: {
    id: string
    number: string
    status: 'draft' | 'sent' | 'paid' | 'void'
    subject: string | null
    notes: string | null
    issue_date: string
    due_date: string
    tax_rate: number
    subtotal: number
    tax_amount: number
    total: number
    paid_amount: number
    due_amount: number
    public_token: string
  }
  client: { name: string }
  settings: {
    company_name: string
    company_address: string | null
    company_email: string | null
    company_phone: string | null
    payment_instructions: string | null
  }
  lines: {
    id: string
    kind: string
    description: string
    quantity: number
    unit_price: number
    amount: number
    taxable: boolean
  }[]
  payments: { id: string, paid_on: string, amount: number, method: string | null, reference: string | null }[]
  detail: {
    time: { spent_on: string, user_name: string, project_name: string, task_name: string, hours: number, notes: string | null }[]
    expenses: { spent_on: string, user_name: string, project_name: string, category_name: string, amount: number, notes: string | null }[]
  }
}
