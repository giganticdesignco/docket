// The columns the app may read off the tables whose money columns are
// revoked from the client (docs/permissions.md, "Money at the
// database"). select('*') on these tables fails with permission denied;
// rates come from profile_rates, project_rates and project_task_rates,
// which return null without see_money.
export const PROFILE_COLS = 'id, full_name, email, role, is_active, created_at, tours_seen, client_id, department_id, brief_email'
export const PROJECT_COLS = 'id, client_id, name, code, billing_method, budget_hours, budget_amount, is_active, created_at, harvest_id, server_path, client_visible, lead_id, department_id'
export const TIME_ENTRY_COLS = 'id, user_id, project_id, task_id, spent_on, started_at, ended_at, hours, notes, is_billable, is_locked, batch_id, created_at, updated_at, harvest_id, work_item_id, deleted_at, deleted_by, status, submitted_at, reviewed_at, reviewed_by, reject_reason'
