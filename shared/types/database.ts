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
      ai_events: {
        Row: {
          created_at: string
          id: string
          input_tokens: number | null
          job: string
          model: string
          output_tokens: number | null
          prompt: string | null
          response: string | null
          saved: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          job: string
          model: string
          output_tokens?: number | null
          prompt?: string | null
          response?: string | null
          saved?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          job?: string
          model?: string
          output_tokens?: number | null
          prompt?: string | null
          response?: string | null
          saved?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "assistant_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: number
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: number
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      clients: {
        Row: {
          created_at: string
          harvest_id: number | null
          id: string
          is_active: boolean
          name: string
          qbo_customer_id: string | null
          search: unknown
        }
        Insert: {
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name: string
          qbo_customer_id?: string | null
          search?: unknown
        }
        Update: {
          created_at?: string
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          name?: string
          qbo_customer_id?: string | null
          search?: unknown
        }
        Relationships: []
      }
      departments: {
        Row: {
          id: string
          is_active: boolean
          lead_id: string | null
          name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "departments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "departments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      estimator_materials: {
        Row: {
          cost: number
          id: string
          is_active: boolean
          legacy_id: number | null
          length_in: number
          markup_pct: number
          name: string
          position: number
          printable: boolean
          types: string[]
          width_in: number
        }
        Insert: {
          cost: number
          id?: string
          is_active?: boolean
          legacy_id?: number | null
          length_in: number
          markup_pct?: number
          name: string
          position?: number
          printable?: boolean
          types: string[]
          width_in: number
        }
        Update: {
          cost?: number
          id?: string
          is_active?: boolean
          legacy_id?: number | null
          length_in?: number
          markup_pct?: number
          name?: string
          position?: number
          printable?: boolean
          types?: string[]
          width_in?: number
        }
        Relationships: []
      }
      estimator_settings: {
        Row: {
          cut_vinyl_markup: number
          default_markup: number
          id: boolean
          ink_sq_in_cost: number
          mounting_tape_markup: number
          substrate_markup: number
        }
        Insert: {
          cut_vinyl_markup?: number
          default_markup?: number
          id?: boolean
          ink_sq_in_cost?: number
          mounting_tape_markup?: number
          substrate_markup?: number
        }
        Update: {
          cut_vinyl_markup?: number
          default_markup?: number
          id?: boolean
          ink_sq_in_cost?: number
          mounting_tape_markup?: number
          substrate_markup?: number
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
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
      feedback: {
        Row: {
          body: string
          created_at: string
          created_by: string
          done_at: string | null
          done_by: string | null
          element_text: string | null
          id: string
          kind: string
          page_title: string | null
          path: string
          rect: Json | null
          selector: string | null
          status: string
          viewport: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          done_at?: string | null
          done_by?: string | null
          element_text?: string | null
          id?: string
          kind: string
          page_title?: string | null
          path: string
          rect?: Json | null
          selector?: string | null
          status?: string
          viewport?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          done_at?: string | null
          done_by?: string | null
          element_text?: string | null
          id?: string
          kind?: string
          page_title?: string | null
          path?: string
          rect?: Json | null
          selector?: string | null
          status?: string
          viewport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      google_tokens: {
        Row: {
          connected_at: string
          google_email: string
          last_error: string | null
          last_synced_at: string | null
          refresh_token: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          google_email: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token: string
          user_id: string
        }
        Update: {
          connected_at?: string
          google_email?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          cost_amount: number | null
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
          cost_amount?: number | null
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
          cost_amount?: number | null
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
          next_quote_number: number
          payment_instructions: string | null
          project_folder_template: string | null
          quote_terms: string | null
          quote_valid_days: number
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
          next_quote_number?: number
          payment_instructions?: string | null
          project_folder_template?: string | null
          quote_terms?: string | null
          quote_valid_days?: number
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
          next_quote_number?: number
          payment_instructions?: string | null
          project_folder_template?: string | null
          quote_terms?: string | null
          quote_valid_days?: number
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
          search: unknown
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
          search?: unknown
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
          search?: unknown
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
      morning_briefs: {
        Row: {
          created_at: string
          day: string
          emailed_at: string | null
          facts: Json
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          emailed_at?: string | null
          facts?: Json
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          emailed_at?: string | null
          facts?: Json
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "morning_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "morning_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "morning_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "morning_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          email: string
          in_app: boolean
          kind: string
          user_id: string
        }
        Insert: {
          email?: string
          in_app?: boolean
          kind: string
          user_id: string
        }
        Update: {
          email?: string
          in_app?: boolean
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          email: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
          work_item_id: string | null
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
          work_item_id?: string | null
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      page_templates: {
        Row: {
          color: string
          created_at: string
          description: string | null
          hours: number
          id: string
          is_active: boolean
          name: string
          position: number
          rate: number | null
          task_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          hours?: number
          id?: string
          is_active?: boolean
          name: string
          position?: number
          rate?: number | null
          task_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          hours?: number
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          rate?: number | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_templates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          key: string
          role: string
        }
        Insert: {
          key: string
          role: string
        }
        Update: {
          key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      profiles: {
        Row: {
          brief_email: boolean
          client_id: string | null
          cost_rate: number | null
          created_at: string
          default_rate: number | null
          department_id: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          tours_seen: Json
        }
        Insert: {
          brief_email?: boolean
          client_id?: string | null
          cost_rate?: number | null
          created_at?: string
          default_rate?: number | null
          department_id?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: string
          tours_seen?: Json
        }
        Update: {
          brief_email?: boolean
          client_id?: string | null
          cost_rate?: number | null
          created_at?: string
          default_rate?: number | null
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
          tours_seen?: Json
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_expenses"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
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
      project_template_items: {
        Row: {
          default_role: string | null
          estimate_hours: number | null
          id: string
          sort_order: number
          task_id: string | null
          template_id: string
          title: string
        }
        Insert: {
          default_role?: string | null
          estimate_hours?: number | null
          id?: string
          sort_order?: number
          task_id?: string | null
          template_id: string
          title: string
        }
        Update: {
          default_role?: string | null
          estimate_hours?: number | null
          id?: string
          sort_order?: number
          task_id?: string | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_items_default_role_fkey"
            columns: ["default_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "project_template_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          billing_method: Database["public"]["Enums"]["billing_method"]
          budget_amount: number | null
          budget_hours: number | null
          client_id: string
          client_visible: boolean
          code: string | null
          created_at: string
          department_id: string | null
          harvest_id: number | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          lead_id: string | null
          name: string
          search: unknown
          server_path: string | null
        }
        Insert: {
          billing_method?: Database["public"]["Enums"]["billing_method"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id: string
          client_visible?: boolean
          code?: string | null
          created_at?: string
          department_id?: string | null
          harvest_id?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name: string
          search?: unknown
          server_path?: string | null
        }
        Update: {
          billing_method?: Database["public"]["Enums"]["billing_method"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id?: string
          client_visible?: boolean
          code?: string | null
          created_at?: string
          department_id?: string | null
          harvest_id?: number | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          lead_id?: string | null
          name?: string
          search?: unknown
          server_path?: string | null
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
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          amount: number
          assignee_id: string | null
          created_at: string
          description: string
          details: Json | null
          hours: number | null
          id: string
          quote_id: string
          rate: number | null
          sort_order: number
          target_week: string | null
          task_id: string | null
          template_id: string | null
        }
        Insert: {
          amount?: number
          assignee_id?: string | null
          created_at?: string
          description: string
          details?: Json | null
          hours?: number | null
          id?: string
          quote_id: string
          rate?: number | null
          sort_order?: number
          target_week?: string | null
          task_id?: string | null
          template_id?: string | null
        }
        Update: {
          amount?: number
          assignee_id?: string | null
          created_at?: string
          description?: string
          details?: Json | null
          hours?: number | null
          id?: string
          quote_id?: string
          rate?: number | null
          sort_order?: number
          target_week?: string | null
          task_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quote_line_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "quote_line_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
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
          {
            foreignKeyName: "quote_line_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "page_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_sitemap_nodes: {
        Row: {
          created_at: string
          hours: number | null
          id: string
          line_item_id: string | null
          notes: string | null
          parent_id: string | null
          path: string | null
          quote_id: string
          sort_order: number
          template: string | null
          template_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          hours?: number | null
          id?: string
          line_item_id?: string | null
          notes?: string | null
          parent_id?: string | null
          path?: string | null
          quote_id: string
          sort_order?: number
          template?: string | null
          template_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          hours?: number | null
          id?: string
          line_item_id?: string | null
          notes?: string | null
          parent_id?: string | null
          path?: string | null
          quote_id?: string
          sort_order?: number
          template?: string | null
          template_id?: string | null
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
          {
            foreignKeyName: "quote_sitemap_nodes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "page_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_email: string | null
          client_id: string
          created_at: string
          created_by: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          intro: string | null
          number: string
          project_id: string | null
          public_token: string
          search: unknown
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          terms: string | null
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_email?: string | null
          client_id: string
          created_at?: string
          created_by: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id?: string
          intro?: string | null
          number: string
          project_id?: string | null
          public_token?: string
          search?: unknown
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          terms?: string | null
          title: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_email?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id?: string
          intro?: string | null
          number?: string
          project_id?: string | null
          public_token?: string
          search?: unknown
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          terms?: string | null
          title?: string
          updated_at?: string
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
      roles: {
        Row: {
          description: string | null
          is_builtin: boolean
          key: string
          label: string
          position: number
        }
        Insert: {
          description?: string | null
          is_builtin?: boolean
          key: string
          label: string
          position?: number
        }
        Update: {
          description?: string | null
          is_builtin?: boolean
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
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
          default_description: string | null
          default_rate: number | null
          harvest_id: number | null
          id: string
          is_active: boolean
          is_billable_default: boolean
          name: string
          qbo_item_id: string | null
        }
        Insert: {
          default_description?: string | null
          default_rate?: number | null
          harvest_id?: number | null
          id?: string
          is_active?: boolean
          is_billable_default?: boolean
          name: string
          qbo_item_id?: string | null
        }
        Update: {
          default_description?: string | null
          default_rate?: number | null
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
          cost_snapshot: number | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          ended_at: string | null
          harvest_id: number | null
          hours: number
          id: string
          is_billable: boolean
          is_locked: boolean
          notes: string | null
          project_id: string
          rate_snapshot: number | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_on: string
          started_at: string | null
          status: Database["public"]["Enums"]["time_entry_status"]
          submitted_at: string | null
          task_id: string
          updated_at: string
          user_id: string
          work_item_id: string | null
        }
        Insert: {
          batch_id?: string | null
          cost_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          ended_at?: string | null
          harvest_id?: number | null
          hours?: number
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          notes?: string | null
          project_id: string
          rate_snapshot?: number | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          submitted_at?: string | null
          task_id: string
          updated_at?: string
          user_id: string
          work_item_id?: string | null
        }
        Update: {
          batch_id?: string | null
          cost_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          ended_at?: string | null
          harvest_id?: number | null
          hours?: number
          id?: string
          is_billable?: boolean
          is_locked?: boolean
          notes?: string | null
          project_id?: string
          rate_snapshot?: number | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["time_entry_status"]
          submitted_at?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
          work_item_id?: string | null
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
            foreignKeyName: "time_entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
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
            foreignKeyName: "time_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "time_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "time_entries_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
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
      user_views: {
        Row: {
          key: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          key: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          key?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      work_item_assignees: {
        Row: {
          user_id: string
          work_item_id: string
        }
        Insert: {
          user_id: string
          work_item_id: string
        }
        Update: {
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_assignees_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          mentions: string[]
          search: unknown
          visible_to_client: boolean
          work_item_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mentions?: string[]
          search?: unknown
          visible_to_client?: boolean
          work_item_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mentions?: string[]
          search?: unknown
          visible_to_client?: boolean
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_comments_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_dependencies: {
        Row: {
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          predecessor_id: string
          successor_id: string
        }
        Update: {
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_files: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          kind: string
          link: string | null
          path: string | null
          size_bytes: number | null
          uploaded_by: string | null
          work_item_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          kind?: string
          link?: string | null
          path?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          work_item_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          link?: string | null
          path?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_files_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_focus: {
        Row: {
          created_at: string
          position: number
          user_id: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          position?: number
          user_id: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          position?: number
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_focus_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_focus_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_followers: {
        Row: {
          created_at: string
          user_id: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_followers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_followers_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_order: {
        Row: {
          position: number
          user_id: string
          work_item_id: string
        }
        Insert: {
          position: number
          user_id: string
          work_item_id: string
        }
        Update: {
          position?: number
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_order_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_order_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_item_order_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_order_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_item_order_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_plans: {
        Row: {
          day: string
          hours: number
          updated_at: string
          user_id: string
          work_item_id: string
        }
        Insert: {
          day: string
          hours: number
          updated_at?: string
          user_id: string
          work_item_id: string
        }
        Update: {
          day?: string
          hours?: number
          updated_at?: string
          user_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_plans_work_item_id_user_id_fkey"
            columns: ["work_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "work_item_assignees"
            referencedColumns: ["work_item_id", "user_id"]
          },
        ]
      }
      work_items: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assignee_id: string | null
          clickup_id: string | null
          client_decision: string | null
          client_decision_at: string | null
          client_decision_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_on: string | null
          estimate_hours: number | null
          id: string
          is_milestone: boolean
          parent_id: string | null
          position: number
          priority: Database["public"]["Enums"]["work_priority"]
          project_id: string
          public_token: string
          search: unknown
          shared_at: string | null
          start_on: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          clickup_id?: string | null
          client_decision?: string | null
          client_decision_at?: string | null
          client_decision_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id?: string
          is_milestone?: boolean
          parent_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["work_priority"]
          project_id: string
          public_token?: string
          search?: unknown
          shared_at?: string | null
          start_on?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assignee_id?: string | null
          clickup_id?: string | null
          client_decision?: string | null
          client_decision_at?: string | null
          client_decision_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_on?: string | null
          estimate_hours?: number | null
          id?: string
          is_milestone?: boolean
          parent_id?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["work_priority"]
          project_id?: string
          public_token?: string
          search?: unknown
          shared_at?: string | null
          start_on?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_budget_status"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "time_detail"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "unbilled_time"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_items_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "work_statuses"
            referencedColumns: ["key"]
          },
        ]
      }
      work_statuses: {
        Row: {
          claims_owner: boolean
          clears_owner: boolean
          color: string
          is_active: boolean
          is_client_review: boolean
          is_done: boolean
          is_paused: boolean
          is_return: boolean
          key: string
          label: string
          position: number
        }
        Insert: {
          claims_owner?: boolean
          clears_owner?: boolean
          color?: string
          is_active?: boolean
          is_client_review?: boolean
          is_done?: boolean
          is_paused?: boolean
          is_return?: boolean
          key: string
          label: string
          position?: number
        }
        Update: {
          claims_owner?: boolean
          clears_owner?: boolean
          color?: string
          is_active?: boolean
          is_client_review?: boolean
          is_done?: boolean
          is_paused?: boolean
          is_return?: boolean
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
    }
    Views: {
      calendar_connections: {
        Row: {
          connected_at: string | null
          google_email: string | null
          last_error: string | null
          last_synced_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          google_email?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "capacity_weekly"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "time_detail"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "google_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "unbilled_time"
            referencedColumns: ["user_id"]
          },
        ]
      }
      capacity_weekly: {
        Row: {
          base_hours: number | null
          booked_hours: number | null
          booked_tasks: number | null
          forecast_hours: number | null
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
      invoice_lines_detail: {
        Row: {
          amount: number | null
          cost_amount: number | null
          description: string | null
          id: string | null
          invoice_id: string | null
          kind: string | null
          margin_amount: number | null
          position: number | null
          project_id: string | null
          quantity: number | null
          taxable: boolean | null
          unit_price: number | null
        }
        Insert: {
          amount?: number | null
          cost_amount?: never
          description?: string | null
          id?: string | null
          invoice_id?: string | null
          kind?: string | null
          margin_amount?: never
          position?: number | null
          project_id?: string | null
          quantity?: number | null
          taxable?: boolean | null
          unit_price?: number | null
        }
        Update: {
          amount?: number | null
          cost_amount?: never
          description?: string | null
          id?: string | null
          invoice_id?: string | null
          kind?: string | null
          margin_amount?: never
          position?: number | null
          project_id?: string | null
          quantity?: number | null
          taxable?: boolean | null
          unit_price?: number | null
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
          status: Database["public"]["Enums"]["time_entry_status"] | null
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
          status: Database["public"]["Enums"]["time_entry_status"] | null
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
      accept_quote: {
        Args: { p_email?: string; p_name: string; p_quote_id: string }
        Returns: string
      }
      actor_name: { Args: never; Returns: string }
      apply_project_template: {
        Args: { p_project_id: string; p_template_id: string }
        Returns: number
      }
      approve_time_entries: { Args: { p_ids: string[] }; Returns: number }
      approver_of: { Args: { p_user: string }; Returns: string }
      billing_people: { Args: never; Returns: string[] }
      can_review: { Args: { p_user: string }; Returns: boolean }
      client_money: {
        Args: never
        Returns: {
          billed_all: number
          billed_year: number
          client_id: string
          outstanding: number
          unbilled: number
        }[]
      }
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
        Args: { p_batch_id?: string; p_client_id: string; p_detail?: string }
        Returns: string
      }
      create_quote: {
        Args: { p_client_id: string; p_title: string }
        Returns: string
      }
      decline_quote: {
        Args: { p_name: string; p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      entry_history: {
        Args: { p_id: string; p_table: string }
        Returns: {
          action: string
          changed_at: string
          changed_by: string
          changed_by_name: string
          changed_fields: string[]
          new_data: Json
          old_data: Json
        }[]
      }
      hand_off: {
        Args: { p_item: string; p_note?: string; p_to?: string }
        Returns: undefined
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      hours_text: { Args: { h: number }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_client: { Args: never; Returns: boolean }
      my_client_id: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_quote_number: { Args: never; Returns: string }
      notification_email_default: { Args: { p_kind: string }; Returns: string }
      notify: {
        Args: {
          p_actor?: string
          p_body?: string
          p_email?: string
          p_item?: string
          p_kind: string
          p_link?: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      nudge_unowned_tasks: { Args: never; Returns: number }
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
      project_history: {
        Args: { p_words: string[] }
        Returns: {
          amount: number
          client_name: string
          first_on: string
          hours: number
          last_on: string
          name: string
          project_id: string
        }[]
      }
      purge_deleted: { Args: never; Returns: undefined }
      quote_line_margins: {
        Args: { p_quote_id: string }
        Returns: {
          cost: number
          line_item_id: string
          margin: number
        }[]
      }
      quote_recalc: { Args: { p_quote_id: string }; Returns: undefined }
      recalc_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
      reject_time_entries: {
        Args: { p_ids: string[]; p_reason: string }
        Returns: number
      }
      relink_harvest_archive: { Args: never; Returns: number }
      report_expenses: {
        Args: {
          p_billable?: boolean
          p_category?: string
          p_client?: string
          p_from: string
          p_group: string
          p_person?: string
          p_project?: string
          p_to: string
        }
        Returns: {
          amount: number
          billable_amount: number
          key: string
          label: string
          sublabel: string
          uninvoiced_amount: number
        }[]
      }
      report_rollup: {
        Args: {
          p_billable?: boolean
          p_client?: string
          p_from: string
          p_person?: string
          p_project?: string
          p_task?: string
          p_to: string
        }
        Returns: {
          billable_amount: number
          billable_hours: number
          expenses: number
          hours: number
          uninvoiced_amount: number
        }[]
      }
      report_time: {
        Args: {
          p_billable?: boolean
          p_client?: string
          p_from: string
          p_group: string
          p_person?: string
          p_project?: string
          p_task?: string
          p_to: string
        }
        Returns: {
          billable_amount: number
          billable_hours: number
          hours: number
          key: string
          label: string
          sublabel: string
          uninvoiced_amount: number
        }[]
      }
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
      restore_deleted: {
        Args: { p_id: string; p_table: string }
        Returns: undefined
      }
      retainer_period_detail: {
        Args: { p_retainer_id: string }
        Returns: {
          amount: number
          entry_id: string
          hours: number
          notes: string
          project_id: string
          project_name: string
          spent_on: string
          task_name: string
          user_name: string
        }[]
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
      run_due_notifications: { Args: never; Returns: number }
      run_invoice_reminders: {
        Args: { p_dry_run?: boolean; p_force?: boolean }
        Returns: {
          invoice_number: string
          sent: boolean
          to_emails: string[]
        }[]
      }
      run_notification_emails: { Args: never; Returns: number }
      run_reminders: {
        Args: { p_dry_run?: boolean }
        Returns: {
          email: string
          kind: Database["public"]["Enums"]["reminder_kind"]
          sent: boolean
          subject: string
        }[]
      }
      search: {
        Args: { p_kind?: string; p_limit?: number; p_q: string }
        Returns: {
          id: string
          kind: string
          rank: number
          subtitle: string
          title: string
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
      task_people: { Args: { p_item: string }; Returns: string[] }
      task_visible: { Args: { p_item: string }; Returns: boolean }
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
      time_entry_status: "draft" | "submitted" | "approved" | "rejected"
      time_off_kind: "pto" | "holiday" | "unpaid" | "sick"
      work_priority: "low" | "normal" | "high" | "urgent"
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
      time_entry_status: ["draft", "submitted", "approved", "rejected"],
      time_off_kind: ["pto", "holiday", "unpaid", "sick"],
      work_priority: ["low", "normal", "high", "urgent"],
    },
  },
} as const
