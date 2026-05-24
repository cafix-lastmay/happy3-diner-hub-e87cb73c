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
      app_settings: {
        Row: {
          default_trial_days: number
          footer_banner_cta_text: string | null
          footer_banner_enabled: boolean
          footer_banner_text: string | null
          footer_banner_url: string | null
          id: boolean
          max_driver_radius_km: number
          points_per_usd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_trial_days?: number
          footer_banner_cta_text?: string | null
          footer_banner_enabled?: boolean
          footer_banner_text?: string | null
          footer_banner_url?: string | null
          id?: boolean
          max_driver_radius_km?: number
          points_per_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_trial_days?: number
          footer_banner_cta_text?: string | null
          footer_banner_enabled?: boolean
          footer_banner_text?: string | null
          footer_banner_url?: string | null
          id?: boolean
          max_driver_radius_km?: number
          points_per_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cafeteria_payment_info: {
        Row: {
          bank_details: string | null
          cafeteria_ref_code: string
          created_at: string
          payment_instructions: string | null
          updated_at: string
        }
        Insert: {
          bank_details?: string | null
          cafeteria_ref_code: string
          created_at?: string
          payment_instructions?: string | null
          updated_at?: string
        }
        Update: {
          bank_details?: string | null
          cafeteria_ref_code?: string
          created_at?: string
          payment_instructions?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cafeterias: {
        Row: {
          address: string | null
          auto_approve_shifts: boolean
          banner_url: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          delivery_fee_a_amount: number
          delivery_fee_a_name: string | null
          delivery_fee_b_amount: number
          delivery_fee_b_name: string | null
          delivery_fee_c_amount: number
          delivery_fee_c_name: string | null
          delivery_qr_token: string | null
          email: string | null
          estimated_delivery_minutes: number
          free_trial_until: string | null
          google_maps_url: string | null
          grace_period_active: boolean
          grace_period_started_at: string | null
          id: string
          is_active: boolean
          language: string
          lat: number | null
          lng: number | null
          logo_url: string | null
          menu_footer_url: string | null
          menu_header_url: string | null
          mode_delivery: boolean
          mode_dine_in: boolean
          mode_takeaway: boolean
          name: string
          opening_hours: Json
          parent_ref_code: string
          phone: string | null
          points_balance: number
          ref_code: string
          service_percent: number
          signup_type: Database["public"]["Enums"]["signup_type"]
          takeaway_qr_token: string | null
          tax_apply_delivery: boolean
          tax_apply_dine_in: boolean
          tax_apply_takeaway: boolean
          tax_percent: number
          trial_consumed: boolean
          trial_start: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          auto_approve_shifts?: boolean
          banner_url?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          delivery_fee_a_amount?: number
          delivery_fee_a_name?: string | null
          delivery_fee_b_amount?: number
          delivery_fee_b_name?: string | null
          delivery_fee_c_amount?: number
          delivery_fee_c_name?: string | null
          delivery_qr_token?: string | null
          email?: string | null
          estimated_delivery_minutes?: number
          free_trial_until?: string | null
          google_maps_url?: string | null
          grace_period_active?: boolean
          grace_period_started_at?: string | null
          id?: string
          is_active?: boolean
          language?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          menu_footer_url?: string | null
          menu_header_url?: string | null
          mode_delivery?: boolean
          mode_dine_in?: boolean
          mode_takeaway?: boolean
          name: string
          opening_hours?: Json
          parent_ref_code: string
          phone?: string | null
          points_balance?: number
          ref_code: string
          service_percent?: number
          signup_type: Database["public"]["Enums"]["signup_type"]
          takeaway_qr_token?: string | null
          tax_apply_delivery?: boolean
          tax_apply_dine_in?: boolean
          tax_apply_takeaway?: boolean
          tax_percent?: number
          trial_consumed?: boolean
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          auto_approve_shifts?: boolean
          banner_url?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          delivery_fee_a_amount?: number
          delivery_fee_a_name?: string | null
          delivery_fee_b_amount?: number
          delivery_fee_b_name?: string | null
          delivery_fee_c_amount?: number
          delivery_fee_c_name?: string | null
          delivery_qr_token?: string | null
          email?: string | null
          estimated_delivery_minutes?: number
          free_trial_until?: string | null
          google_maps_url?: string | null
          grace_period_active?: boolean
          grace_period_started_at?: string | null
          id?: string
          is_active?: boolean
          language?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          menu_footer_url?: string | null
          menu_header_url?: string | null
          mode_delivery?: boolean
          mode_dine_in?: boolean
          mode_takeaway?: boolean
          name?: string
          opening_hours?: Json
          parent_ref_code?: string
          phone?: string | null
          points_balance?: number
          ref_code?: string
          service_percent?: number
          signup_type?: Database["public"]["Enums"]["signup_type"]
          takeaway_qr_token?: string | null
          tax_apply_delivery?: boolean
          tax_apply_dine_in?: boolean
          tax_apply_takeaway?: boolean
          tax_percent?: number
          trial_consumed?: boolean
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cafeterias_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cafeterias_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      category_mode_visibility: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_visible: boolean
          mode: Database["public"]["Enums"]["order_mode"]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          mode: Database["public"]["Enums"]["order_mode"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          mode?: Database["public"]["Enums"]["order_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_mode_visibility_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rates: {
        Row: {
          level_distance: number
          percentage: number
          updated_at: string
        }
        Insert: {
          level_distance: number
          percentage: number
          updated_at?: string
        }
        Update: {
          level_distance?: number
          percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      commission_transactions: {
        Row: {
          amount_usd: number
          created_at: string
          id: string
          level_distance: number
          marketer_ref_code: string
          percentage: number
          recharge_id: string
          released_at: string | null
          source_cafeteria_ref_code: string
          status: Database["public"]["Enums"]["commission_status"]
        }
        Insert: {
          amount_usd: number
          created_at?: string
          id?: string
          level_distance: number
          marketer_ref_code: string
          percentage: number
          recharge_id: string
          released_at?: string | null
          source_cafeteria_ref_code: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Update: {
          amount_usd?: number
          created_at?: string
          id?: string
          level_distance?: number
          marketer_ref_code?: string
          percentage?: number
          recharge_id?: string
          released_at?: string | null
          source_cafeteria_ref_code?: string
          status?: Database["public"]["Enums"]["commission_status"]
        }
        Relationships: [
          {
            foreignKeyName: "commission_transactions_marketer_ref_code_fkey"
            columns: ["marketer_ref_code"]
            isOneToOne: false
            referencedRelation: "marketers"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "commission_transactions_recharge_id_fkey"
            columns: ["recharge_id"]
            isOneToOne: false
            referencedRelation: "recharge_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          default_currency: string | null
          default_language: string
          name_ar: string
          name_en: string
        }
        Insert: {
          code: string
          default_currency?: string | null
          default_language?: string
          name_ar: string
          name_en: string
        }
        Update: {
          code?: string
          default_currency?: string | null
          default_language?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_default_currency_fkey"
            columns: ["default_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          name_ar: string
          name_en: string
          symbol: string
        }
        Insert: {
          code: string
          name_ar: string
          name_en: string
          symbol: string
        }
        Update: {
          code?: string
          name_ar?: string
          name_en?: string
          symbol?: string
        }
        Relationships: []
      }
      custom_grace_periods: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          created_by: string | null
          days: number
          id: string
          note: string | null
          start_date: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          created_by?: string | null
          days: number
          id?: string
          note?: string | null
          start_date: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          created_by?: string | null
          days?: number
          id?: string
          note?: string | null
          start_date?: string
        }
        Relationships: []
      }
      delivery_details: {
        Row: {
          assigned_by: string | null
          cafeteria_ref_code: string
          cancelled_at: string | null
          created_at: string
          customer_address: string
          customer_lat: number | null
          customer_lng: number | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          driver_id: string | null
          fee_amount: number
          fee_tier: Database["public"]["Enums"]["delivery_fee_tier"] | null
          on_the_way_at: string | null
          order_id: string
          picked_up_at: string | null
          reject_reason: string | null
          requested_at: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          cafeteria_ref_code: string
          cancelled_at?: string | null
          created_at?: string
          customer_address: string
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          driver_id?: string | null
          fee_amount?: number
          fee_tier?: Database["public"]["Enums"]["delivery_fee_tier"] | null
          on_the_way_at?: string | null
          order_id: string
          picked_up_at?: string | null
          reject_reason?: string | null
          requested_at?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          cafeteria_ref_code?: string
          cancelled_at?: string | null
          created_at?: string
          customer_address?: string
          customer_lat?: number | null
          customer_lng?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_at?: string | null
          driver_id?: string | null
          fee_amount?: number
          fee_tier?: Database["public"]["Enums"]["delivery_fee_tier"] | null
          on_the_way_at?: string | null
          order_id?: string
          picked_up_at?: string | null
          reject_reason?: string | null
          requested_at?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_details_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_cafeteria_links: {
        Row: {
          cafeteria_ref_code: string
          decided_at: string | null
          decided_by: string | null
          driver_id: string
          id: string
          requested_at: string
          status: string
        }
        Insert: {
          cafeteria_ref_code: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id: string
          id?: string
          requested_at?: string
          status?: string
        }
        Update: {
          cafeteria_ref_code?: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id?: string
          id?: string
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_cafeteria_links_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "driver_cafeteria_links_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_wallet_entries: {
        Row: {
          cafeteria_ref_code: string
          collected_from_customer: number
          created_at: string
          delivery_fee_earned: number
          driver_id: string
          id: string
          order_id: string
          owed_to_cafeteria: number
          owed_to_driver: number
          settled_at: string | null
          settled_by: string | null
          settlement_status: Database["public"]["Enums"]["wallet_settlement_status"]
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          collected_from_customer?: number
          created_at?: string
          delivery_fee_earned?: number
          driver_id: string
          id?: string
          order_id: string
          owed_to_cafeteria?: number
          owed_to_driver?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_status?: Database["public"]["Enums"]["wallet_settlement_status"]
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          collected_from_customer?: number
          created_at?: string
          delivery_fee_earned?: number
          driver_id?: string
          id?: string
          order_id?: string
          owed_to_cafeteria?: number
          owed_to_driver?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_status?: Database["public"]["Enums"]["wallet_settlement_status"]
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          cafeteria_ref_code: string | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          full_name: string
          home_lat: number | null
          home_lng: number | null
          id: string
          is_active: boolean
          kind: string
          last_location_at: string | null
          phone: string | null
          photo_url: string | null
          rating_avg: number
          rating_count: number
          service_radius_km: number
          status: string
          updated_at: string
          user_id: string
          vehicle_type: string | null
        }
        Insert: {
          cafeteria_ref_code?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_active?: boolean
          kind: string
          last_location_at?: string | null
          phone?: string | null
          photo_url?: string | null
          rating_avg?: number
          rating_count?: number
          service_radius_km?: number
          status?: string
          updated_at?: string
          user_id: string
          vehicle_type?: string | null
        }
        Update: {
          cafeteria_ref_code?: string | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          full_name?: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          last_location_at?: string | null
          phone?: string | null
          photo_url?: string | null
          rating_avg?: number
          rating_count?: number
          service_radius_km?: number
          status?: string
          updated_at?: string
          user_id?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          currency_code: string
          rate_to_usd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency_code: string
          rate_to_usd: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency_code?: string
          rate_to_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: true
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      favorite_drivers: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          owner_kind: string
          owner_ref: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          owner_kind: string
          owner_ref: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          owner_kind?: string
          owner_ref?: string
        }
        Relationships: []
      }
      marketers: {
        Row: {
          address: string | null
          commission_balance_available: number
          commission_balance_frozen: number
          country_code: string | null
          created_at: string
          currency_code: string | null
          email: string | null
          id: string
          is_active: boolean
          language: string
          level: number
          name: string
          parent_ref_code: string | null
          phone: string | null
          ref_code: string
          signup_type: Database["public"]["Enums"]["signup_type"]
          updated_at: string
          user_id: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          commission_balance_available?: number
          commission_balance_frozen?: number
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          language?: string
          level: number
          name: string
          parent_ref_code?: string | null
          phone?: string | null
          ref_code: string
          signup_type: Database["public"]["Enums"]["signup_type"]
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          commission_balance_available?: number
          commission_balance_frozen?: number
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          language?: string
          level?: number
          name?: string
          parent_ref_code?: string | null
          phone?: string | null
          ref_code?: string
          signup_type?: Database["public"]["Enums"]["signup_type"]
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketers_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "marketers_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      menu_categories: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
        ]
      }
      menu_item_prices: {
        Row: {
          created_at: string
          id: string
          item_id: string
          price: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          price: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          price?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_prices_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          cafeteria_ref_code: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_most_popular: boolean
          name: string
          price: number
          rating_avg: number
          rating_count: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_most_popular?: boolean
          name: string
          price?: number
          rating_avg?: number
          rating_count?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_most_popular?: boolean
          name?: string
          price?: number
          rating_avg?: number
          rating_count?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_mode_overrides: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          item_id: string
          mode: Database["public"]["Enums"]["order_mode"]
          name: string | null
          price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          item_id: string
          mode: Database["public"]["Enums"]["order_mode"]
          name?: string | null
          price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          item_id?: string
          mode?: Database["public"]["Enums"]["order_mode"]
          name?: string | null
          price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_mode_overrides_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          new_orders: boolean
          recharge_withdrawal: boolean
          service_calls: boolean
          shifts: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          new_orders?: boolean
          recharge_withdrawal?: boolean
          service_calls?: boolean
          shifts?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          new_orders?: boolean
          recharge_withdrawal?: boolean
          service_calls?: boolean
          shifts?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          name_snapshot: string
          notes: string | null
          order_id: string
          price_snapshot: number
          qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          name_snapshot: string
          notes?: string | null
          order_id: string
          price_snapshot: number
          qty: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          name_snapshot?: string
          notes?: string | null
          order_id?: string
          price_snapshot?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          mode: Database["public"]["Enums"]["order_mode"]
          notes: string | null
          price_tier_id: string | null
          price_tier_name: string | null
          served_by: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          table_label: string
          tip_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["order_mode"]
          notes?: string | null
          price_tier_id?: string | null
          price_tier_name?: string | null
          served_by?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_label: string
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["order_mode"]
          notes?: string | null
          price_tier_id?: string | null
          price_tier_name?: string | null
          served_by?: string | null
          shift_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_label?: string
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_adjustments: {
        Row: {
          created_at: string
          delta: number
          id: string
          owner_user_id: string
          reason: string | null
          target_kind: string
          target_ref_code: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          owner_user_id: string
          reason?: string | null
          target_kind: string
          target_ref_code: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          owner_user_id?: string
          reason?: string | null
          target_kind?: string
          target_ref_code?: string
        }
        Relationships: []
      }
      price_tiers: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          language?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          customer_phone: string
          id: string
          order_id: string
          stars: number
          target_kind: Database["public"]["Enums"]["rating_target_kind"]
          target_ref: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_phone: string
          id?: string
          order_id: string
          stars: number
          target_kind: Database["public"]["Enums"]["rating_target_kind"]
          target_ref: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_phone?: string
          id?: string
          order_id?: string
          stars?: number
          target_kind?: Database["public"]["Enums"]["rating_target_kind"]
          target_ref?: string
        }
        Relationships: []
      }
      recharge_instructions: {
        Row: {
          body: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      recharge_requests: {
        Row: {
          amount_usd: number
          approved_at: string | null
          approved_by: string | null
          cafeteria_ref_code: string
          created_at: string
          exchange_rate_to_usd: number
          id: string
          local_currency: string
          notes: string | null
          points_to_credit: number
          receipt_url: string
          status: Database["public"]["Enums"]["recharge_status"]
        }
        Insert: {
          amount_usd: number
          approved_at?: string | null
          approved_by?: string | null
          cafeteria_ref_code: string
          created_at?: string
          exchange_rate_to_usd?: number
          id?: string
          local_currency: string
          notes?: string | null
          points_to_credit: number
          receipt_url: string
          status?: Database["public"]["Enums"]["recharge_status"]
        }
        Update: {
          amount_usd?: number
          approved_at?: string | null
          approved_by?: string | null
          cafeteria_ref_code?: string
          created_at?: string
          exchange_rate_to_usd?: number
          id?: string
          local_currency?: string
          notes?: string | null
          points_to_credit?: number
          receipt_url?: string
          status?: Database["public"]["Enums"]["recharge_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recharge_requests_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
        ]
      }
      ref_code_counters: {
        Row: {
          entity_type: string
          last_number: number
          parent_ref_code: string
        }
        Insert: {
          entity_type: string
          last_number?: number
          parent_ref_code: string
        }
        Update: {
          entity_type?: string
          last_number?: number
          parent_ref_code?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          qr_bottom_text: string | null
          qr_font_size: number
          qr_text_language: string
          qr_token: string
          qr_top_text: string | null
          section_id: string | null
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          qr_bottom_text?: string | null
          qr_font_size?: number
          qr_text_language?: string
          qr_token?: string
          qr_top_text?: string | null
          section_id?: string | null
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          qr_bottom_text?: string | null
          qr_font_size?: number
          qr_text_language?: string
          qr_token?: string
          qr_top_text?: string | null
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "restaurant_tables_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "table_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cafeteria_ref_code: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          notes: string | null
          orders_count: number
          requested_at: string
          staff_role: Database["public"]["Enums"]["app_role"]
          staff_user_id: string
          status: Database["public"]["Enums"]["shift_status"]
          tips_total: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cafeteria_ref_code: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          orders_count?: number
          requested_at?: string
          staff_role: Database["public"]["Enums"]["app_role"]
          staff_user_id: string
          status?: Database["public"]["Enums"]["shift_status"]
          tips_total?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cafeteria_ref_code?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          orders_count?: number
          requested_at?: string
          staff_role?: Database["public"]["Enums"]["app_role"]
          staff_user_id?: string
          status?: Database["public"]["Enums"]["shift_status"]
          tips_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "shifts_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
        ]
      }
      signup_attempts: {
        Row: {
          created_at: string
          id: string
          ip: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          kind?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          shift_enabled: boolean
          user_id: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          shift_enabled?: boolean
          user_id: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          shift_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
        ]
      }
      staff_scopes: {
        Row: {
          created_at: string
          id: string
          kind: string
          ref_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          ref_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          ref_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_scopes_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sections: {
        Row: {
          cafeteria_ref_code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_tier_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          cafeteria_ref_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_tier_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cafeteria_ref_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_tier_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sections_cafeteria_ref_code_fkey"
            columns: ["cafeteria_ref_code"]
            isOneToOne: false
            referencedRelation: "cafeterias"
            referencedColumns: ["ref_code"]
          },
          {
            foreignKeyName: "table_sections_price_tier_id_fkey"
            columns: ["price_tier_id"]
            isOneToOne: false
            referencedRelation: "price_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      unauthorized_access_log: {
        Row: {
          attempted_roles: string[]
          created_at: string
          id: string
          path: string
          user_id: string
          user_roles: string[]
        }
        Insert: {
          attempted_roles?: string[]
          created_at?: string
          id?: string
          path: string
          user_id: string
          user_roles?: string[]
        }
        Update: {
          attempted_roles?: string[]
          created_at?: string
          id?: string
          path?: string
          user_id?: string
          user_roles?: string[]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          entity_ref_code: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_ref_code?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          entity_ref_code?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount_usd: number
          created_at: string
          id: string
          marketer_ref_code: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
        }
        Insert: {
          amount_usd: number
          created_at?: string
          id?: string
          marketer_ref_code: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Update: {
          amount_usd?: number
          created_at?: string
          id?: string
          marketer_ref_code?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_marketer_ref_code_fkey"
            columns: ["marketer_ref_code"]
            isOneToOne: false
            referencedRelation: "marketers"
            referencedColumns: ["ref_code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      approve_recharge: { Args: { _recharge_id: string }; Returns: undefined }
      approve_recharge_with_points: {
        Args: { _points: number; _recharge_id: string }
        Returns: undefined
      }
      approve_shift: { Args: { _shift_id: string }; Returns: undefined }
      assign_delivery_driver: {
        Args: { _driver_id: string; _fee_tier: string; _order_id: string }
        Returns: undefined
      }
      cafe_invite_driver: { Args: { _query: string }; Returns: string }
      cafe_sales_by_tier_daily: {
        Args: { _days?: number }
        Returns: {
          day: string
          orders_count: number
          tier_id: string
          tier_name: string
          total: number
        }[]
      }
      cafeteria_is_blocked: { Args: { _ref: string }; Returns: boolean }
      cafeteria_trial_active: { Args: { _ref_code: string }; Returns: boolean }
      cancel_delivery: {
        Args: { _order_id: string; _reason?: string }
        Returns: undefined
      }
      check_and_record_signup_attempt: {
        Args: { _ip: string; _kind: string }
        Returns: undefined
      }
      close_shift: {
        Args: { _shift_id: string; _tips?: number }
        Returns: undefined
      }
      copy_menu_to_mode: {
        Args: { _mode: Database["public"]["Enums"]["order_mode"] }
        Returns: number
      }
      create_notification: {
        Args: {
          _body: string
          _data?: Json
          _kind: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      decide_driver_join_request: {
        Args: { _approve: boolean; _link_id: string }
        Returns: undefined
      }
      driver_cancel_join_request: {
        Args: { _link_id: string }
        Returns: undefined
      }
      driver_request_join: {
        Args: { _cafeteria_ref_code: string }
        Returns: string
      }
      generate_ref_code: {
        Args: { _entity_type: string; _parent_ref_code: string }
        Returns: string
      }
      get_cafe_driver_settlements: {
        Args: never
        Returns: {
          driver_id: string
          driver_name: string
          driver_phone: string
          driver_photo: string
          last_settled_at: string
          paid_count: number
          pending_count: number
          pending_owed_to_cafe: number
          pending_owed_to_driver: number
        }[]
      }
      get_cafe_drivers_panel: {
        Args: never
        Returns: {
          driver_id: string
          full_name: string
          kind: string
          link_id: string
          link_status: string
          phone: string
          photo_url: string
          rating_avg: number
          requested_at: string
          scope: string
          status: string
          vehicle_type: string
        }[]
      }
      get_cafe_orders_by_mode: {
        Args: { _days?: number }
        Returns: {
          mode: string
          orders_count: number
          revenue: number
        }[]
      }
      get_cafe_peak_hours: {
        Args: { _days?: number }
        Returns: {
          hour: number
          orders_count: number
          revenue: number
        }[]
      }
      get_cafe_sales_timeseries: {
        Args: { _days?: number }
        Returns: {
          day: string
          orders_count: number
          revenue: number
        }[]
      }
      get_cafe_top_items: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          item_name: string
          qty: number
          revenue: number
        }[]
      }
      get_delivery_order_items: {
        Args: { _customer_phone: string; _order_id: string }
        Returns: {
          item_id: string
          name: string
          qty: number
        }[]
      }
      get_delivery_order_status:
        | { Args: { _order_id: string }; Returns: Json }
        | {
            Args: { _customer_phone?: string; _order_id: string }
            Returns: Json
          }
      get_delivery_rating_status: {
        Args: { _order_id: string }
        Returns: {
          cafe_rated: boolean
          driver_rated: boolean
        }[]
      }
      get_menu_for_delivery: { Args: { _token: string }; Returns: Json }
      get_menu_for_qr: {
        Args: {
          _mode?: Database["public"]["Enums"]["order_mode"]
          _qr_token: string
        }
        Returns: Json
      }
      get_menu_for_takeaway: { Args: { _token: string }; Returns: Json }
      get_my_active_deliveries: {
        Args: never
        Returns: {
          cafeteria_address: string
          cafeteria_lat: number
          cafeteria_lng: number
          cafeteria_name: string
          cafeteria_ref_code: string
          customer_address: string
          customer_lat: number
          customer_lng: number
          customer_name: string
          customer_phone: string
          fee_amount: number
          fee_tier: string
          on_the_way_at: string
          order_id: string
          order_total: number
          picked_up_at: string
          requested_at: string
          responded_at: string
          short_code: string
          status: string
        }[]
      }
      get_my_active_shift: {
        Args: never
        Returns: {
          approved_at: string
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["shift_status"]
        }[]
      }
      get_my_cafeteria_ref_code: { Args: never; Returns: string }
      get_my_driver_id: { Args: never; Returns: string }
      get_my_driver_wallet: {
        Args: never
        Returns: {
          cafeteria_name: string
          cafeteria_ref_code: string
          collected_from_customer: number
          created_at: string
          delivery_fee_earned: number
          id: string
          order_id: string
          owed_to_cafeteria: number
          owed_to_driver: number
          settled_at: string
          settlement_status: string
          short_code: string
        }[]
      }
      get_my_manager_cafeteria_ref: { Args: never; Returns: string }
      get_my_marketer_cafeterias: {
        Args: never
        Returns: {
          country_code: string
          created_at: string
          is_active: boolean
          name: string
          parent_ref_code: string
          ref_code: string
        }[]
      }
      get_my_marketer_descendants: {
        Args: never
        Returns: {
          country_code: string
          created_at: string
          is_active: boolean
          level: number
          name: string
          parent_ref_code: string
          ref_code: string
        }[]
      }
      get_my_marketer_ref_code: { Args: never; Returns: string }
      get_my_staff_cafeteria_ref: { Args: never; Returns: string }
      get_my_staff_scopes: {
        Args: never
        Returns: {
          kind: string
          ref_id: string
        }[]
      }
      get_my_staff_with_profiles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          shift_enabled: boolean
          staff_id: string
          user_id: string
        }[]
      }
      get_my_waiter_tables: {
        Args: never
        Returns: {
          id: string
          is_occupied: boolean
          label: string
          qr_token: string
          section_id: string
        }[]
      }
      get_nearby_cafeterias_for_driver: {
        Args: never
        Returns: {
          address: string
          cafeteria_id: string
          distance_km: number
          lat: number
          link_id: string
          link_status: string
          lng: number
          name: string
          ref_code: string
        }[]
      }
      get_order_status: {
        Args: { _order_id: string; _qr_token: string }
        Returns: {
          created_at: string
          id: string
          status: Database["public"]["Enums"]["order_status"]
          table_label: string
          total: number
          waiter_name: string
        }[]
      }
      get_pickup_board: {
        Args: { _cafe_ref: string }
        Returns: {
          customer_name: string
          ready_at: string
          short_code: string
        }[]
      }
      get_takeaway_menu: { Args: { _takeaway_token: string }; Returns: Json }
      get_takeaway_order_status: {
        Args: { _order_id: string }
        Returns: {
          short_code: string
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ancestor_of: {
        Args: { _ancestor_code: string; _descendant_code: string }
        Returns: boolean
      }
      is_cafe_admin_or_manager: {
        Args: { _cafe_ref: string }
        Returns: boolean
      }
      is_customer_favorite_driver: {
        Args: { _customer_phone: string; _driver_id: string }
        Returns: boolean
      }
      list_available_drivers_for_cafeteria: {
        Args: { _customer_phone?: string }
        Returns: {
          current_lat: number
          current_lng: number
          full_name: string
          id: string
          is_cafe_favorite: boolean
          is_customer_favorite: boolean
          kind: string
          phone: string
          photo_url: string
          rating_avg: number
          status: string
          vehicle_type: string
        }[]
      }
      log_unauthorized_access: {
        Args: { _attempted_roles?: string[]; _path: string }
        Returns: undefined
      }
      order_has_chef_items: { Args: { _order_id: string }; Returns: boolean }
      order_requires_chef: { Args: { _order_id: string }; Returns: boolean }
      owner_adjust_cafeteria_points: {
        Args: { _delta: number; _reason?: string; _ref_code: string }
        Returns: undefined
      }
      owner_adjust_marketer_balance: {
        Args: {
          _delta: number
          _kind: string
          _reason?: string
          _ref_code: string
        }
        Returns: undefined
      }
      owner_get_stats: { Args: never; Returns: Json }
      owner_grace_cafeterias: {
        Args: never
        Returns: {
          grace_started_at: string
          is_blocked: boolean
          name: string
          points_balance: number
          ref_code: string
          seconds_remaining: number
        }[]
      }
      owner_recharges_timeseries: {
        Args: { _days?: number }
        Returns: {
          count: number
          day: string
          total_usd: number
        }[]
      }
      owner_set_cafeteria_trial: {
        Args: { _consumed?: boolean; _ref_code: string; _trial_end: string }
        Returns: undefined
      }
      owner_set_default_trial_days: {
        Args: { _days: number }
        Returns: undefined
      }
      owner_set_footer_banner: {
        Args: {
          _cta_text: string
          _enabled: boolean
          _text: string
          _url: string
        }
        Returns: undefined
      }
      owner_signups_timeseries: {
        Args: { _days?: number }
        Returns: {
          cafeterias: number
          day: string
          marketers: number
        }[]
      }
      owner_top_cafeterias: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          name: string
          points_balance: number
          recharge_count: number
          ref_code: string
          total_recharged: number
        }[]
      }
      owner_top_marketers: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          available_balance: number
          cafeterias_count: number
          level: number
          name: string
          ref_code: string
          total_commission: number
        }[]
      }
      place_delivery_order: {
        Args: {
          _customer_address: string
          _customer_lat: number
          _customer_lng: number
          _customer_name: string
          _customer_phone: string
          _items: Json
          _notes: string
          _takeaway_token: string
        }
        Returns: Json
      }
      place_order: {
        Args: {
          _customer_name: string
          _items: Json
          _mode?: Database["public"]["Enums"]["order_mode"]
          _notes: string
          _qr_token: string
        }
        Returns: string
      }
      place_order_delivery: {
        Args: {
          _customer_address: string
          _customer_lat: number
          _customer_lng: number
          _customer_name: string
          _customer_phone: string
          _items: Json
          _notes: string
          _token: string
        }
        Returns: string
      }
      place_order_takeaway: {
        Args: {
          _customer_name: string
          _customer_phone: string
          _items: Json
          _notes: string
          _token: string
        }
        Returns: string
      }
      place_takeaway_order: {
        Args: {
          _customer_name: string
          _customer_phone: string
          _items: Json
          _notes: string
          _takeaway_token: string
        }
        Returns: Json
      }
      realtime_topic_allowed: { Args: { _topic: string }; Returns: boolean }
      reject_recharge: {
        Args: { _notes?: string; _recharge_id: string }
        Returns: undefined
      }
      reject_shift: {
        Args: { _reason?: string; _shift_id: string }
        Returns: undefined
      }
      request_shift: { Args: never; Returns: string }
      respond_to_delivery: {
        Args: { _accept: boolean; _order_id: string; _reason?: string }
        Returns: undefined
      }
      set_default_price_tier: { Args: { _tier_id: string }; Returns: undefined }
      set_order_status: {
        Args: {
          _new_status: Database["public"]["Enums"]["order_status"]
          _order_id: string
        }
        Returns: undefined
      }
      set_staff_scopes: {
        Args: { _kind: string; _ref_ids: string[]; _staff_id: string }
        Returns: undefined
      }
      set_staff_shift_enabled: {
        Args: { _enabled: boolean; _staff_id: string }
        Returns: undefined
      }
      settle_driver_wallet: { Args: { _driver_id: string }; Returns: number }
      submit_delivery_rating: {
        Args: {
          _cafe_comment: string
          _cafe_stars: number
          _customer_phone: string
          _driver_comment: string
          _driver_stars: number
          _order_id: string
        }
        Returns: undefined
      }
      submit_item_ratings: {
        Args: { _customer_phone: string; _order_id: string; _ratings: Json }
        Returns: undefined
      }
      sync_cafeteria_trial_from_custom_grace: {
        Args: { _ref: string }
        Returns: undefined
      }
      table_is_occupied: { Args: { _table_id: string }; Returns: boolean }
      toggle_cafe_favorite_driver: {
        Args: { _driver_id: string; _favorite: boolean }
        Returns: undefined
      }
      toggle_customer_favorite_driver: {
        Args: {
          _customer_phone: string
          _driver_id: string
          _favorite: boolean
          _order_id: string
        }
        Returns: undefined
      }
      update_delivery_status: {
        Args: { _new_status: string; _order_id: string }
        Returns: undefined
      }
      update_driver_location: {
        Args: { _lat: number; _lng: number }
        Returns: undefined
      }
      update_my_marketer_profile: {
        Args: {
          _address?: string
          _language?: string
          _name?: string
          _phone?: string
          _whatsapp?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "marketer"
        | "cafeteria_admin"
        | "waiter"
        | "chef"
        | "manager"
        | "driver"
      commission_status: "frozen" | "available" | "withdrawn"
      delivery_fee_tier: "a" | "b" | "c"
      delivery_status:
        | "pending_assignment"
        | "requested"
        | "accepted"
        | "rejected"
        | "picked_up"
        | "on_the_way"
        | "delivered"
        | "cancelled"
      order_mode: "dine_in" | "take_away" | "delivery"
      order_status:
        | "new"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
        | "paid"
        | "awaiting_payment"
        | "paid_at_counter"
      rating_target_kind: "driver" | "cafeteria" | "menu_item"
      recharge_status: "pending" | "approved" | "rejected"
      shift_status: "pending" | "active" | "closed" | "rejected"
      signup_type: "created_by_parent" | "self_signup"
      wallet_settlement_status: "pending" | "paid"
      withdrawal_status: "pending" | "approved" | "rejected" | "paid"
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
    Enums: {
      app_role: [
        "owner",
        "marketer",
        "cafeteria_admin",
        "waiter",
        "chef",
        "manager",
        "driver",
      ],
      commission_status: ["frozen", "available", "withdrawn"],
      delivery_fee_tier: ["a", "b", "c"],
      delivery_status: [
        "pending_assignment",
        "requested",
        "accepted",
        "rejected",
        "picked_up",
        "on_the_way",
        "delivered",
        "cancelled",
      ],
      order_mode: ["dine_in", "take_away", "delivery"],
      order_status: [
        "new",
        "preparing",
        "ready",
        "served",
        "cancelled",
        "paid",
        "awaiting_payment",
        "paid_at_counter",
      ],
      rating_target_kind: ["driver", "cafeteria", "menu_item"],
      recharge_status: ["pending", "approved", "rejected"],
      shift_status: ["pending", "active", "closed", "rejected"],
      signup_type: ["created_by_parent", "self_signup"],
      wallet_settlement_status: ["pending", "paid"],
      withdrawal_status: ["pending", "approved", "rejected", "paid"],
    },
  },
} as const
