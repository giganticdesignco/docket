// Hand-maintained for step 1. Replace with `supabase gen types typescript`
// output once the project exists. Shape matches the generated format so
// the swap is a file replacement, not a refactor.

export type UserRole = 'admin' | 'staff'
export type BillingMethod = 'hourly' | 'fixed' | 'retainer' | 'non_billable'

type Profile = {
  id: string
  full_name: string
  email: string
  role: UserRole
  default_rate: number | null
  is_active: boolean
  created_at: string
}

type Client = {
  id: string
  name: string
  qbo_customer_id: string | null
  is_active: boolean
  created_at: string
}

type Project = {
  id: string
  client_id: string
  name: string
  code: string | null
  billing_method: BillingMethod
  budget_hours: number | null
  budget_amount: number | null
  hourly_rate: number | null
  is_active: boolean
  created_at: string
}

type Task = {
  id: string
  name: string
  qbo_item_id: string | null
  is_billable_default: boolean
  is_active: boolean
}

type ProjectTask = {
  project_id: string
  task_id: string
  hourly_rate: number | null
}

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type Table<Row, Insert, Rels extends Relationship[] = [], Update = Partial<Insert>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Rels
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, Pick<Profile, 'id' | 'full_name' | 'email'> & Partial<Profile>>
      clients: Table<Client, Pick<Client, 'name'> & Partial<Client>>
      projects: Table<
        Project,
        Pick<Project, 'client_id' | 'name'> & Partial<Project>,
        [{
          foreignKeyName: 'projects_client_id_fkey'
          columns: ['client_id']
          isOneToOne: false
          referencedRelation: 'clients'
          referencedColumns: ['id']
        }]
      >
      tasks: Table<Task, Pick<Task, 'name'> & Partial<Task>>
      project_tasks: Table<
        ProjectTask,
        Pick<ProjectTask, 'project_id' | 'task_id'> & Partial<ProjectTask>,
        [
          {
            foreignKeyName: 'project_tasks_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_tasks_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      >
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      user_role: UserRole
      billing_method: BillingMethod
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']

export const BILLING_METHODS: { label: string, value: BillingMethod }[] = [
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed fee', value: 'fixed' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Non-billable', value: 'non_billable' },
]
