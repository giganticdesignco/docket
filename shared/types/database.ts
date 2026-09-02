// Generated from the live Supabase project (ref cnnrtsnevmjqhfgpolfo) with the
// Supabase MCP generate_typescript_types tool. Do not hand-edit; regenerate
// after every schema change. App-side helpers live in ./app.ts.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at: string
          changed_by: string | null
          changed_fields: string[] | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      availability: {
        Row: {
          effective_from: string
          effective_to: string | null
          hours_per_week: number
          id: string
          user_id: string
        }
        Insert: {
          effective_from: string
          effective_to?: string | null
          hours_per_week?: number
          id?: string
          user_id: string
        }
        Update: {
          effective_from?: string
          effective_to?: string | null
          hours_per_week?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      billing_batches: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          id: string
          period_end: string
          period_start: string
          project_id: string | null
          qbo_doc_number: string | null
          qbo_error: string | null
          qbo_invoice_id: string | null
          qbo_pushed_at: string | null
          status: Database["public"]["Enums"]["billing_batch_status"]
          subtotal_amount: number
          subtotal_hours: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          period_end: string
          period_start: string
          project_id?: string | null
          qbo_doc_number?: string | null
          qbo_error?: string | null
          qbo_invoice_id?: string | null
          qbo_pushed_at?: string | null
          status?: Database["public"]["Enums"]["billing_batch_status"]
          subtotal_amount?: number
          subtotal_hours?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          period_end?: string
          period_start?: string
          project_id?: string | null
          qbo_doc_number?: string | null
          qbo_error?: string | null
          qbo_invoice_id?: string | null
          qbo_pushed_at?: string | null
          status?: Database["public"]["Enums"]["billing_batch_status"]
          subtotal_amount?: number
          subtotal_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_batches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "billing_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "billing_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "billing_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "billing_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "billing_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "billing_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
        ]
      }
      calendar_busy: {
        Row: {
          ends_at: string
          hours: number
          id: string
          source: string
          starts_at: string
          synced_at: string
          user_id: string
        }
        Insert: {
          ends_at: string
          hours: number
          id?: string
          source?: string
          starts_at: string
          synced_at?: string
          user_id: string
        }
        Update: {
          ends_at?: string
          hours?: number
          id?: string
          source?: string
          starts_at?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_busy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "calendar_busy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_busy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "calendar_busy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clickup_assignments: {
        Row: {
          clickup_list_id: string | null
          clickup_user_id: string | null
          due_on: string | null
          estimate_hours: number | null
          id: string
          project_id: string | null
          start_on: string | null
          status: string | null
          synced_at: string
          title: string
          url: string | null
          user_id: string | null
        }
        Insert: {
          clickup_list_id?: string | null
          clickup_user_id?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id: string
          project_id?: string | null
          start_on?: string | null
          status?: string | null
          synced_at?: string
          title: string
          url?: string | null
          user_id?: string | null
        }
        Update: {
          clickup_list_id?: string | null
          clickup_user_id?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id?: string
          project_id?: string | null
          start_on?: string | null
          status?: string | null
          synced_at?: string
          title?: string
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clickup_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "clickup_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "clickup_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "clickup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clickup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clickup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clickup_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          harvest_id: number | null
          id: string
          is_active: boolean
          name: string
          qbo_customer_id: string | null
        }
        Insert: {
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name: string
          qbo_customer_id?: string | null
        }
        Update: {
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name?: string
          qbo_customer_id?: string | null
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          harvest_id: number | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          batch_id: string | null
          category_id: string
          created_at: string
          harvest_id: number | null
          id: string
          is_billable: boolean
          is_locked: boolean
          is_reimbursable: boolean
          notes: string | null
          project_id: string
          receipt_path: string | null
          spent_on: string
          user_id: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          category_id: string
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          is_reimbursable?: boolean
          notes?: string | null
          project_id: string
          receipt_path?: string | null
          spent_on: string
          user_id: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          category_id?: string
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          is_reimbursable?: boolean
          notes?: string | null
          project_id?: string
          receipt_path?: string | null
          spent_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      harvest_archive_monthly: {
        Row: {
          amount: number
          billable_hours: number
          client_id: string | null
          client_name: string
          hours: number
          id: string
          period_month: string
          project_code: string | null
          project_id: string | null
          project_name: string
          task_name: string | null
          user_id: string | null
          user_name: string
        }
        Insert: {
          amount?: number
          billable_hours?: number
          client_id?: string | null
          client_name: string
          hours?: number
          id?: string
          period_month: string
          project_code?: string | null
          project_id?: string | null
          project_name: string
          task_name?: string | null
          user_id?: string | null
          user_name: string
        }
        Update: {
          amount?: number
          billable_hours?: number
          client_id?: string | null
          client_name?: string
          hours?: number
          id?: string
          period_month?: string
          project_code?: string | null
          project_id?: string | null
          project_name?: string
          task_name?: string | null
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "harvest_archive_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "harvest_archive_monthly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      harvest_invoices: {
        Row: {
          amount: number
          client_id: string | null
          client_name: string
          closed_at: string | null
          currency: string | null
          discount_amount: number | null
          due_amount: number
          due_date: string | null
          harvest_id: number
          harvest_updated_at: string
          id: string
          issue_date: string
          line_items: Json
          number: string
          paid_at: string | null
          paid_date: string | null
          period_end: string | null
          period_start: string | null
          sent_at: string | null
          state: string
          subject: string | null
          tax_amount: number | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          client_name: string
          closed_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_amount: number
          due_date?: string | null
          harvest_id: number
          harvest_updated_at: string
          id?: string
          issue_date: string
          line_items?: Json
          number: string
          paid_at?: string | null
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          state: string
          subject?: string | null
          tax_amount?: number | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          client_name?: string
          closed_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_amount?: number
          due_date?: string | null
          harvest_id?: number
          harvest_updated_at?: string
          id?: string
          issue_date?: string
          line_items?: Json
          number?: string
          paid_at?: string | null
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          state?: string
          subject?: string | null
          tax_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "harvest_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "harvest_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number | null
          description: string
          id: string
          invoice_id: string
          kind: string
          position: number
          project_id: string | null
          quantity: number
          taxable: boolean
          unit_price: number
        }
        Insert: {
          amount?: number | null
          description: string
          id?: string
          invoice_id: string
          kind?: string
          position?: number
          project_id?: string | null
          quantity?: number
          taxable?: boolean
          unit_price?: number
        }
        Update: {
          amount?: number | null
          description?: string
          id?: string
          invoice_id?: string
          kind?: string
          position?: number
          project_id?: string | null
          quantity?: number
          taxable?: boolean
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoice_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoice_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string
          method: string | null
          notes: string | null
          paid_on: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          invoice_id: string
          method?: string | null
          notes?: string | null
          paid_on?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          invoice_id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          company_address: string | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          default_notes: string | null
          default_tax_rate: number
          default_terms_days: number
          id: boolean
          next_invoice_number: number
          payment_instructions: string | null
          remind_every_days: number
          remind_overdue: boolean
        }
        Insert: {
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          default_notes?: string | null
          default_tax_rate?: number
          default_terms_days?: number
          id?: boolean
          next_invoice_number?: number
          payment_instructions?: string | null
          remind_every_days?: number
          remind_overdue?: boolean
        }
        Update: {
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          default_notes?: string | null
          default_tax_rate?: number
          default_terms_days?: number
          id?: boolean
          next_invoice_number?: number
          payment_instructions?: string | null
          remind_every_days?: number
          remind_overdue?: boolean
        }
        Relationships: []
      }
      invoices: {
        Row: {
          batch_id: string | null
          client_id: string
          created_at: string
          created_by: string
          due_amount: number
          due_date: string
          id: string
          issue_date: string
          last_reminded_at: string | null
          notes: string | null
          number: string
          paid_amount: number
          paid_at: string | null
          public_token: string
          sent_at: string | null
          sent_to: string[] | null
          status: Database["public"]["Enums"]["invoice_status"]
          subject: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          client_id: string
          created_at?: string
          created_by: string
          due_amount?: number
          due_date: string
          id?: string
          issue_date?: string
          last_reminded_at?: string | null
          notes?: string | null
          number: string
          paid_amount?: number
          paid_at?: string | null
          public_token?: string
          sent_at?: string | null
          sent_to?: string[] | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subject?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          due_amount?: number
          due_date?: string
          id?: string
          issue_date?: string
          last_reminded_at?: string | null
          notes?: string | null
          number?: string
          paid_amount?: number
          paid_at?: string | null
          public_token?: string
          sent_at?: string | null
          sent_to?: string[] | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subject?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_rate: number | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          default_rate?: number | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          default_rate?: number | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          hourly_rate: number | null
          project_id: string
          task_id: string
        }
        Insert: {
          hourly_rate?: number | null
          project_id: string
          task_id: string
        }
        Update: {
          hourly_rate?: number | null
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billing_method: Database["public"]["Enums"]["billing_method"]
          budget_amount: number | null
          budget_hours: number | null
          client_id: string
          code: string | null
          created_at: string
          harvest_id: number | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          billing_method?: Database["public"]["Enums"]["billing_method"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id: string
          code?: string | null
          created_at?: string
          harvest_id?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          billing_method?: Database["public"]["Enums"]["billing_method"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id?: string
          code?: string | null
          created_at?: string
          harvest_id?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          hours: number | null
          id: string
          quote_id: string
          rate: number | null
          sort_order: number
          task_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          hours?: number | null
          id?: string
          quote_id: string
          rate?: number | null
          sort_order?: number
          task_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          hours?: number | null
          id?: string
          quote_id?: string
          rate?: number | null
          sort_order?: number
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_sitemap_nodes: {
        Row: {
          created_at: string
          id: string
          line_item_id: string | null
          notes: string | null
          parent_id: string | null
          path: string | null
          quote_id: string
          sort_order: number
          template: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_item_id?: string | null
          notes?: string | null
          parent_id?: string | null
          path?: string | null
          quote_id: string
          sort_order?: number
          template?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          line_item_id?: string | null
          notes?: string | null
          parent_id?: string | null
          path?: string | null
          quote_id?: string
          sort_order?: number
          template?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_sitemap_nodes_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "quote_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_sitemap_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "quote_sitemap_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_sitemap_nodes_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string
          created_at: string
          created_by: string
          id: string
          intro: string | null
          number: string
          project_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          terms: string | null
          title: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          intro?: string | null
          number: string
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          terms?: string | null
          title: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          intro?: string | null
          number?: string
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          terms?: string | null
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          for_date: string
          id: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent_at: string
          user_id: string
        }
        Insert: {
          for_date: string
          id?: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent_at?: string
          user_id: string
        }
        Update: {
          for_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["reminder_kind"]
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      retainers: {
        Row: {
          allotted: number
          basis: Database["public"]["Enums"]["retainer_basis"]
          client_id: string
          created_at: string
          id: string
          name: string
          period_end: string
          period_start: string
          project_id: string | null
          rollover: boolean
          rollover_cap: number | null
        }
        Insert: {
          allotted: number
          basis?: Database["public"]["Enums"]["retainer_basis"]
          client_id: string
          created_at?: string
          id?: string
          name: string
          period_end: string
          period_start: string
          project_id?: string | null
          rollover?: boolean
          rollover_cap?: number | null
        }
        Update: {
          allotted?: number
          basis?: Database["public"]["Enums"]["retainer_basis"]
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          period_end?: string
          period_start?: string
          project_id?: string | null
          rollover?: boolean
          rollover_cap?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "retainers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "retainers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "retainers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          base_view: string
          created_at: string
          filters: Json
          group_by: string[] | null
          id: string
          is_shared: boolean
          name: string
          owner_id: string
        }
        Insert: {
          base_view: string
          created_at?: string
          filters?: Json
          group_by?: string[] | null
          id?: string
          is_shared?: boolean
          name: string
          owner_id: string
        }
        Update: {
          base_view?: string
          created_at?: string
          filters?: Json
          group_by?: string[] | null
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tasks: {
        Row: {
          harvest_id: number | null
          id: string
          is_active: boolean
          is_billable_default: boolean
          name: string
          qbo_item_id: string | null
        }
        Insert: {
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          is_billable_default?: boolean
          name: string
          qbo_item_id?: string | null
        }
        Update: {
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          is_billable_default?: boolean
          name?: string
          qbo_item_id?: string | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          batch_id: string | null
          created_at: string
          ended_at: string | null
          harvest_id: number | null
          hours: number
          id: string
          is_billable: boolean
          is_locked: boolean
          notes: string | null
          project_id: string
          rate_snapshot: number | null
          spent_on: string
          started_at: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          ended_at?: string | null
          harvest_id?: number | null
          hours?: number
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          notes?: string | null
          project_id: string
          rate_snapshot?: number | null
          spent_on: string
          started_at?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          ended_at?: string | null
          harvest_id?: number | null
          hours?: number
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          notes?: string | null
          project_id?: string
          rate_snapshot?: number | null
          spent_on?: string
          started_at?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      time_off: {
        Row: {
          created_at: string
          ends_on: string
          hours_per_day: number
          id: string
          kind: Database["public"]["Enums"]["time_off_kind"]
          notes: string | null
          starts_on: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ends_on: string
          hours_per_day?: number
          id?: string
          kind?: Database["public"]["Enums"]["time_off_kind"]
          notes?: string | null
          starts_on: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string
          hours_per_day?: number
          id?: string
          kind?: Database["public"]["Enums"]["time_off_kind"]
          notes?: string | null
          starts_on?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_off_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      capacity_weekly: {
        Row: {
          base_hours: number | null
          booked_hours: number | null
          logged_hours: number | null
          meeting_hours: number | null
          time_off_hours: number | null
          user_id: string | null
          user_name: string | null
          week_start: string | null
        }
        Relationships: []
      }
      harvest_archive_yearly: {
        Row: {
          amount: number | null
          billable_hours: number | null
          first_month: string | null
          hours: number | null
          last_month: string | null
          row_count: number | null
          year: number | null
        }
        Relationships: []
      }
      project_budget_status: {
        Row: {
          amount_used: number | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          budget_amount: number | null
          budget_hours: number | null
          client_name: string | null
          hours_used: number | null
          pct_hours_used: number | null
          project_id: string | null
          project_name: string | null
        }
        Relationships: []
      }
      retainer_burndown: {
        Row: {
          allotted: number | null
          basis: Database["public"]["Enums"]["retainer_basis"] | null
          client_id: string | null
          name: string | null
          period_end: string | null
          period_start: string | null
          remaining: number | null
          retainer_id: string | null
          used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "retainers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
        ]
      }
      time_detail: {
        Row: {
          amount: number | null
          batch_id: string | null
          billable_hours: number | null
          client_id: string | null
          client_name: string | null
          hours: number | null
          id: string | null
          is_billable: boolean | null
          is_locked: boolean | null
          notes: string | null
          period_month: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          spent_on: string | null
          task_name: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      time_monthly_all: {
        Row: {
          amount: number | null
          billable_hours: number | null
          client_name: string | null
          hours: number | null
          period_month: string | null
          project_name: string | null
          source: string | null
          task_name: string | null
          user_name: string | null
        }
        Relationships: []
      }
      unbilled_expenses: {
        Row: {
          amount: number | null
          batch_id: string | null
          category_id: string | null
          client_id: string | null
          client_name: string | null
          created_at: string | null
          harvest_id: number | null
          id: string | null
          is_billable: boolean | null
          is_locked: boolean | null
          is_reimbursable: boolean | null
          notes: string | null
          project_id: string | null
          project_name: string | null
          receipt_path: string | null
          spent_on: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      unbilled_time: {
        Row: {
          amount: number | null
          batch_id: string | null
          billable_hours: number | null
          client_id: string | null
          client_name: string | null
          hours: number | null
          id: string | null
          is_billable: boolean | null
          is_locked: boolean | null
          notes: string | null
          period_month: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          spent_on: string | null
          task_name: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "billing_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_billing_batch: {
        Args: {
          p_client_id: string
          p_expense_ids: string[]
          p_period_end: string
          p_period_start: string
          p_project_id?: string
          p_time_entry_ids: string[]
        }
        Returns: string
      }
      create_invoice: {
        Args: { p_batch_id?: string; p_client_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      next_invoice_number: { Args: never; Returns: string }
      project_budget: {
        Args: { p_project_id: string }
        Returns: {
          amount_used: number
          billable_hours: number
          hours_used: number
        }[]
      }
      project_budgets: {
        Args: never
        Returns: {
          amount_used: number
          billable_hours: number
          hours_used: number
          project_id: string
        }[]
      }
      recalc_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      relink_harvest_archive: { Args: never; Returns: number }
      report_time_monthly: {
        Args: {
          p_client?: string
          p_from: string
          p_group_by?: string[]
          p_project?: string
          p_to: string
          p_user?: string
        }
        Returns: {
          amount: number
          billable_hours: number
          client_name: string
          hours: number
          period_month: string
          project_name: string
          task_name: string
          user_name: string
        }[]
      }
      resolve_rate: {
        Args: { p_project_id: string; p_task_id: string; p_user_id: string }
        Returns: number
      }
      retainer_status: {
        Args: never
        Returns: {
          allotted: number
          available: number
          basis: Database["public"]["Enums"]["retainer_basis"]
          carried_in: number
          client_id: string
          name: string
          period_end: string
          period_start: string
          project_id: string
          remaining: number
          retainer_id: string
          rollover: boolean
          rollover_cap: number
          used: number
        }[]
      }
      run_invoice_reminders: {
        Args: { p_dry_run?: boolean; p_force?: boolean }
        Returns: {
          invoice_number: string
          sent: boolean
          to_emails: string[]
        }[]
      }
      run_reminders: {
        Args: { p_dry_run?: boolean }
        Returns: {
          email: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent: boolean
          subject: string
        }[]
      }
      send_reminder: {
        Args: {
          p_body: string
          p_dry_run?: boolean
          p_for_date: string
          p_kind: Database["public"]["Enums"]["reminder_kind"]
          p_subject: string
          p_user_id: string
        }
        Returns: boolean
      }
      unbilled_summary: {
        Args: never
        Returns: {
          client_id: string
          client_name: string
          expense_amount: number
          hours: number
          newest: string
          oldest: string
          time_amount: number
        }[]
      }
      vault_secret: {
        Args: { p_default?: string; p_name: string }
        Returns: string
      }
      void_billing_batch: { Args: { p_batch_id: string }; Returns: undefined }
      void_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
    }
    Enums: {
      audit_action: "insert" | "update" | "delete"
      billing_batch_status:
        | "draft"
        | "pushing"
        | "pushed"
        | "failed"
        | "void"
        | "invoiced"
      billing_method: "hourly" | "fixed" | "retainer" | "non_billable"
      invoice_status: "draft" | "sent" | "paid" | "void"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      reminder_kind: "timer_left_running" | "missing_time" | "timesheet_nudge"
      retainer_basis: "hours" | "amount"
      time_off_kind: "pto" | "holiday" | "unpaid" | "sick"
      user_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: ["insert", "update", "delete"],
      billing_batch_status: [
        "draft",
        "pushing",
        "pushed",
        "failed",
        "void",
        "invoiced",
      ],
      billing_method: ["hourly", "fixed", "retainer", "non_billable"],
      invoice_status: ["draft", "sent", "paid", "void"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
      reminder_kind: ["timer_left_running", "missing_time", "timesheet_nudge"],
      retainer_basis: ["hours", "amount"],
      time_off_kind: ["pto", "holiday", "unpaid", "sick"],
      user_role: ["admin", "staff"],
    },
  },
} as const
