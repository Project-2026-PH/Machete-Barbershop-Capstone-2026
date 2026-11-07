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
      appointments: {
        Row: {
          barber_id: number | null
          branch_id: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_int_id: number | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          other_notes: string | null
          queue_entry_id: number | null
          scheduled_date: string | null
          scheduled_start_at: string | null
          scheduled_time: string | null
          service_id: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          barber_id?: number | null
          branch_id?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_int_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          other_notes?: string | null
          queue_entry_id?: number | null
          scheduled_date?: string | null
          scheduled_start_at?: string | null
          scheduled_time?: string | null
          service_id?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          barber_id?: number | null
          branch_id?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_int_id?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          other_notes?: string | null
          queue_entry_id?: number | null
          scheduled_date?: string | null
          scheduled_start_at?: string | null
          scheduled_time?: string | null
          service_id?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "appointments_customer_int_id_fkey"
            columns: ["customer_int_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "appointments_customer_int_id_fkey"
            columns: ["customer_int_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "appointments_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          audit_id: string
          created_at: string | null
          details: Json | null
          ip_address: string | null
          resource: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          audit_id?: string
          created_at?: string | null
          details?: Json | null
          ip_address?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          audit_id?: string
          created_at?: string | null
          details?: Json | null
          ip_address?: string | null
          resource?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auth_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          max_attempts: number
          purpose: string
          reset_token_expires_at: string | null
          reset_token_hash: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          max_attempts?: number
          purpose: string
          reset_token_expires_at?: string | null
          reset_token_hash?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          purpose?: string
          reset_token_expires_at?: string | null
          reset_token_hash?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_otps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auth_throttle: {
        Row: {
          count: number
          key: string
          locked_until: string | null
          scope: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          locked_until?: string | null
          scope: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          locked_until?: string | null
          scope?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      barber_portfolio_items: {
        Row: {
          barber_id: number
          caption: string | null
          created_at: string | null
          id: number
          image_url: string
          service_id: number | null
          storage_path: string
        }
        Insert: {
          barber_id: number
          caption?: string | null
          created_at?: string | null
          id?: number
          image_url: string
          service_id?: number | null
          storage_path: string
        }
        Update: {
          barber_id?: number
          caption?: string | null
          created_at?: string | null
          id?: number
          image_url?: string
          service_id?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_portfolio_items_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "barber_portfolio_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      barber_shift_requests: {
        Row: {
          admin_notes: string | null
          barber_id: number | null
          cooldown_until: string | null
          created_at: string
          id: number
          reason: string
          request_type: string
          shift_date: string
          status: string
          target_barber_name: string | null
          target_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          barber_id?: number | null
          cooldown_until?: string | null
          created_at?: string
          id?: number
          reason: string
          request_type: string
          shift_date: string
          status?: string
          target_barber_name?: string | null
          target_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          barber_id?: number | null
          cooldown_until?: string | null
          created_at?: string
          id?: number
          reason?: string
          request_type?: string
          shift_date?: string
          status?: string
          target_barber_name?: string | null
          target_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barber_shift_requests_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "barber_shift_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      barber_specialties: {
        Row: {
          barber_id: number
          created_at: string | null
          id: number
          service_id: number
        }
        Insert: {
          barber_id: number
          created_at?: string | null
          id?: number
          service_id: number
        }
        Update: {
          barber_id?: number
          created_at?: string | null
          id?: number
          service_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "barber_specialties_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "barber_specialties_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      barbers: {
        Row: {
          barber_id: number
          bio: string | null
          current_cash_advance: number | null
          is_active: boolean | null
          name: string | null
          status: Database["public"]["Enums"]["barber_status_type"] | null
          user_id: string | null
        }
        Insert: {
          barber_id?: number
          bio?: string | null
          current_cash_advance?: number | null
          is_active?: boolean | null
          name?: string | null
          status?: Database["public"]["Enums"]["barber_status_type"] | null
          user_id?: string | null
        }
        Update: {
          barber_id?: number
          bio?: string | null
          current_cash_advance?: number | null
          is_active?: boolean | null
          name?: string | null
          status?: Database["public"]["Enums"]["barber_status_type"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bottle_lifecycle_logs: {
        Row: {
          barber_id: number
          branch_id: number
          created_at: string
          estimated_remaining_percent: number | null
          id: string
          inventory_stock_id: number
          issued_at: string
          issued_at_customer_count: number
          logged_by: string | null
          notes: string | null
          return_condition: string | null
          returned_at: string | null
          returned_at_customer_count: number | null
          status: string
        }
        Insert: {
          barber_id: number
          branch_id: number
          created_at?: string
          estimated_remaining_percent?: number | null
          id?: string
          inventory_stock_id: number
          issued_at?: string
          issued_at_customer_count: number
          logged_by?: string | null
          notes?: string | null
          return_condition?: string | null
          returned_at?: string | null
          returned_at_customer_count?: number | null
          status?: string
        }
        Update: {
          barber_id?: number
          branch_id?: number
          created_at?: string
          estimated_remaining_percent?: number | null
          id?: string
          inventory_stock_id?: number
          issued_at?: string
          issued_at_customer_count?: number
          logged_by?: string | null
          notes?: string | null
          return_condition?: string | null
          returned_at?: string | null
          returned_at_customer_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bottle_lifecycle_logs_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "bottle_lifecycle_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "bottle_lifecycle_logs_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
          {
            foreignKeyName: "bottle_lifecycle_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          branch_id: number
          contact_email: string | null
          daily_float: number | null
          image_url: string | null
          name: string
          settings: Json | null
        }
        Insert: {
          address?: string | null
          branch_id?: number
          contact_email?: string | null
          daily_float?: number | null
          image_url?: string | null
          name: string
          settings?: Json | null
        }
        Update: {
          address?: string | null
          branch_id?: number
          contact_email?: string | null
          daily_float?: number | null
          image_url?: string | null
          name?: string
          settings?: Json | null
        }
        Relationships: []
      }
      cash_advances: {
        Row: {
          amount_borrowed: number
          balance_remaining: number
          barber_id: number | null
          ca_id: number
          created_at: string | null
          status: string | null
        }
        Insert: {
          amount_borrowed: number
          balance_remaining: number
          barber_id?: number | null
          ca_id?: number
          created_at?: string | null
          status?: string | null
        }
        Update: {
          amount_borrowed?: number
          balance_remaining?: number
          barber_id?: number | null
          ca_id?: number
          created_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_advances_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          customer_id: number
          email: string | null
          email_notifications_enabled: boolean
          first_name: string
          last_name: string
          phone_number: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: number
          email?: string | null
          email_notifications_enabled?: boolean
          first_name: string
          last_name: string
          phone_number?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: number
          email?: string | null
          email_notifications_enabled?: boolean
          first_name?: string
          last_name?: string
          phone_number?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      daily_audits: {
        Row: {
          audit_date: string | null
          audit_id: number
          blind_cash_count: number
          branch_id: number | null
          daily_float_start: number | null
          expected_cash: number | null
          shortage_amount: number | null
          status: string | null
        }
        Insert: {
          audit_date?: string | null
          audit_id?: number
          blind_cash_count: number
          branch_id?: number | null
          daily_float_start?: number | null
          expected_cash?: number | null
          shortage_amount?: number | null
          status?: string | null
        }
        Update: {
          audit_date?: string | null
          audit_id?: number
          blind_cash_count?: number
          branch_id?: number | null
          daily_float_start?: number | null
          expected_cash?: number | null
          shortage_amount?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_audits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      dim_date: {
        Row: {
          date_key: number
          day_name: string | null
          day_of_week: number | null
          full_date: string | null
          is_holiday: boolean | null
          is_weekend: boolean | null
          month: number | null
          month_name: string | null
          quarter: number | null
          year: number | null
        }
        Insert: {
          date_key: number
          day_name?: string | null
          day_of_week?: number | null
          full_date?: string | null
          is_holiday?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          month_name?: string | null
          quarter?: number | null
          year?: number | null
        }
        Update: {
          date_key?: number
          day_name?: string | null
          day_of_week?: number | null
          full_date?: string | null
          is_holiday?: boolean | null
          is_weekend?: boolean | null
          month?: number | null
          month_name?: string | null
          quarter?: number | null
          year?: number | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: number | null
          created_at: string | null
          description: string
          expense_id: number
        }
        Insert: {
          amount: number
          branch_id?: number | null
          created_at?: string | null
          description: string
          expense_id?: number
        }
        Update: {
          amount?: number
          branch_id?: number | null
          created_at?: string | null
          description?: string
          expense_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      fact_daily_sales: {
        Row: {
          branch_id: number | null
          date_key: number | null
          fact_id: number
          total_customers_served: number | null
          total_discounts_given: number | null
          total_revenue: number | null
          total_transactions: number | null
          weather_condition: string | null
        }
        Insert: {
          branch_id?: number | null
          date_key?: number | null
          fact_id?: number
          total_customers_served?: number | null
          total_discounts_given?: number | null
          total_revenue?: number | null
          total_transactions?: number | null
          weather_condition?: string | null
        }
        Update: {
          branch_id?: number | null
          date_key?: number | null
          fact_id?: number
          total_customers_served?: number | null
          total_discounts_given?: number | null
          total_revenue?: number | null
          total_transactions?: number | null
          weather_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fact_daily_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "fact_daily_sales_date_key_fkey"
            columns: ["date_key"]
            isOneToOne: false
            referencedRelation: "dim_date"
            referencedColumns: ["date_key"]
          },
        ]
      }
      group_bookings: {
        Row: {
          branch_id: number
          created_at: string
          customer_id: number
          id: string
          payment_method: string | null
          payment_method_id: string | null
          proof_image_url: string | null
          recipient_identifier_detected: string | null
          reference_number: string | null
          status: string
          total_deposit: number
          total_guests: number
        }
        Insert: {
          branch_id: number
          created_at?: string
          customer_id: number
          id?: string
          payment_method?: string | null
          payment_method_id?: string | null
          proof_image_url?: string | null
          recipient_identifier_detected?: string | null
          reference_number?: string | null
          status?: string
          total_deposit?: number
          total_guests?: number
        }
        Update: {
          branch_id?: number
          created_at?: string
          customer_id?: number
          id?: string
          payment_method?: string | null
          payment_method_id?: string | null
          proof_image_url?: string | null
          recipient_identifier_detected?: string | null
          reference_number?: string | null
          status?: string
          total_deposit?: number
          total_guests?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "group_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "group_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      guest_profiles: {
        Row: {
          branch_id: number
          business_date: string
          created_at: string
          created_by: string | null
          daily_sequence: number
          guest_profile_id: number
          guest_reference: string
          idempotency_key: string | null
          linked_customer_id: number | null
          name_digest: string
          normalized_name: string
          qr_expires_at: string
          qr_redeemed_at: string | null
          qr_token_hash: string
        }
        Insert: {
          branch_id: number
          business_date: string
          created_at?: string
          created_by?: string | null
          daily_sequence: number
          guest_profile_id?: number
          guest_reference: string
          idempotency_key?: string | null
          linked_customer_id?: number | null
          name_digest: string
          normalized_name: string
          qr_expires_at: string
          qr_redeemed_at?: string | null
          qr_token_hash: string
        }
        Update: {
          branch_id?: number
          business_date?: string
          created_at?: string
          created_by?: string | null
          daily_sequence?: number
          guest_profile_id?: number
          guest_reference?: string
          idempotency_key?: string | null
          linked_customer_id?: number | null
          name_digest?: string
          normalized_name?: string
          qr_expires_at?: string
          qr_redeemed_at?: string | null
          qr_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "guest_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guest_profiles_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "guest_profiles_linked_customer_id_fkey"
            columns: ["linked_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      guest_reference_counters: {
        Row: {
          branch_id: number
          business_date: string
          next_sequence: number
        }
        Insert: {
          branch_id: number
          business_date: string
          next_sequence?: number
        }
        Update: {
          branch_id?: number
          business_date?: string
          next_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "guest_reference_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      inventory_consumption: {
        Row: {
          branch_id: number | null
          consumed_at: string
          created_at: string
          created_by: string | null
          inventory_consumption_id: number
          inventory_stock_id: number
          quantity: number
          recipe_quantity: number | null
          recipe_rule_id: number | null
          recipe_unit: string | null
          recipe_version: number | null
          service_id: number | null
          source_id: string | null
          source_type: string
          transaction_id: number | null
        }
        Insert: {
          branch_id?: number | null
          consumed_at?: string
          created_at?: string
          created_by?: string | null
          inventory_consumption_id?: number
          inventory_stock_id: number
          quantity: number
          recipe_quantity?: number | null
          recipe_rule_id?: number | null
          recipe_unit?: string | null
          recipe_version?: number | null
          service_id?: number | null
          source_id?: string | null
          source_type: string
          transaction_id?: number | null
        }
        Update: {
          branch_id?: number | null
          consumed_at?: string
          created_at?: string
          created_by?: string | null
          inventory_consumption_id?: number
          inventory_stock_id?: number
          quantity?: number
          recipe_quantity?: number | null
          recipe_rule_id?: number | null
          recipe_unit?: string | null
          recipe_version?: number | null
          service_id?: number | null
          source_id?: string | null
          source_type?: string
          transaction_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_consumption_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_consumption_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_consumption_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
          {
            foreignKeyName: "inventory_consumption_recipe_rule_id_fkey"
            columns: ["recipe_rule_id"]
            isOneToOne: false
            referencedRelation: "inventory_service_usage_rules"
            referencedColumns: ["inventory_usage_rule_id"]
          },
          {
            foreignKeyName: "inventory_consumption_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "inventory_consumption_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      inventory_products: {
        Row: {
          branch_id: number | null
          category: string
          cost_price: number
          created_at: string
          created_by: string | null
          critical_threshold: number
          default_supplier_id: string | null
          high_volume_multiplier: number
          image_url: string | null
          inventory_product_id: number
          is_active: boolean
          name: string
          ownership_type: string
          retail_category: string | null
          retail_price: number | null
          safety_stock: number
          show_in_shop: boolean
          tags: string[]
          unit: string
        }
        Insert: {
          branch_id?: number | null
          category: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          critical_threshold?: number
          default_supplier_id?: string | null
          high_volume_multiplier?: number
          image_url?: string | null
          inventory_product_id?: number
          is_active?: boolean
          name: string
          ownership_type: string
          retail_category?: string | null
          retail_price?: number | null
          safety_stock?: number
          show_in_shop?: boolean
          tags?: string[]
          unit: string
        }
        Update: {
          branch_id?: number | null
          category?: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          critical_threshold?: number
          default_supplier_id?: string | null
          high_volume_multiplier?: number
          image_url?: string | null
          inventory_product_id?: number
          is_active?: boolean
          name?: string
          ownership_type?: string
          retail_category?: string | null
          retail_price?: number | null
          safety_stock?: number
          show_in_shop?: boolean
          tags?: string[]
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_restock_requests: {
        Row: {
          branch_id: number | null
          consumption_period: string
          created_at: string
          inventory_restock_request_id: number
          inventory_stock_id: number
          notes: string | null
          rejection_reason: string | null
          requested_by: string
          requested_quantity: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          branch_id?: number | null
          consumption_period: string
          created_at?: string
          inventory_restock_request_id?: number
          inventory_stock_id: number
          notes?: string | null
          rejection_reason?: string | null
          requested_by: string
          requested_quantity: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          branch_id?: number | null
          consumption_period?: string
          created_at?: string
          inventory_restock_request_id?: number
          inventory_stock_id?: number
          notes?: string | null
          rejection_reason?: string | null
          requested_by?: string
          requested_quantity?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restock_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_restock_requests_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
          {
            foreignKeyName: "inventory_restock_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_restock_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inventory_retail_sale_lines: {
        Row: {
          branch_id: number | null
          created_at: string
          inventory_product_id: number
          inventory_retail_sale_line_id: number
          quantity: number
          queue_entry_id: number | null
          transaction_id: number | null
          unit_price: number
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          inventory_product_id: number
          inventory_retail_sale_line_id?: number
          quantity: number
          queue_entry_id?: number | null
          transaction_id?: number | null
          unit_price: number
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          inventory_product_id?: number
          inventory_retail_sale_line_id?: number
          quantity?: number
          queue_entry_id?: number | null
          transaction_id?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_retail_sale_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_retail_sale_lines_inventory_product_id_fkey"
            columns: ["inventory_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["inventory_product_id"]
          },
          {
            foreignKeyName: "inventory_retail_sale_lines_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_retail_sale_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      inventory_service_usage_rules: {
        Row: {
          branch_id: number | null
          created_at: string
          created_by: string | null
          inventory_product_id: number
          inventory_usage_rule_id: number
          is_active: boolean
          quantity: number
          service_id: number
          updated_at: string
          version: number
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          inventory_product_id: number
          inventory_usage_rule_id?: number
          is_active?: boolean
          quantity: number
          service_id: number
          updated_at?: string
          version?: number
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          inventory_product_id?: number
          inventory_usage_rule_id?: number
          is_active?: boolean
          quantity?: number
          service_id?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_service_usage_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_service_usage_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_service_usage_rules_inventory_product_id_fkey"
            columns: ["inventory_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["inventory_product_id"]
          },
          {
            foreignKeyName: "inventory_service_usage_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          assigned_barber_id: number | null
          branch_id: number | null
          current_quantity: number
          inventory_product_id: number
          inventory_stock_id: number
          is_active: boolean | null
          updated_at: string
          version: number
        }
        Insert: {
          assigned_barber_id?: number | null
          branch_id?: number | null
          current_quantity?: number
          inventory_product_id: number
          inventory_stock_id?: number
          is_active?: boolean | null
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_barber_id?: number | null
          branch_id?: number | null
          current_quantity?: number
          inventory_product_id?: number
          inventory_stock_id?: number
          is_active?: boolean | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_assigned_barber_id_fkey"
            columns: ["assigned_barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "inventory_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_stock_inventory_product_id_fkey"
            columns: ["inventory_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_products"
            referencedColumns: ["inventory_product_id"]
          },
        ]
      }
      inventory_stock_count_lines: {
        Row: {
          counted_quantity: number
          inventory_stock_id: number
          notes: string | null
          stock_count_id: number
          stock_count_line_id: number
        }
        Insert: {
          counted_quantity: number
          inventory_stock_id: number
          notes?: string | null
          stock_count_id: number
          stock_count_line_id?: number
        }
        Update: {
          counted_quantity?: number
          inventory_stock_id?: number
          notes?: string | null
          stock_count_id?: number
          stock_count_line_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_count_lines_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
          {
            foreignKeyName: "inventory_stock_count_lines_stock_count_id_fkey"
            columns: ["stock_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_count_submissions"
            referencedColumns: ["stock_count_id"]
          },
        ]
      }
      inventory_stock_count_submissions: {
        Row: {
          branch_id: number | null
          count_date: string
          created_at: string
          notes: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift: string
          status: string
          stock_count_id: number
          submitted_by: string
          submitted_by_role: string | null
        }
        Insert: {
          branch_id?: number | null
          count_date?: string
          created_at?: string
          notes?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift: string
          status?: string
          stock_count_id?: number
          submitted_by: string
          submitted_by_role?: string | null
        }
        Update: {
          branch_id?: number | null
          count_date?: string
          created_at?: string
          notes?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift?: string
          status?: string
          stock_count_id?: number
          submitted_by?: string
          submitted_by_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_count_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_stock_count_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_stock_count_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inventory_stock_movements: {
        Row: {
          branch_id: number | null
          created_at: string
          created_by: string | null
          inventory_movement_id: number
          inventory_stock_id: number
          movement_type: string
          quantity_after: number
          quantity_before: number
          quantity_delta: number
          reason: string | null
          source_id: string | null
          source_type: string | null
          unit_cost: number | null
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          inventory_movement_id?: number
          inventory_stock_id: number
          movement_type: string
          quantity_after: number
          quantity_before: number
          quantity_delta: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number | null
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          created_by?: string | null
          inventory_movement_id?: number
          inventory_stock_id?: number
          movement_type?: string
          quantity_after?: number
          quantity_before?: number
          quantity_delta?: number
          reason?: string | null
          source_id?: string | null
          source_type?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
        ]
      }
      machine_clients: {
        Row: {
          allowed_scopes: string[]
          client_id: string
          created_at: string
          created_by: string | null
          disabled_at: string | null
          expires_at: string | null
          last_used_at: string | null
          name: string
          revoked_at: string | null
          secret_hash: string
          status: string
          updated_at: string
        }
        Insert: {
          allowed_scopes: string[]
          client_id: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          secret_hash: string
          status?: string
          updated_at?: string
        }
        Update: {
          allowed_scopes?: string[]
          client_id?: string
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          secret_hash?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          branch_id: number | null
          created_at: string
          dedupe_key: string
          event: string
          id: number
          message: string
          metadata: Json | null
          queue_entry_id: number | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          dedupe_key: string
          event: string
          id?: number
          message: string
          metadata?: Json | null
          queue_entry_id?: number | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          dedupe_key?: string
          event?: string
          id?: number
          message?: string
          metadata?: Json | null
          queue_entry_id?: number | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "notifications_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      oauth_transactions: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          redirect_uri: string | null
          state_hash: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at: string
          redirect_uri?: string | null
          state_hash: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          redirect_uri?: string | null
          state_hash?: string
        }
        Relationships: []
      }
      password_change_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          is_used: boolean
          max_attempts: number
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          is_used?: boolean
          max_attempts?: number
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          max_attempts?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_change_otps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          authoritative_amount: number
          automated_review: Json | null
          branch_id: number
          created_at: string
          customer_id: number | null
          evidence_validation_mode: string | null
          evidence_validation_status: string | null
          gcash_ref_no: string | null
          idempotency_key: string
          manual_review_reason: string | null
          manually_reviewed_at: string | null
          manually_reviewed_by: string | null
          payment_attempt_id: number
          payment_method: string
          queue_entry_id: number
          receipt_height: number | null
          receipt_sha256: string | null
          receipt_storage_path: string | null
          receipt_width: number | null
          recipient_identifier_detected: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          authoritative_amount: number
          automated_review?: Json | null
          branch_id: number
          created_at?: string
          customer_id?: number | null
          evidence_validation_mode?: string | null
          evidence_validation_status?: string | null
          gcash_ref_no?: string | null
          idempotency_key: string
          manual_review_reason?: string | null
          manually_reviewed_at?: string | null
          manually_reviewed_by?: string | null
          payment_attempt_id?: number
          payment_method: string
          queue_entry_id: number
          receipt_height?: number | null
          receipt_sha256?: string | null
          receipt_storage_path?: string | null
          receipt_width?: number | null
          recipient_identifier_detected?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          authoritative_amount?: number
          automated_review?: Json | null
          branch_id?: number
          created_at?: string
          customer_id?: number | null
          evidence_validation_mode?: string | null
          evidence_validation_status?: string | null
          gcash_ref_no?: string | null
          idempotency_key?: string
          manual_review_reason?: string | null
          manually_reviewed_at?: string | null
          manually_reviewed_by?: string | null
          payment_attempt_id?: number
          payment_method?: string
          queue_entry_id?: number
          receipt_height?: number | null
          receipt_sha256?: string | null
          receipt_storage_path?: string | null
          receipt_width?: number | null
          recipient_identifier_detected?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "payment_attempts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_attempts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_attempts_manually_reviewed_by_fkey"
            columns: ["manually_reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_attempts_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          id: string
          inventory_stock_id: number
          notes: string | null
          po_id: string
          quantity_requested: number
          supplier_id: string | null
          unit_cost: number | null
        }
        Insert: {
          id?: string
          inventory_stock_id: number
          notes?: string | null
          po_id: string
          quantity_requested: number
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Update: {
          id?: string
          inventory_stock_id?: number
          notes?: string | null
          po_id?: string
          quantity_requested?: number
          supplier_id?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_inventory_stock_id_fkey"
            columns: ["inventory_stock_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["inventory_stock_id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: number
          created_at: string
          created_by: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          notes: string | null
          po_number: string
          receipt_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          branch_id: number
          created_at?: string
          created_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          po_number: string
          receipt_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          branch_id?: number
          created_at?: string
          created_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          notes?: string | null
          po_number?: string
          receipt_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      queue_entries: {
        Row: {
          accent_style: string | null
          arrival_deadline_at: string | null
          arrived_at: string | null
          barber_id: number | null
          base_style: string | null
          branch_id: number
          cancel_reason: string | null
          cancel_type: string | null
          created_at: string | null
          customer_id: number | null
          customer_name: string | null
          duration_minutes: number | null
          emergency_cancellation_reason: string | null
          emergency_cancellation_type: string | null
          emergency_cancelled_at: string | null
          estimated_start_at: string | null
          expires_at: string | null
          group_booking_id: string | null
          guest_name: string | null
          guest_profile_id: number | null
          haircut_length: string | null
          haircut_photo_url: string | null
          id: number
          image_hash: string | null
          is_emergency_cancelled: boolean | null
          is_test: boolean
          is_walk_in: boolean | null
          no_show_at: string | null
          ocr_reference_number: string | null
          offline_idempotency_key: string | null
          payment_status:
            | Database["public"]["Enums"]["payment_status_type"]
            | null
          position: number
          preferred_date: string | null
          preferred_time: string | null
          proof_image_url: string | null
          rebooked_from_queue_id: number | null
          rebooking_status: string | null
          recipient_identifier_detected: string | null
          reference_number: string | null
          reservation_fee_disposition: string | null
          retail_items: Json
          schedule_adjustment_status: string
          schedule_delay_minutes: number
          scheduled_start_at: string | null
          service_ends_at: string | null
          service_id: number | null
          service_ids: number[]
          service_started_at: string | null
          specs_notes: string | null
          status: Database["public"]["Enums"]["queue_status_type"]
          timer_started_at: string | null
        }
        Insert: {
          accent_style?: string | null
          arrival_deadline_at?: string | null
          arrived_at?: string | null
          barber_id?: number | null
          base_style?: string | null
          branch_id: number
          cancel_reason?: string | null
          cancel_type?: string | null
          created_at?: string | null
          customer_id?: number | null
          customer_name?: string | null
          duration_minutes?: number | null
          emergency_cancellation_reason?: string | null
          emergency_cancellation_type?: string | null
          emergency_cancelled_at?: string | null
          estimated_start_at?: string | null
          expires_at?: string | null
          group_booking_id?: string | null
          guest_name?: string | null
          guest_profile_id?: number | null
          haircut_length?: string | null
          haircut_photo_url?: string | null
          id?: number
          image_hash?: string | null
          is_emergency_cancelled?: boolean | null
          is_test?: boolean
          is_walk_in?: boolean | null
          no_show_at?: string | null
          ocr_reference_number?: string | null
          offline_idempotency_key?: string | null
          payment_status?:
            | Database["public"]["Enums"]["payment_status_type"]
            | null
          position: number
          preferred_date?: string | null
          preferred_time?: string | null
          proof_image_url?: string | null
          rebooked_from_queue_id?: number | null
          rebooking_status?: string | null
          recipient_identifier_detected?: string | null
          reference_number?: string | null
          reservation_fee_disposition?: string | null
          retail_items?: Json
          schedule_adjustment_status?: string
          schedule_delay_minutes?: number
          scheduled_start_at?: string | null
          service_ends_at?: string | null
          service_id?: number | null
          service_ids?: number[]
          service_started_at?: string | null
          specs_notes?: string | null
          status?: Database["public"]["Enums"]["queue_status_type"]
          timer_started_at?: string | null
        }
        Update: {
          accent_style?: string | null
          arrival_deadline_at?: string | null
          arrived_at?: string | null
          barber_id?: number | null
          base_style?: string | null
          branch_id?: number
          cancel_reason?: string | null
          cancel_type?: string | null
          created_at?: string | null
          customer_id?: number | null
          customer_name?: string | null
          duration_minutes?: number | null
          emergency_cancellation_reason?: string | null
          emergency_cancellation_type?: string | null
          emergency_cancelled_at?: string | null
          estimated_start_at?: string | null
          expires_at?: string | null
          group_booking_id?: string | null
          guest_name?: string | null
          guest_profile_id?: number | null
          haircut_length?: string | null
          haircut_photo_url?: string | null
          id?: number
          image_hash?: string | null
          is_emergency_cancelled?: boolean | null
          is_test?: boolean
          is_walk_in?: boolean | null
          no_show_at?: string | null
          ocr_reference_number?: string | null
          offline_idempotency_key?: string | null
          payment_status?:
            | Database["public"]["Enums"]["payment_status_type"]
            | null
          position?: number
          preferred_date?: string | null
          preferred_time?: string | null
          proof_image_url?: string | null
          rebooked_from_queue_id?: number | null
          rebooking_status?: string | null
          recipient_identifier_detected?: string | null
          reference_number?: string | null
          reservation_fee_disposition?: string | null
          retail_items?: Json
          schedule_adjustment_status?: string
          schedule_delay_minutes?: number
          scheduled_start_at?: string | null
          service_ends_at?: string | null
          service_id?: number | null
          service_ids?: number[]
          service_started_at?: string | null
          specs_notes?: string | null
          status?: Database["public"]["Enums"]["queue_status_type"]
          timer_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "queue_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "queue_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "queue_entries_group_booking_id_fkey"
            columns: ["group_booking_id"]
            isOneToOne: false
            referencedRelation: "group_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_guest_profile_id_fkey"
            columns: ["guest_profile_id"]
            isOneToOne: false
            referencedRelation: "guest_profiles"
            referencedColumns: ["guest_profile_id"]
          },
          {
            foreignKeyName: "queue_entries_rebooked_from_queue_id_fkey"
            columns: ["rebooked_from_queue_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      queue_entry_services: {
        Row: {
          created_at: string
          queue_entry_id: number
          service_id: number
        }
        Insert: {
          created_at?: string
          queue_entry_id: number
          service_id: number
        }
        Update: {
          created_at?: string
          queue_entry_id?: number
          service_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "queue_entry_services_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_entry_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      ratings: {
        Row: {
          barber_id: number
          comment: string | null
          created_at: string | null
          customer_id: number
          is_public_test: boolean
          is_test: boolean
          queue_id: number | null
          rating_id: number
          service_id: number | null
          stars: number
        }
        Insert: {
          barber_id: number
          comment?: string | null
          created_at?: string | null
          customer_id: number
          is_public_test?: boolean
          is_test?: boolean
          queue_id?: number | null
          rating_id?: number
          service_id?: number | null
          stars: number
        }
        Update: {
          barber_id?: number
          comment?: string | null
          created_at?: string | null
          customer_id?: number
          is_public_test?: boolean
          is_test?: boolean
          queue_id?: number | null
          rating_id?: number
          service_id?: number | null
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "ratings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ratings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "ratings_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
        ]
      }
      receipt_attachments: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          receipt_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type: string
          receipt_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          receipt_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_attachments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_documents: {
        Row: {
          branch_id: number
          created_at: string
          document_version: number
          email_attempts: number
          email_last_attempt_at: string | null
          email_last_error: string | null
          email_sent_at: string | null
          email_status: string
          queue_entry_id: number | null
          receipt_data: Json
          receipt_document_id: number
          receipt_number: string
          recipient_email: string | null
          transaction_id: number | null
          updated_at: string
        }
        Insert: {
          branch_id: number
          created_at?: string
          document_version?: number
          email_attempts?: number
          email_last_attempt_at?: string | null
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          queue_entry_id?: number | null
          receipt_data: Json
          receipt_document_id?: number
          receipt_number: string
          recipient_email?: string | null
          transaction_id?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: number
          created_at?: string
          document_version?: number
          email_attempts?: number
          email_last_attempt_at?: string | null
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          queue_entry_id?: number | null
          receipt_data?: Json
          receipt_document_id?: number
          receipt_number?: string
          recipient_email?: string | null
          transaction_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "receipt_documents_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: true
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      receipts: {
        Row: {
          branch_id: number
          created_at: string
          id: string
          notes: string | null
          purchase_date: string
          receipt_image_url: string | null
          receipt_number: string | null
          supplier_id: string | null
          total_amount: number | null
          uploaded_by: string | null
        }
        Insert: {
          branch_id: number
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date: string
          receipt_image_url?: string | null
          receipt_number?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          uploaded_by?: string | null
        }
        Update: {
          branch_id?: number
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date?: string
          receipt_image_url?: string | null
          receipt_number?: string | null
          supplier_id?: string | null
          total_amount?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      retail_categories: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      retail_tags: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string | null
          description: string | null
          duration_minutes: number | null
          image_url: string | null
          price: number
          service_id: number
          sub_category: string | null
          title: string
        }
        Insert: {
          category?: string | null
          description?: string | null
          duration_minutes?: number | null
          image_url?: string | null
          price: number
          service_id?: number
          sub_category?: string | null
          title: string
        }
        Update: {
          category?: string | null
          description?: string | null
          duration_minutes?: number | null
          image_url?: string | null
          price?: number
          service_id?: number
          sub_category?: string | null
          title?: string
        }
        Relationships: []
      }
      staff_shift_assignments: {
        Row: {
          created_at: string
          end_time: string | null
          is_off: boolean
          is_online_booking_enabled: boolean
          month: number
          role: string
          shift_date: string
          source: string
          staff_shift_assignment_id: number
          start_time: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          is_off?: boolean
          is_online_booking_enabled?: boolean
          month: number
          role: string
          shift_date: string
          source?: string
          staff_shift_assignment_id?: number
          start_time?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          end_time?: string | null
          is_off?: boolean
          is_online_booking_enabled?: boolean
          month?: number
          role?: string
          shift_date?: string
          source?: string
          staff_shift_assignment_id?: number
          start_time?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_shift_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stock_report_emails: {
        Row: {
          branch_id: number
          cc_email: string | null
          created_at: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string
          report_date: string
          sent_at: string | null
          sent_by: string | null
          status: string
        }
        Insert: {
          branch_id: number
          cc_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email: string
          report_date: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Update: {
          branch_id?: number
          cc_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string
          report_date?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_report_emails_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "stock_report_emails_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      storage_cleanup_jobs: {
        Row: {
          attempts: number
          bucket_id: string
          created_at: string
          job_id: number
          last_error: string | null
          reason: string
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          bucket_id: string
          created_at?: string
          job_id?: number
          last_error?: string | null
          reason: string
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          bucket_id?: string
          created_at?: string
          job_id?: number
          last_error?: string | null
          reason?: string
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          branch_id: number
          contact_number: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
        }
        Insert: {
          address?: string | null
          branch_id: number
          contact_number?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          address?: string | null
          branch_id?: number
          contact_number?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      system_features: {
        Row: {
          affected_roles: string[]
          category: string
          dependencies: string[]
          description: string
          id: string
          is_core: boolean
          is_critical: boolean
          maintenance_message: string | null
          name: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          affected_roles?: string[]
          category: string
          dependencies?: string[]
          description: string
          id: string
          is_core?: boolean
          is_critical?: boolean
          maintenance_message?: string | null
          name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          affected_roles?: string[]
          category?: string
          dependencies?: string[]
          description?: string
          id?: string
          is_core?: boolean
          is_critical?: boolean
          maintenance_message?: string | null
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_features_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          bucket_time: string
          created_at: string | null
          metric_id: number
          request_count: number | null
        }
        Insert: {
          bucket_time: string
          created_at?: string | null
          metric_id?: number
          request_count?: number | null
        }
        Update: {
          bucket_time?: string
          created_at?: string | null
          metric_id?: number
          request_count?: number | null
        }
        Relationships: []
      }
      transaction_services: {
        Row: {
          actual_price_at_time: number | null
          service_id: number | null
          transaction_id: number | null
          ts_id: number
        }
        Insert: {
          actual_price_at_time?: number | null
          service_id?: number | null
          transaction_id?: number | null
          ts_id?: number
        }
        Update: {
          actual_price_at_time?: number | null
          service_id?: number | null
          transaction_id?: number | null
          ts_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["service_id"]
          },
          {
            foreignKeyName: "transaction_services_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transactions: {
        Row: {
          barber_id: number | null
          branch_id: number
          cashier_id: string | null
          created_at: string
          customer_id: number | null
          customer_name: string | null
          gcash_ref_no: string | null
          idempotency_key: string | null
          payment_attempt_id: number | null
          payment_method: string
          queue_entry_id: number | null
          total_amount: number
          transaction_id: number
          transaction_type: string
        }
        Insert: {
          barber_id?: number | null
          branch_id: number
          cashier_id?: string | null
          created_at?: string
          customer_id?: number | null
          customer_name?: string | null
          gcash_ref_no?: string | null
          idempotency_key?: string | null
          payment_attempt_id?: number | null
          payment_method: string
          queue_entry_id?: number | null
          total_amount: number
          transaction_id?: number
          transaction_type?: string
        }
        Update: {
          barber_id?: number | null
          branch_id?: number
          cashier_id?: string | null
          created_at?: string
          customer_id?: number | null
          customer_name?: string | null
          gcash_ref_no?: string | null
          idempotency_key?: string | null
          payment_attempt_id?: number | null
          payment_method?: string
          queue_entry_id?: number | null
          total_amount?: number
          transaction_id?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "transactions_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_service_history"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["payment_attempt_id"]
          },
          {
            foreignKeyName: "transactions_queue_entry_id_fkey"
            columns: ["queue_entry_id"]
            isOneToOne: false
            referencedRelation: "queue_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_info: string | null
          expires_at: string
          ip_address: string | null
          is_valid: boolean | null
          last_active: string | null
          remember_me: boolean | null
          session_id: string
          token_hash: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_info?: string | null
          expires_at: string
          ip_address?: string | null
          is_valid?: boolean | null
          last_active?: string | null
          remember_me?: boolean | null
          session_id?: string
          token_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_info?: string | null
          expires_at?: string
          ip_address?: string | null
          is_valid?: boolean | null
          last_active?: string | null
          remember_me?: boolean | null
          session_id?: string
          token_hash?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      users: {
        Row: {
          account_source: string | null
          branch_id: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          email_notifications_enabled: boolean
          google_id: string | null
          is_verified: boolean | null
          password_hash: string | null
          profile_picture: string | null
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
          username: string | null
          verification_code: string | null
          verification_code_expires_at: string | null
        }
        Insert: {
          account_source?: string | null
          branch_id?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_notifications_enabled?: boolean
          google_id?: string | null
          is_verified?: boolean | null
          password_hash?: string | null
          profile_picture?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          user_id?: string
          username?: string | null
          verification_code?: string | null
          verification_code_expires_at?: string | null
        }
        Update: {
          account_source?: string | null
          branch_id?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_notifications_enabled?: boolean
          google_id?: string | null
          is_verified?: boolean | null
          password_hash?: string | null
          profile_picture?: string | null
          role?: Database["public"]["Enums"]["user_role_type"]
          user_id?: string
          username?: string | null
          verification_code?: string | null
          verification_code_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      customer_service_history: {
        Row: {
          branch_name: string | null
          customer_id: number | null
          customer_name: string | null
          payment_method: string | null
          phone_number: string | null
          total_amount: number | null
          visit_date: string | null
        }
        Relationships: []
      }
      daily_barber_commissions: {
        Row: {
          barber_id: number | null
          commission_rate: number | null
          final_commission: number | null
          total_sales: number | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["barber_id"]
          },
        ]
      }
      daily_revenue_summary: {
        Row: {
          branch_id: number | null
          report_date: string | null
          total_daily_revenue: number | null
          transaction_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
        ]
      }
      v_fact_sales_detail: {
        Row: {
          branch_id: number | null
          branch_name: string | null
          date_key: number | null
          day_name: string | null
          fact_id: number | null
          full_date: string | null
          month_name: string | null
          total_customers_served: number | null
          total_discounts_given: number | null
          total_revenue: number | null
          total_transactions: number | null
          weather_condition: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fact_daily_sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "fact_daily_sales_date_key_fkey"
            columns: ["date_key"]
            isOneToOne: false
            referencedRelation: "dim_date"
            referencedColumns: ["date_key"]
          },
        ]
      }
    }
    Functions: {
      cleanup_auth_state: { Args: { batch_size?: number }; Returns: number }
      get_auth_branch_id: { Args: never; Returns: number }
      get_auth_customer_id: { Args: never; Returns: number }
      get_auth_role: { Args: never; Returns: string }
      get_barber_queue: {
        Args: { p_barber_id: number }
        Returns: {
          customer_name: string
          duration_minutes: number
          id: number
          queue_position: number
          service_name: string
          status: Database["public"]["Enums"]["queue_status_type"]
        }[]
      }
      get_customer_booking_stats: {
        Args: { target_customer_id: string }
        Returns: {
          cancellation_rate: number
          cancelled_bookings: number
          completed_bookings: number
          no_show_bookings: number
          total_bookings: number
        }[]
      }
      get_user_by_email: {
        Args: { user_email: string }
        Returns: {
          account_source: string | null
          branch_id: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          email_notifications_enabled: boolean
          google_id: string | null
          is_verified: boolean | null
          password_hash: string | null
          profile_picture: string | null
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
          username: string | null
          verification_code: string | null
          verification_code_expires_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      barber_status_type:
        | "available"
        | "busy"
        | "on_break"
        | "offline"
        | "serving"
      payment_status_type: "unpaid" | "paid"
      queue_status_type:
        | "pending"
        | "accepted"
        | "waiting"
        | "serving"
        | "completed"
        | "cancelled"
        | "no_show"
        | "declined"
        | "late"
        | "expired"
      user_role_type:
        | "System Admin"
        | "Owner"
        | "Cashier"
        | "Barber"
        | "Customer"
        | "Inventory Manager"
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
      barber_status_type: [
        "available",
        "busy",
        "on_break",
        "offline",
        "serving",
      ],
      payment_status_type: ["unpaid", "paid"],
      queue_status_type: [
        "pending",
        "accepted",
        "waiting",
        "serving",
        "completed",
        "cancelled",
        "no_show",
        "declined",
        "late",
        "expired",
      ],
      user_role_type: [
        "System Admin",
        "Owner",
        "Cashier",
        "Barber",
        "Customer",
        "Inventory Manager",
      ],
    },
  },
} as const
