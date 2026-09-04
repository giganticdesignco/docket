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
  { key: 'see_capacity', label: 'See planner', hint: 'The Planner page and everyone\'s calendar busy time.' },
] as const
// Screens a role may open. The rail lists a screen only when the role
// has its key, and the route guard sends anyone else home. Home, the
// task page, Account, Notifications and Help are always open.
export const SCREENS = [
  { key: 'screen:time', label: 'Time', path: '/time', hint: 'Timesheet and timers.' },
  { key: 'screen:tasks', label: 'Tasks', path: '/tasks', hint: 'The task list. A task page opens from anywhere it is linked.' },
  { key: 'screen:projects', label: 'Projects', path: '/projects', hint: 'The projects list and project pages.' },
  { key: 'screen:clients', label: 'Clients', path: '/clients', hint: 'The clients list and client pages.' },
  { key: 'screen:reports', label: 'Reports', path: '/reports', hint: 'Needs "see everyone\'s time" to show anything.', requires: 'see_all_time' },
  { key: 'screen:schedule', label: 'Schedule', path: '/schedule', hint: 'The Gantt view.' },
  { key: 'screen:planner', label: 'Planner', path: '/planner', hint: 'People by weekday.', requires: 'see_capacity' },
  { key: 'screen:estimator', label: 'Estimator', path: '/estimator', hint: 'Rough numbers for new work.' },
  { key: 'screen:expenses', label: 'Expenses', path: '/expenses', hint: 'Their own, or everyone\'s with "see everyone\'s time".' },
  { key: 'screen:time_off', label: 'Time off', path: '/time-off', hint: 'Their own, or everyone\'s with "manage people".' },
  { key: 'screen:quotes', label: 'Quotes', path: '/quotes', hint: 'Needs the Quotes permission.', requires: 'manage_quotes' },
  { key: 'screen:approvals', label: 'Approvals', path: '/approvals', hint: 'Department leads always pass.', requires: 'approve_time' },
  { key: 'screen:billing', label: 'Billing', path: '/billing', hint: 'Batches. Needs the Invoices permission.', requires: 'manage_invoices' },
  { key: 'screen:invoices', label: 'Invoices', path: '/invoices', hint: 'Needs the Invoices permission.', requires: 'manage_invoices' },
  { key: 'screen:retainers', label: 'Retainers', path: '/retainers', hint: 'Retainer pages, reached from a client.' },
  { key: 'screen:settings', label: 'Settings', path: '/admin', hint: 'Each settings page also needs its own permission.' },
] as const satisfies readonly { key: string, label: string, path: string, hint: string, requires?: string }[]
export type ScreenKey = typeof SCREENS[number]['key']

// Money fields, finer than "see rates and amounts". Without that key
// the database returns no money at all; with it, these say which of it
// the screens show.
export const FIELDS = [
  { key: 'field:rates', label: 'Hourly rates', hint: 'Rates on projects, task types, people, and time entries.' },
  { key: 'field:amounts', label: 'Billable amounts and totals', hint: 'Amounts on time, reports, clients, retainers, and invoices.' },
  { key: 'field:budgets', label: 'Budgets and burn', hint: 'Project budgets and how much is used.' },
  { key: 'field:cost_margin', label: 'Cost and margin', hint: 'Cost rates, and margin on quotes and invoices.' },
] as const
export type FieldKey = typeof FIELDS[number]['key']

export type PermissionKey = typeof PERMISSIONS[number]['key'] | ScreenKey | FieldKey
