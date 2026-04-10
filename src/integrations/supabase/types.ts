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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          active: boolean | null
          allowed_sections: string[] | null
          created_at: string | null
          email: string
          id: string
          name: string
          professional_id: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allowed_sections?: string[] | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          professional_id?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allowed_sections?: string[] | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          professional_id?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string | null
          data: Json | null
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string | null
          data?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          class_id: string | null
          created_at: string | null
          end_at: string
          id: string
          location_id: string
          notes: string | null
          origin: string | null
          payment_method: string | null
          payment_status: string | null
          professional_id: string
          reminder_1h_message_id: string | null
          reminder_1h_sent: boolean | null
          reminder_1h_sent_at: string | null
          service_id: string | null
          session_id: string | null
          start_at: string
          status: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          end_at: string
          id?: string
          location_id: string
          notes?: string | null
          origin?: string | null
          payment_method?: string | null
          payment_status?: string | null
          professional_id: string
          reminder_1h_message_id?: string | null
          reminder_1h_sent?: boolean | null
          reminder_1h_sent_at?: string | null
          service_id?: string | null
          session_id?: string | null
          start_at: string
          status?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          end_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          origin?: string | null
          payment_method?: string | null
          payment_status?: string | null
          professional_id?: string
          reminder_1h_message_id?: string | null
          reminder_1h_sent?: boolean | null
          reminder_1h_sent_at?: string | null
          service_id?: string | null
          session_id?: string | null
          start_at?: string
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_status_vw"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_shadow"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          name: string
          sort_order: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          sort_order?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      class_locations: {
        Row: {
          class_id: string | null
          id: string
          location_id: string | null
        }
        Insert: {
          class_id?: string | null
          id?: string
          location_id?: string | null
        }
        Update: {
          class_id?: string | null
          id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_locations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_professionals: {
        Row: {
          class_id: string | null
          id: string
          professional_id: string | null
        }
        Insert: {
          class_id?: string | null
          id?: string
          professional_id?: string | null
        }
        Update: {
          class_id?: string | null
          id?: string
          professional_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_professionals_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          capacity: number
          class_id: string
          created_at: string | null
          end_at: string
          id: string
          location_id: string
          professional_id: string
          start_at: string
        }
        Insert: {
          capacity: number
          class_id: string
          created_at?: string | null
          end_at: string
          id?: string
          location_id: string
          professional_id: string
          start_at: string
        }
        Update: {
          capacity?: number
          class_id?: string
          created_at?: string | null
          end_at?: string
          id?: string
          location_id?: string
          professional_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          active: boolean | null
          capacity: number
          category_id: string | null
          created_at: string | null
          currency: string | null
          days_of_week: number[] | null
          default_end_time: string | null
          default_start_time: string | null
          description: string | null
          duration_min: number
          id: string
          name: string
          photo_url: string | null
          price: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          capacity: number
          category_id?: string | null
          created_at?: string | null
          currency?: string | null
          days_of_week?: number[] | null
          default_end_time?: string | null
          default_start_time?: string | null
          description?: string | null
          duration_min: number
          id?: string
          name: string
          photo_url?: string | null
          price?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          capacity?: number
          category_id?: string | null
          created_at?: string | null
          currency?: string | null
          days_of_week?: number[] | null
          default_end_time?: string | null
          default_start_time?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          name?: string
          photo_url?: string | null
          price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      location_hours: {
        Row: {
          close_time: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          location_id: string
          open_time: string
          updated_at: string | null
        }
        Insert: {
          close_time: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          location_id: string
          open_time: string
          updated_at?: string | null
        }
        Update: {
          close_time?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          location_id?: string
          open_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_hours_exceptions: {
        Row: {
          close_time: string | null
          created_at: string | null
          date: string
          id: string
          is_closed: boolean | null
          location_id: string
          note: string | null
          open_time: string | null
          updated_at: string | null
        }
        Insert: {
          close_time?: string | null
          created_at?: string | null
          date: string
          id?: string
          is_closed?: boolean | null
          location_id: string
          note?: string | null
          open_time?: string | null
          updated_at?: string | null
        }
        Update: {
          close_time?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_closed?: boolean | null
          location_id?: string
          note?: string | null
          open_time?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_hours_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean | null
          address: string | null
          business_hours: Json | null
          created_at: string | null
          description: string | null
          email: string | null
          gallery: string[] | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          photo_url: string | null
          schedule: Json | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          business_hours?: Json | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          gallery?: string[] | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          photo_url?: string | null
          schedule?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          business_hours?: Json | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          gallery?: string[] | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          photo_url?: string | null
          schedule?: Json | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      outbound_webhooks: {
        Row: {
          created_at: string | null
          event: string
          id: string
          last_error: string | null
          payload: Json
          retries: number | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          event: string
          id?: string
          last_error?: string | null
          payload: Json
          retries?: number | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          event?: string
          id?: string
          last_error?: string | null
          payload?: Json
          retries?: number | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          method: string
          status: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subscription_invoice_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          method: string
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_invoice_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          method?: string
          status?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subscription_invoice_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_subscription_invoice"
            columns: ["subscription_invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vw_bookings_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_hours: {
        Row: {
          close_time: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
          professional_id: string
          updated_at: string | null
        }
        Insert: {
          close_time: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time: string
          professional_id: string
          updated_at?: string | null
        }
        Update: {
          close_time?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
          professional_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_hours_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_hours_exceptions: {
        Row: {
          close_time: string | null
          created_at: string | null
          date: string
          id: string
          is_closed: boolean | null
          note: string | null
          open_time: string | null
          professional_id: string
          updated_at: string | null
        }
        Insert: {
          close_time?: string | null
          created_at?: string | null
          date: string
          id?: string
          is_closed?: boolean | null
          note?: string | null
          open_time?: string | null
          professional_id: string
          updated_at?: string | null
        }
        Update: {
          close_time?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_closed?: boolean | null
          note?: string | null
          open_time?: string | null
          professional_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_hours_exceptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean | null
          bio: string | null
          business_hours: Json | null
          color: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          photo_url: string | null
          specialty: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          bio?: string | null
          business_hours?: Json | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          photo_url?: string | null
          specialty?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          bio?: string | null
          business_hours?: Json | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          photo_url?: string | null
          specialty?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quipu_invoices: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string | null
          created_by_admin_email: string | null
          error_message: string | null
          id: string
          invoice_type: string
          is_automatic: boolean | null
          payment_id: string | null
          pdf_url: string | null
          pdf_url_auth: string | null
          quipu_contact_id: string | null
          quipu_invoice_id: string
          quipu_invoice_number: string | null
          status: string
          updated_at: string | null
          vat_percent: number
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string | null
          created_by_admin_email?: string | null
          error_message?: string | null
          id?: string
          invoice_type?: string
          is_automatic?: boolean | null
          payment_id?: string | null
          pdf_url?: string | null
          pdf_url_auth?: string | null
          quipu_contact_id?: string | null
          quipu_invoice_id: string
          quipu_invoice_number?: string | null
          status?: string
          updated_at?: string | null
          vat_percent: number
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          created_by_admin_email?: string | null
          error_message?: string | null
          id?: string
          invoice_type?: string
          is_automatic?: boolean | null
          payment_id?: string | null
          pdf_url?: string | null
          pdf_url_auth?: string | null
          quipu_contact_id?: string | null
          quipu_invoice_id?: string
          quipu_invoice_number?: string | null
          status?: string
          updated_at?: string | null
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "quipu_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quipu_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vw_bookings_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quipu_invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          payment_id: string
          reason: string | null
          status: string | null
          stripe_refund_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          payment_id: string
          reason?: string | null
          status?: string | null
          stripe_refund_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          payment_id?: string
          reason?: string | null
          status?: string | null
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_templates: {
        Row: {
          active: boolean | null
          allowed_sections: string[]
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allowed_sections: string[]
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allowed_sections?: string[]
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      service_locations: {
        Row: {
          id: string
          location_id: string | null
          service_id: string | null
        }
        Insert: {
          id?: string
          location_id?: string | null
          service_id?: string | null
        }
        Update: {
          id?: string
          location_id?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_locations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_professionals: {
        Row: {
          id: string
          professional_id: string | null
          service_id: string | null
        }
        Insert: {
          id?: string
          professional_id?: string | null
          service_id?: string | null
        }
        Update: {
          id?: string
          professional_id?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_service_professionals_professional_id"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_service_professionals_service_id"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_professionals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean | null
          buffer_min: number | null
          category_id: string | null
          created_at: string | null
          credit_cost: number | null
          currency: string | null
          description: string | null
          duration_min: number
          id: string
          name: string
          photo_url: string | null
          price: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          buffer_min?: number | null
          category_id?: string | null
          created_at?: string | null
          credit_cost?: number | null
          currency?: string | null
          description?: string | null
          duration_min: number
          id?: string
          name: string
          photo_url?: string | null
          price: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          buffer_min?: number | null
          category_id?: string | null
          created_at?: string | null
          credit_cost?: number | null
          currency?: string | null
          description?: string | null
          duration_min?: number
          id?: string
          name?: string
          photo_url?: string | null
          price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      subscription_invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          cycle_end: string
          cycle_start: string
          id: string
          paid_at: string | null
          status: string | null
          stripe_invoice_id: string | null
          subscription_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          cycle_end: string
          cycle_start: string
          id?: string
          paid_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          cycle_end?: string
          cycle_start?: string
          id?: string
          paid_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan_categories: {
        Row: {
          category_id: string | null
          id: string
          plan_id: string | null
        }
        Insert: {
          category_id?: string | null
          id?: string
          plan_id?: string | null
        }
        Update: {
          category_id?: string | null
          id?: string
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_categories_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan_classes: {
        Row: {
          class_id: string | null
          id: string
          plan_id: string | null
        }
        Insert: {
          class_id?: string | null
          id?: string
          plan_id?: string | null
        }
        Update: {
          class_id?: string | null
          id?: string
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_classes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean | null
          cap_per_cycle: number | null
          capacity_per_session: number | null
          created_at: string | null
          currency: string | null
          cycle: string
          description: string | null
          id: string
          name: string
          pack_type: string | null
          parent_plan_id: string | null
          photo_url: string | null
          price: number
          sessions_count: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          cap_per_cycle?: number | null
          capacity_per_session?: number | null
          created_at?: string | null
          currency?: string | null
          cycle: string
          description?: string | null
          id?: string
          name: string
          pack_type?: string | null
          parent_plan_id?: string | null
          photo_url?: string | null
          price: number
          sessions_count?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          cap_per_cycle?: number | null
          capacity_per_session?: number | null
          created_at?: string | null
          currency?: string | null
          cycle?: string
          description?: string | null
          id?: string
          name?: string
          pack_type?: string | null
          parent_plan_id?: string | null
          photo_url?: string | null
          price?: number
          sessions_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_parent_plan_id_fkey"
            columns: ["parent_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          cap_remaining_in_cycle: number | null
          created_at: string | null
          id: string
          next_billing_date: string
          plan_id: string
          start_date: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          cap_remaining_in_cycle?: number | null
          created_at?: string | null
          id?: string
          next_billing_date: string
          plan_id: string
          start_date?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          cap_remaining_in_cycle?: number | null
          created_at?: string | null
          id?: string
          next_billing_date?: string
          plan_id?: string
          start_date?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_status_vw"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_shadow"
            referencedColumns: ["id"]
          },
        ]
      }
      users_shadow: {
        Row: {
          app_user_id: string
          created_at: string | null
          document_type: string | null
          email: string
          fiscal_address: string | null
          fiscal_city: string | null
          fiscal_name: string | null
          fiscal_zip: string | null
          id: string
          name: string
          nif: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          app_user_id: string
          created_at?: string | null
          document_type?: string | null
          email: string
          fiscal_address?: string | null
          fiscal_city?: string | null
          fiscal_name?: string | null
          fiscal_zip?: string | null
          id?: string
          name: string
          nif?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          app_user_id?: string
          created_at?: string | null
          document_type?: string | null
          email?: string
          fiscal_address?: string | null
          fiscal_city?: string | null
          fiscal_name?: string | null
          fiscal_zip?: string | null
          id?: string
          name?: string
          nif?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          booking_id: string
          created_at: string | null
          credits_used: number | null
          id: string
          status: string | null
          voucher_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          credits_used?: number | null
          id?: string
          status?: string | null
          voucher_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          credits_used?: number | null
          id?: string
          status?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vw_bookings_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_type_categories: {
        Row: {
          category_id: string | null
          id: string
          voucher_type_id: string | null
        }
        Insert: {
          category_id?: string | null
          id?: string
          voucher_type_id?: string | null
        }
        Update: {
          category_id?: string | null
          id?: string
          voucher_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_type_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_type_categories_voucher_type_id_fkey"
            columns: ["voucher_type_id"]
            isOneToOne: false
            referencedRelation: "voucher_types"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_type_services: {
        Row: {
          id: string
          service_id: string | null
          voucher_type_id: string | null
        }
        Insert: {
          id?: string
          service_id?: string | null
          voucher_type_id?: string | null
        }
        Update: {
          id?: string
          service_id?: string | null
          voucher_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_type_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_type_services_voucher_type_id_fkey"
            columns: ["voucher_type_id"]
            isOneToOne: false
            referencedRelation: "voucher_types"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_types: {
        Row: {
          active: boolean | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          name: string
          photo_url: string | null
          price: number
          professional_id: string | null
          session_duration_min: number | null
          sessions_count: number
          updated_at: string | null
          validity_days: number | null
          validity_end_date: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          name: string
          photo_url?: string | null
          price: number
          professional_id?: string | null
          session_duration_min?: number | null
          sessions_count: number
          updated_at?: string | null
          validity_days?: number | null
          validity_end_date?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          price?: number
          professional_id?: string | null
          session_duration_min?: number | null
          sessions_count?: number
          updated_at?: string | null
          validity_days?: number | null
          validity_end_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_types_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          code: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          purchase_date: string | null
          sessions_remaining: number
          status: string | null
          updated_at: string | null
          user_id: string
          voucher_type_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          purchase_date?: string | null
          sessions_remaining: number
          status?: string | null
          updated_at?: string | null
          user_id: string
          voucher_type_id: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          purchase_date?: string | null
          sessions_remaining?: number
          status?: string | null
          updated_at?: string | null
          user_id?: string
          voucher_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_status_vw"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vouchers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_shadow"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_voucher_type_id_fkey"
            columns: ["voucher_type_id"]
            isOneToOne: false
            referencedRelation: "voucher_types"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          class_id: string | null
          created_at: string | null
          id: string
          session_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          id?: string
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          id?: string
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_status_vw"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "waitlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_shadow"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_status_vw: {
        Row: {
          app_user_id: string | null
          created_at: string | null
          days_since_last_booking: number | null
          email: string | null
          has_active_subscription: boolean | null
          has_active_voucher: boolean | null
          last_booking_at: string | null
          name: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          app_user_id?: string | null
          created_at?: string | null
          days_since_last_booking?: never
          email?: string | null
          has_active_subscription?: never
          has_active_voucher?: never
          last_booking_at?: never
          name?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          app_user_id?: string | null
          created_at?: string | null
          days_since_last_booking?: never
          email?: string | null
          has_active_subscription?: never
          has_active_voucher?: never
          last_booking_at?: never
          name?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      vw_bookings_complete: {
        Row: {
          class_id: string | null
          class_name: string | null
          created_at: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          end_at: string | null
          id: string | null
          location_id: string | null
          location_name: string | null
          notes: string | null
          origin: string | null
          payment_method: string | null
          payment_status: string | null
          professional_id: string | null
          professional_name: string | null
          reminder_1h_message_id: string | null
          reminder_1h_sent: boolean | null
          reminder_1h_sent_at: string | null
          service_id: string | null
          service_name: string | null
          start_at: string | null
          status: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_status_vw"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users_shadow"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_bookings_daily: {
        Row: {
          bookings_cancelled: number | null
          bookings_confirmed: number | null
          bookings_created: number | null
          day_local: string | null
          location_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_bookings_monthly: {
        Row: {
          bookings_confirmed: number | null
          bookings_created: number | null
          location_id: string | null
          month_local: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_revenue_confirmed: {
        Row: {
          day_local: string | null
          location_id: string | null
          revenue_confirmed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_revenue_projected: {
        Row: {
          day_local: string | null
          location_id: string | null
          revenue_projected: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_subscriptions_monthly: {
        Row: {
          location_id: string | null
          month_local: string | null
          subs_cancelled: number | null
          subs_new: number | null
        }
        Relationships: []
      }
      vw_subscriptions_mrr: {
        Row: {
          location_id: string | null
          mrr: number | null
        }
        Relationships: []
      }
      vw_voucher_redemptions_daily: {
        Row: {
          credits_used: number | null
          day_local: string | null
          location_id: string | null
          vouchers_redeemed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vouchers_daily: {
        Row: {
          day_local: string | null
          location_id: string | null
          vouchers_sold: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_professional_id: { Args: never; Returns: string }
      is_panel_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
