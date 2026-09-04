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

// The settings pages: the sidebar under the gear and the cards on
// /admin come from this one list, gated the same way. `needs` is the
// permission the page's own middleware asks for; 'admin' means admins.
export const SETTINGS_PAGES = [
  { section: 'Team', label: 'People', to: '/admin/users', icon: 'i-lucide-users', text: 'Who can sign in, their role, default rate, and hours per week.', needs: 'manage_people' },
  { section: 'Team', label: 'Permissions', to: '/admin/permissions', icon: 'i-lucide-shield-check', text: 'What each role can see and do. Admins only.', needs: 'admin' },
  { section: 'Work', label: 'Projects', to: '/admin/project-settings', icon: 'i-lucide-folder-kanban', text: 'Where project folders live on the office server.', needs: 'manage_settings' },
  { section: 'Work', label: 'Departments', to: '/admin/departments', icon: 'i-lucide-network', text: 'The labels a project can carry (Web, Creative, Photo/Video) so the list filters to one.', needs: 'manage_settings' },
  { section: 'Work', label: 'Project templates', to: '/admin/project-templates', icon: 'i-lucide-layout-template', text: 'A starting set of tasks for a new project, picked on the New project form.', needs: 'manage_settings' },
  { section: 'Work', label: 'Task statuses', to: '/admin/task-statuses', icon: 'i-lucide-circle-dot', text: 'The status list tasks move through, and which ones mean done, paused, or with the client.', needs: 'manage_settings' },
  { section: 'Work', label: 'Task types', to: '/admin/tasks', icon: 'i-lucide-tags', text: 'The billing task types (Design, Development, and so on) and whether they bill by default.', needs: 'manage_reference' },
  { section: 'Money', label: 'Invoices and quotes', to: '/admin/invoice-settings', icon: 'i-lucide-file-text', text: 'Company block, payment instructions, numbering, terms, and overdue reminders.', needs: 'manage_settings' },
  { section: 'Money', label: 'Page templates', to: '/admin/page-templates', icon: 'i-lucide-panels-top-left', text: 'The kinds of page a website quote is built from, with the hours each usually takes.', needs: 'manage_settings' },
  { section: 'Money', label: 'Estimator', to: '/admin/estimator', icon: 'i-lucide-calculator', text: 'Materials, roll sizes, costs, and the markup rules behind signage estimates.', needs: 'manage_settings' },
  { section: 'Money', label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-receipt', text: 'Categories for expenses and receipts.', needs: 'manage_settings' },
  { section: 'Data', label: 'Imports', to: '/admin/imports', icon: 'i-lucide-download', text: 'Bring history in from Harvest and ClickUp.', needs: 'manage_settings', also: ['/admin/harvest', '/admin/clickup'] },
  { section: 'Docket', label: 'Feedback', to: '/admin/feedback', icon: 'i-lucide-message-square-warning', text: 'Bugs, changes and ideas sent from inside Docket, and which are approved.', needs: 'manage_settings' },
] as const satisfies readonly { section: string, label: string, to: string, icon: string, text: string, needs: 'admin' | PermissionKey, also?: readonly string[] }[]

// Every notification kind: its label on the Notifications page, its
// icon in the bell, and whether it emails by default.
export const NOTIFICATION_KINDS = [
  { kind: 'assigned', label: 'Assigned to a task', icon: 'i-lucide-user-plus', emailDefault: 'instant' },
  { kind: 'turn', label: 'A task handed to you', icon: 'i-lucide-hand', emailDefault: 'instant' },
  { kind: 'mentioned', label: 'Mentioned in a comment', icon: 'i-lucide-at-sign', emailDefault: 'instant' },
  { kind: 'comment', label: 'Comment on a task you are on, made, or follow', icon: 'i-lucide-message-square', emailDefault: 'off' },
  { kind: 'status', label: 'Status change on a task you are on or follow', icon: 'i-lucide-circle-dot', emailDefault: 'off' },
  { kind: 'due', label: 'Task due tomorrow, today, or overdue', icon: 'i-lucide-calendar-clock', emailDefault: 'off' },
  { kind: 'unowned', label: 'Nobody is up on a task you are on', icon: 'i-lucide-circle-dashed', emailDefault: 'off' },
  { kind: 'client_comment', label: 'Client commented', icon: 'i-lucide-message-square-text', emailDefault: 'instant' },
  { kind: 'client_decision', label: 'Client approved or requested changes', icon: 'i-lucide-badge-check', emailDefault: 'instant' },
  { kind: 'quote_decision', label: 'Quote accepted or declined', icon: 'i-lucide-file-signature', emailDefault: 'instant' },
  { kind: 'invoice_paid', label: 'Invoice paid', icon: 'i-lucide-banknote', emailDefault: 'instant' },
  { kind: 'timer', label: 'Timer left running', icon: 'i-lucide-timer', emailDefault: 'instant' },
  { kind: 'missing_time', label: 'No time logged yesterday', icon: 'i-lucide-clock-alert', emailDefault: 'instant' },
  { kind: 'time_rejected', label: 'Timesheet entries sent back', icon: 'i-lucide-undo-2', emailDefault: 'instant' },
  { kind: 'time_submitted', label: 'Someone you review submitted a week', icon: 'i-lucide-badge-check', emailDefault: 'instant' },
] as const
export const notificationKind = (kind: string) => NOTIFICATION_KINDS.find(k => k.kind === kind)
