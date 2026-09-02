import type { Database } from './database'

// App-side helpers on top of the generated Supabase types. Regenerating
// shared/types/database.ts must not touch this file.

export type UserRole = Database['public']['Enums']['user_role']
export type BillingMethod = Database['public']['Enums']['billing_method']

export const BILLING_METHODS: { label: string, value: BillingMethod }[] = [
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed fee', value: 'fixed' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Non-billable', value: 'non_billable' },
]
