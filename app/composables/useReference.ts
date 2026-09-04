// The reference lists most screens need: active people, active
// projects, the project-task pairs, client names, task types, budgets,
// and the report filter lists. One query and one cache key each, so
// two pages can never cache different shapes under the same name.
// Each returns the useAsyncData promise, to go in a page's Promise.all.
type Opts = { server?: boolean, immediate?: boolean }

export const useActivePeople = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('people-active', async () => {
    const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
    if (error) throw error
    return data
  }, fresh)
}

export const useActiveProjects = (opts: Opts = {}) => {
  const supabase = useSupabaseClient()
  return useAsyncData('projects-active', async () => {
    const { data, error } = await supabase.from('projects').select('id, name, billing_method, clients(name)').eq('is_active', true).order('name')
    if (error) throw error
    return data
  }, { ...fresh, ...opts })
}

// Every project's task types, for the time entry form. Large, so the
// forms ask for it with immediate: false and load it on open.
export const useProjectTaskTypes = (opts: Opts = {}) => {
  const supabase = useSupabaseClient()
  return useAsyncData('project-task-types', async () => {
    const { data, error } = await supabase.from('project_tasks').select('project_id, task_id, tasks(id, name, is_billable_default, is_active)')
    if (error) throw error
    return data
  }, { ...fresh, ...opts })
}

export const useClientNames = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('client-names', async () => {
    const { data, error } = await supabase.from('clients').select('id, name').order('name')
    if (error) throw error
    return data
  }, fresh)
}

export const useTaskTypes = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('task-types-active', async () => {
    const { data, error } = await supabase.from('tasks').select('id, name').eq('is_active', true).order('name')
    if (error) throw error
    return data
  }, fresh)
}

// Lifetime burn per project, everyone's time (security definer).
export const useProjectBudgets = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('project-budgets', async () => {
    const { data, error } = await supabase.rpc('project_budgets')
    if (error) throw error
    return data
  }, fresh)
}

// Report filter options come from live tables by name. Archive-only
// names still show up in results, they just cannot be picked.
export const useReportClients = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('report-clients', async () => {
    const { data, error } = await supabase.from('clients').select('name').order('name')
    if (error) throw error
    return data
  }, fresh)
}
export const useReportProjects = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('report-projects', async () => {
    const { data, error } = await supabase.from('projects').select('name, clients(name)').order('name')
    if (error) throw error
    return data
  }, fresh)
}
export const useReportPeople = () => {
  const supabase = useSupabaseClient()
  return useAsyncData('report-people', async () => {
    const { data, error } = await supabase.from('profiles').select('full_name').order('full_name')
    if (error) throw error
    return data
  }, fresh)
}
