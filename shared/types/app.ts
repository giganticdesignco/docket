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

// Task statuses live in the work_statuses table; see useWorkStatuses().
export type StatusColor = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'error'
export const STATUS_COLORS: { label: string, value: StatusColor }[] = [
  { label: 'Gray', value: 'neutral' }, { label: 'Green', value: 'primary' }, { label: 'Blue', value: 'info' },
  { label: 'Success', value: 'success' }, { label: 'Amber', value: 'warning' }, { label: 'Red', value: 'error' },
]

export const WORK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const
export type WorkPriority = typeof WORK_PRIORITIES[number]['value']
