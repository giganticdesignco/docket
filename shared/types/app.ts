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

// Task (work item) statuses, in the order the team works them. Matches the
// flow the ClickUp workspace used.
export const WORK_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'ready_to_start', label: 'Ready to start' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'client_review', label: 'Client review' },
  { value: 'back_in_our_court', label: 'Back in our court' },
  { value: 'sent_to_print', label: 'Sent to print' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
] as const
export type WorkStatus = typeof WORK_STATUSES[number]['value']

export const WORK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const
export type WorkPriority = typeof WORK_PRIORITIES[number]['value']

export const workStatusLabel = (v: string) => WORK_STATUSES.find(s => s.value === v)?.label ?? v
export const workStatusColor = (v: string): 'neutral' | 'primary' | 'warning' | 'success' | 'error' | 'info' =>
  v === 'completed' ? 'success'
  : v === 'in_progress' ? 'primary'
  : v === 'client_review' || v === 'internal_review' ? 'info'
  : v === 'back_in_our_court' ? 'warning'
  : v === 'on_hold' ? 'neutral'
  : 'neutral'
