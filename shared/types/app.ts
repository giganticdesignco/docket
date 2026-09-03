import type { Database } from './database'

// App-side helpers on top of the generated Supabase types. Regenerating
// shared/types/database.ts must not touch this file.

// Roles are rows in the roles table; the key is the role.
export type UserRole = Database['public']['Tables']['roles']['Row']['key']
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

// Permission keys, matching the permissions table. Admin has all of them.
export const PERMISSIONS = [
  { key: 'see_all_time', label: 'See everyone\'s time and expenses', hint: 'Reports, the Everyone switches, other people\'s entries.' },
  { key: 'see_money', label: 'See rates and amounts', hint: 'Rates on projects and entries, budgets, billable amounts.' },
  { key: 'see_all_tasks', label: 'See every task', hint: 'Off means only tasks they are on or made.' },
  { key: 'manage_tasks', label: 'Delete any task or comment', hint: 'Everyone can edit tasks they can see.' },
  { key: 'manage_reference', label: 'Manage clients, projects, and task types', hint: 'Including project rates and budgets.' },
  { key: 'manage_quotes', label: 'Quotes', hint: 'Draft, send, and edit quotes.' },
  { key: 'manage_invoices', label: 'Invoices', hint: 'Batches, invoices, payments, Harvest history.' },
  { key: 'manage_retainers', label: 'Retainers', hint: 'Set up and edit retainers.' },
  { key: 'approve_time', label: 'Approve time', hint: 'Review submitted timesheets; approve, or send back with a reason.' },
  { key: 'manage_people', label: 'Manage people', hint: 'Roles, rates, hours per week, everyone\'s time off.' },
  { key: 'manage_settings', label: 'Settings', hint: 'Statuses, categories, invoice settings, imports.' },
  { key: 'see_capacity', label: 'See capacity', hint: 'The capacity page and calendar busy time.' },
] as const
export type PermissionKey = typeof PERMISSIONS[number]['key']
