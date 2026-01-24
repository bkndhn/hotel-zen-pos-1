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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      additional_charges: {
        Row: {
          admin_id: string | null
          amount: number
          charge_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount?: number
          charge_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          charge_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_charges_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          id: string
          item_id: string
          price: number
          quantity: number
          total: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          id?: string
          item_id: string
          price: number
          quantity: number
          total: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          id?: string
          item_id?: string
          price?: number
          quantity?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          additional_charges: Json | null
          admin_id: string | null
          bill_no: string
          created_at: string
          created_by: string
          date: string
          discount: number
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          kitchen_status: Database["public"]["Enums"]["service_status"] | null
          payment_details: Json | null
          payment_mode: Database["public"]["Enums"]["payment_method"]
          service_status: Database["public"]["Enums"]["service_status"] | null
          status_updated_at: string | null
          total_amount: number
        }
        Insert: {
          additional_charges?: Json | null
          admin_id?: string | null
          bill_no: string
          created_at?: string
          created_by: string
          date?: string
          discount?: number
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          kitchen_status?: Database["public"]["Enums"]["service_status"] | null
          payment_details?: Json | null
          payment_mode: Database["public"]["Enums"]["payment_method"]
          service_status?: Database["public"]["Enums"]["service_status"] | null
          status_updated_at?: string | null
          total_amount: number
        }
        Update: {
          additional_charges?: Json | null
          admin_id?: string | null
          bill_no?: string
          created_at?: string
          created_by?: string
          date?: string
          discount?: number
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          kitchen_status?: Database["public"]["Enums"]["service_status"] | null
          payment_details?: Json | null
          payment_mode?: Database["public"]["Enums"]["payment_method"]
          service_status?: Database["public"]["Enums"]["service_status"] | null
          status_updated_at?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bluetooth_settings: {
        Row: {
          auto_print: boolean
          created_at: string
          id: string
          is_enabled: boolean
          printer_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_print?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          printer_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_print?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          printer_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      display_settings: {
        Row: {
          category_order: string[] | null
          created_at: string
          id: string
          items_per_row: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_order?: string[] | null
          created_at?: string
          id?: string
          items_per_row?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_order?: string[] | null
          created_at?: string
          id?: string
          items_per_row?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          is_deleted: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          admin_id: string | null
          amount: number
          category: string
          created_at: string
          created_by: string
          date: string
          expense_name: string | null
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          category: string
          created_at?: string
          created_by: string
          date?: string
          expense_name?: string | null
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          date?: string
          expense_name?: string | null
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          is_deleted: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          admin_id: string | null
          base_value: number | null
          category: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean
          minimum_stock_alert: number | null
          name: string
          price: number
          purchase_rate: number | null
          quantity_step: number | null
          sale_count: number | null
          stock_quantity: number | null
          unit: string | null
          unlimited_stock: boolean | null
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          base_value?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          minimum_stock_alert?: number | null
          name: string
          price: number
          purchase_rate?: number | null
          quantity_step?: number | null
          sale_count?: number | null
          stock_quantity?: number | null
          unit?: string | null
          unlimited_stock?: boolean | null
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          base_value?: number | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          minimum_stock_alert?: number | null
          name?: string
          price?: number
          purchase_rate?: number | null
          quantity_step?: number | null
          sale_count?: number | null
          stock_quantity?: number | null
          unit?: string | null
          unlimited_stock?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          is_default: boolean | null
          is_disabled: boolean | null
          payment_method: Database["public"]["Enums"]["payment_mode"] | null
          payment_type: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_disabled?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_mode"] | null
          payment_type: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_disabled?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_mode"] | null
          payment_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_id: string | null
          created_at: string
          hotel_name: string | null
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          hotel_name?: string | null
          id?: string
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          hotel_name?: string | null
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          address: string | null
          contact_number: string | null
          created_at: string | null
          facebook: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          printer_width: string | null
          shop_name: string | null
          show_facebook: boolean | null
          show_instagram: boolean | null
          show_whatsapp: boolean | null
          updated_at: string | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          contact_number?: string | null
          created_at?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          printer_width?: string | null
          shop_name?: string | null
          show_facebook?: boolean | null
          show_instagram?: boolean | null
          show_whatsapp?: boolean | null
          updated_at?: string | null
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          contact_number?: string | null
          created_at?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          printer_width?: string | null
          shop_name?: string | null
          show_facebook?: boolean | null
          show_instagram?: boolean | null
          show_whatsapp?: boolean | null
          updated_at?: string | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          has_access: boolean
          id: string
          page_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_access?: boolean
          id?: string
          page_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_access?: boolean
          id?: string
          page_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          pos_view: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pos_view?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pos_view?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_admin_id: { Args: never; Returns: string }
      get_my_permissions: {
        Args: never
        Returns: {
          has_access: boolean
          page_name: string
        }[]
      }
      get_my_profile_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_user_admin_id: { Args: never; Returns: string }
      has_page_permission: {
        Args: { _page_name: string; _user_id: string }
        Returns: boolean
      }
      is_admin_or_super: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_allowed_to_login: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      payment_method: "cash" | "upi" | "card" | "other"
      payment_mode: "cash" | "card" | "upi" | "online"
      service_status:
        | "pending"
        | "preparing"
        | "ready"
        | "served"
        | "completed"
        | "rejected"
      user_status: "active" | "paused" | "deleted"
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
      app_role: ["admin", "user", "super_admin"],
      payment_method: ["cash", "upi", "card", "other"],
      payment_mode: ["cash", "card", "upi", "online"],
      service_status: [
        "pending",
        "preparing",
        "ready",
        "served",
        "completed",
        "rejected",
      ],
      user_status: ["active", "paused", "deleted"],
    },
  },
} as const
