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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          batch_no: string
          created_at: string
          expiry_date: string
          id: string
          product_id: string
          production_date: string | null
          qty: number
          received_date: string
          unit: string
        }
        Insert: {
          batch_no: string
          created_at?: string
          expiry_date: string
          id?: string
          product_id: string
          production_date?: string | null
          qty?: number
          received_date?: string
          unit?: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          expiry_date?: string
          id?: string
          product_id?: string
          production_date?: string | null
          qty?: number
          received_date?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          batch_no: string
          created_at: string
          expiry_date: string | null
          id: string
          invoice_id: string
          product_code: string
          product_name: string
          qty: number
          unit: string
        }
        Insert: {
          batch_no?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_id: string
          product_code: string
          product_name: string
          qty: number
          unit: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_id?: string
          product_code?: string
          product_name?: string
          qty?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string | null
          date: string
          id: string
          invoice_no: string
          status: string
          time: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          date?: string
          id?: string
          invoice_no: string
          status?: string
          time?: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          date?: string
          id?: string
          invoice_no?: string
          status?: string
          time?: string
          type?: string
        }
        Relationships: []
      }
      market_returns: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          driver_name: string
          id: string
          voucher_number: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          driver_name?: string
          id?: string
          voucher_number?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          driver_name?: string
          id?: string
          voucher_number?: string
        }
        Relationships: []
      }
      movements: {
        Row: {
          batch_no: string
          created_at: string
          created_by: string | null
          id: string
          invoice_no: string | null
          product_code: string
          product_name: string
          qty: number
          return_id: string | null
          type: string
          unit: string
        }
        Insert: {
          batch_no: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          product_code: string
          product_name: string
          qty: number
          return_id?: string | null
          type: string
          unit: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          product_code?: string
          product_name?: string
          qty?: number
          return_id?: string | null
          type?: string
          unit?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcodes: string[] | null
          brand_id: string
          carton_holds: number | null
          code: string
          created_at: string
          id: string
          name: string
          packaging: string
          storage_type: string
        }
        Insert: {
          barcodes?: string[] | null
          brand_id: string
          carton_holds?: number | null
          code: string
          created_at?: string
          id?: string
          name: string
          packaging?: string
          storage_type?: string
        }
        Update: {
          barcodes?: string[] | null
          brand_id?: string
          carton_holds?: number | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          packaging?: string
          storage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      return_items: {
        Row: {
          batch_no: string
          created_at: string
          expiry_date: string | null
          id: string
          product_code: string
          product_name: string
          qty: number
          return_id: string
          unit: string
        }
        Insert: {
          batch_no?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_code: string
          product_name: string
          qty: number
          return_id: string
          unit: string
        }
        Update: {
          batch_no?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_code?: string
          product_name?: string
          qty?: number
          return_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "market_returns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
