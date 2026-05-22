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
      ad_spend: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          clicks: number
          created_at: string
          date: string
          id: string
          impressions: number
          platform: string
          raw: Json | null
          spend_cents: number
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          platform: string
          raw?: Json | null
          spend_cents?: number
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          platform?: string
          raw?: Json | null
          spend_cents?: number
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after_data: Json | null
          before_data: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          ts: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: number
          ip?: unknown
          ts?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: number
          ip?: unknown
          ts?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          device: string | null
          event_id: string
          id: string
          operator_id: string | null
          raw_payload: Json | null
          result: string
          ticket_id: string
          ts: string
        }
        Insert: {
          device?: string | null
          event_id: string
          id?: string
          operator_id?: string | null
          raw_payload?: Json | null
          result: string
          ticket_id: string
          ts?: string
        }
        Update: {
          device?: string | null
          event_id?: string
          id?: string
          operator_id?: string | null
          raw_payload?: Json | null
          result?: string
          ticket_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          location_address: string | null
          location_name: string | null
          name: string
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location_address?: string | null
          location_name?: string | null
          name: string
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location_address?: string | null
          location_name?: string | null
          name?: string
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          subtotal_cents: number
          ticket_type_id: string
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          subtotal_cents: number
          ticket_type_id: string
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          subtotal_cents?: number
          ticket_type_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_cpf: string
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at: string
          event_id: string
          expires_at: string
          id: string
          ip: unknown
          mp_payment_id: string | null
          mp_preference_id: string | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          buyer_cpf: string
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          ip?: unknown
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          buyer_cpf?: string
          buyer_email?: string
          buyer_name?: string
          buyer_phone?: string
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          ip?: unknown
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          event_id: string
          id: string
          name: string
          position: number
          price_cents: number
          qty_sold: number
          qty_total: number
          sale_ends_at: string | null
          sale_starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          name: string
          position?: number
          price_cents: number
          qty_sold?: number
          qty_total: number
          sale_ends_at?: string | null
          sale_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          position?: number
          price_cents?: number
          qty_sold?: number
          qty_total?: number
          sale_ends_at?: string | null
          sale_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          hash: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id: string
          used_at: string | null
          used_by: string | null
          used_device: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          hash: string
          id?: string
          order_id: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id: string
          used_at?: string | null
          used_by?: string | null
          used_device?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          hash?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type_id?: string
          used_at?: string | null
          used_by?: string | null
          used_device?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          external_id: string
          id: string
          processed: boolean
          processed_at: string | null
          raw_headers: Json | null
          raw_payload: Json | null
          received_at: string
          signature_valid: boolean
          source: string
        }
        Insert: {
          error?: string | null
          external_id: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_headers?: Json | null
          raw_payload?: Json | null
          received_at?: string
          signature_valid: boolean
          source: string
        }
        Update: {
          error?: string | null
          external_id?: string
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_headers?: Json | null
          raw_payload?: Json | null
          received_at?: string
          signature_valid?: boolean
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_operator: { Args: never; Returns: boolean }
      release_expired_orders: { Args: never; Returns: number }
      reserve_tickets: {
        Args: {
          p_buyer_cpf: string
          p_buyer_email: string
          p_buyer_name: string
          p_buyer_phone: string
          p_event_id: string
          p_ip: unknown
          p_items: Json
          p_user_agent: string
          p_utm: Json
        }
        Returns: {
          order_id: string
          total_cents: number
        }[]
      }
    }
    Enums: {
      event_status: "rascunho" | "publicado" | "encerrado" | "cancelado"
      order_status:
        | "pendente"
        | "pago"
        | "falhou"
        | "expirado"
        | "cancelado"
        | "estornado"
      payment_method: "pix" | "credit_card" | "debit_card"
      ticket_status: "valido" | "usado" | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
