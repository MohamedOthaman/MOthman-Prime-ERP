export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      auto_match_feedback: {
        Row: {
          external_name: string
          id: string
          last_used: string | null
          matched_product_id: string | null
          usage_count: number | null
        }
        Insert: {
          external_name: string
          id?: string
          last_used?: string | null
          matched_product_id?: string | null
          usage_count?: number | null
        }
        Update: {
          external_name?: string
          id?: string
          last_used?: string | null
          matched_product_id?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_match_feedback_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "auto_match_feedback_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_match_feedback_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_match_feedback_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_match_feedback_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
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
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
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
      customer_sku_mappings: {
        Row: {
          created_at: string | null
          customer_id: string | null
          external_name: string
          id: string
          product_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          external_name: string
          id?: string
          product_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          external_name?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_sku_mappings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "customer_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          area: string | null
          category: string | null
          code: string | null
          created_at: string | null
          created_by: string | null
          credit_days: number | null
          credit_limit: number | null
          currency_code: string | null
          group_name: string | null
          id: string
          is_active: boolean | null
          name: string | null
          name_ar: string | null
          notes: string | null
          phone: string | null
          salesman_code: string | null
          salesman_id: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          category?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          currency_code?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          name_ar?: string | null
          notes?: string | null
          phone?: string | null
          salesman_code?: string | null
          salesman_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          category?: string | null
          code?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          currency_code?: string | null
          group_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          name_ar?: string | null
          notes?: string | null
          phone?: string | null
          salesman_code?: string | null
          salesman_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "salesmen"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          grn_no: string | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          municipality_approved_at: string | null
          municipality_approved_by: string | null
          municipality_notes: string | null
          municipality_reference_no: string | null
          municipality_submitted_at: string | null
          municipality_submitted_by: string | null
          notes: string | null
          received_date: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string | null
          supplier_id: string | null
          supplier_invoice_date: string | null
          supplier_invoice_no: string | null
          supplier_name: string | null
          transport_mode: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_no?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          municipality_approved_at?: string | null
          municipality_approved_by?: string | null
          municipality_notes?: string | null
          municipality_reference_no?: string | null
          municipality_submitted_at?: string | null
          municipality_submitted_by?: string | null
          notes?: string | null
          received_date?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string | null
          transport_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_no?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          municipality_approved_at?: string | null
          municipality_approved_by?: string | null
          municipality_notes?: string | null
          municipality_reference_no?: string | null
          municipality_submitted_at?: string | null
          municipality_submitted_by?: string | null
          notes?: string | null
          received_date?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string | null
          transport_mode?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_headers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_lines: {
        Row: {
          batch_no: string | null
          created_at: string | null
          expiry_date: string | null
          grn_id: string | null
          id: string
          line_no: number | null
          notes: string | null
          product_id: string | null
          production_date: string | null
          putaway_location_ref: string | null
          putaway_warehouse_id: string | null
          putaway_zone_id: string | null
          qc_checked_quantity: number | null
          qc_inspected_at: string | null
          qc_inspected_by: string | null
          qc_notes: string | null
          qc_reason: string | null
          qc_status: string | null
          qty_accepted: number | null
          qty_damaged: number | null
          qty_missing: number | null
          qty_ordered: number | null
          qty_received: number | null
          qty_sample: number | null
          unit_cost: number | null
        }
        Insert: {
          batch_no?: string | null
          created_at?: string | null
          expiry_date?: string | null
          grn_id?: string | null
          id?: string
          line_no?: number | null
          notes?: string | null
          product_id?: string | null
          production_date?: string | null
          putaway_location_ref?: string | null
          putaway_warehouse_id?: string | null
          putaway_zone_id?: string | null
          qc_checked_quantity?: number | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qc_reason?: string | null
          qc_status?: string | null
          qty_accepted?: number | null
          qty_damaged?: number | null
          qty_missing?: number | null
          qty_ordered?: number | null
          qty_received?: number | null
          qty_sample?: number | null
          unit_cost?: number | null
        }
        Update: {
          batch_no?: string | null
          created_at?: string | null
          expiry_date?: string | null
          grn_id?: string | null
          id?: string
          line_no?: number | null
          notes?: string | null
          product_id?: string | null
          production_date?: string | null
          putaway_location_ref?: string | null
          putaway_warehouse_id?: string | null
          putaway_zone_id?: string | null
          qc_checked_quantity?: number | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qc_reason?: string | null
          qc_status?: string | null
          qty_accepted?: number | null
          qty_damaged?: number | null
          qty_missing?: number | null
          qty_ordered?: number | null
          qty_received?: number | null
          qty_sample?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grn_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "receiving_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_no: string | null
          created_at: string | null
          created_by: string | null
          expiry_date: string | null
          id: string
          location_ref: string | null
          product_id: string | null
          production_date: string | null
          qty_available: number | null
          qty_received: number | null
          received_date: string | null
          receiving_line_id: string | null
          unit_cost: number | null
          warehouse_id: string | null
          zone_id: string | null
        }
        Insert: {
          batch_no?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          location_ref?: string | null
          product_id?: string | null
          production_date?: string | null
          qty_available?: number | null
          qty_received?: number | null
          received_date?: string | null
          receiving_line_id?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Update: {
          batch_no?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          location_ref?: string | null
          product_id?: string | null
          production_date?: string | null
          qty_available?: number | null
          qty_received?: number | null
          received_date?: string | null
          receiving_line_id?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          balance_after: number | null
          batch_id: string | null
          batch_no: string | null
          condition: string | null
          created_at: string
          expiry_date: string | null
          id: string
          location_ref: string | null
          movement_type: string
          notes: string | null
          performed_at: string
          performed_by: string | null
          product_id: string
          qty_in: number
          qty_out: number
          reference_id: string | null
          reference_line_id: string | null
          reference_type: string | null
          unit_cost: number | null
          warehouse_id: string | null
          zone_id: string | null
        }
        Insert: {
          balance_after?: number | null
          batch_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          location_ref?: string | null
          movement_type: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          product_id: string
          qty_in?: number
          qty_out?: number
          reference_id?: string | null
          reference_line_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Update: {
          balance_after?: number | null
          batch_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          location_ref?: string | null
          movement_type?: string
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
          product_id?: string
          qty_in?: number
          qty_out?: number
          reference_id?: string | null
          reference_line_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_no: string | null
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string
          production_date: string | null
          quantity: number
          reference_id: string
          reference_line_id: string | null
          reference_type: string
          type: string
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id: string
          production_date?: string | null
          quantity: number
          reference_id: string
          reference_line_id?: string | null
          reference_type: string
          type: string
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string
          production_date?: string | null
          quantity?: number
          reference_id?: string
          reference_line_id?: string | null
          reference_type?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      invoice_headers: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string
          id: string
          salesman_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          salesman_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          salesman_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_headers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_headers_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "salesmen"
            referencedColumns: ["id"]
          },
        ]
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
      invoice_lines: {
        Row: {
          batch_no: string | null
          created_at: string
          discount: number
          expiry_date: string | null
          header_id: string
          id: string
          line_no: number
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          discount?: number
          expiry_date?: string | null
          header_id: string
          id?: string
          line_no?: number
          product_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          discount?: number
          expiry_date?: string | null
          header_id?: string
          id?: string
          line_no?: number
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "invoice_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
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
      ocr_documents: {
        Row: {
          confidence: number | null
          created_at: string | null
          document_type: string
          filename: string
          id: string
          metadata: Json | null
          raw_data: Json | null
          status: string
          storage_path: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          document_type: string
          filename: string
          id?: string
          metadata?: Json | null
          raw_data?: Json | null
          status: string
          storage_path: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          document_type?: string
          filename?: string
          id?: string
          metadata?: Json | null
          raw_data?: Json | null
          status?: string
          storage_path?: string
        }
        Relationships: []
      }
      outbound_execution_allocations: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          inventory_movement_id: string | null
          invoice_line_id: string | null
          movement_id: string | null
          outbound_execution_line_id: string
          qty_allocated: number
          returned_qty: number
        }
        Insert: {
          batch_id?: string | null
          batch_no?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          invoice_line_id?: string | null
          movement_id?: string | null
          outbound_execution_line_id: string
          qty_allocated: number
          returned_qty?: number
        }
        Update: {
          batch_id?: string | null
          batch_no?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          invoice_line_id?: string | null
          movement_id?: string | null
          outbound_execution_line_id?: string
          qty_allocated?: number
          returned_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "outbound_execution_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "sales_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_allocations_outbound_execution_line_id_fkey"
            columns: ["outbound_execution_line_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_execution_lines: {
        Row: {
          batch_no: string | null
          confirmed_by: string | null
          created_at: string
          expiry_date: string | null
          id: string
          inventory_batch_id: string | null
          inventory_movement_id: string | null
          invoice_id: string
          invoice_line_id: string
          loaded_at: string | null
          location_ref: string | null
          picked_at: string | null
          product_id: string
          qty_confirmed: number | null
          qty_required: number
          qty_scanned: number
          returned_qty: number
          scanned_by: string | null
          session_id: string
          updated_at: string
          warehouse_id: string | null
          zone_id: string | null
        }
        Insert: {
          batch_no?: string | null
          confirmed_by?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_batch_id?: string | null
          inventory_movement_id?: string | null
          invoice_id: string
          invoice_line_id: string
          loaded_at?: string | null
          location_ref?: string | null
          picked_at?: string | null
          product_id: string
          qty_confirmed?: number | null
          qty_required: number
          qty_scanned?: number
          returned_qty?: number
          scanned_by?: string | null
          session_id: string
          updated_at?: string
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Update: {
          batch_no?: string | null
          confirmed_by?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_batch_id?: string | null
          inventory_movement_id?: string | null
          invoice_id?: string
          invoice_line_id?: string
          loaded_at?: string | null
          location_ref?: string | null
          picked_at?: string | null
          product_id?: string
          qty_confirmed?: number | null
          qty_required?: number
          qty_scanned?: number
          returned_qty?: number
          scanned_by?: string | null
          session_id?: string
          updated_at?: string
          warehouse_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_execution_lines_inventory_batch_id_fkey"
            columns: ["inventory_batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "sales_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_execution_sessions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_execution_sessions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "sales_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_execution_sessions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_scan_events: {
        Row: {
          barcode: string | null
          id: string
          invoice_id: string
          product_id: string
          qty: number
          scanned_at: string
          scanned_by: string | null
          session_id: string
        }
        Insert: {
          barcode?: string | null
          id?: string
          invoice_id: string
          product_id: string
          qty?: number
          scanned_at?: string
          scanned_by?: string | null
          session_id: string
        }
        Update: {
          barcode?: string | null
          id?: string
          invoice_id?: string
          product_id?: string
          qty?: number
          scanned_at?: string
          scanned_by?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_scan_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          source: string | null
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          source?: string | null
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_prices: {
        Row: {
          cost_price: number
          created_at: string
          discount: number
          id: string
          price_source: string | null
          product_id: string
          selling_price: number
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          discount?: number
          id?: string
          price_source?: string | null
          product_id: string
          selling_price?: number
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          discount?: number
          id?: string
          price_source?: string | null
          product_id?: string
          selling_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          barcodes: string[] | null
          brand: string | null
          brand_id: string | null
          carton_holds: number | null
          category: string | null
          code: string | null
          country: string | null
          country_of_origin: string | null
          created_at: string
          id: string
          image_path: string | null
          internal_code: string | null
          is_active: boolean | null
          item_code: string
          name: string
          name_ar: string | null
          name_en: string | null
          pack_size: string | null
          packaging: string
          section: string | null
          storage_type: string
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          barcodes?: string[] | null
          brand?: string | null
          brand_id?: string | null
          carton_holds?: number | null
          category?: string | null
          code?: string | null
          country?: string | null
          country_of_origin?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          internal_code?: string | null
          is_active?: boolean | null
          item_code: string
          name: string
          name_ar?: string | null
          name_en?: string | null
          pack_size?: string | null
          packaging?: string
          section?: string | null
          storage_type?: string
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          barcodes?: string[] | null
          brand?: string | null
          brand_id?: string | null
          carton_holds?: number | null
          category?: string | null
          code?: string | null
          country?: string | null
          country_of_origin?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          internal_code?: string | null
          is_active?: boolean | null
          item_code?: string
          name?: string
          name_ar?: string | null
          name_en?: string | null
          pack_size?: string | null
          packaging?: string
          section?: string | null
          storage_type?: string
          uom?: string | null
          updated_at?: string | null
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
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: []
      }
      qc_inspections: {
        Row: {
          created_at: string
          grn_line_id: string | null
          id: string
          inspected_at: string
          inspected_by: string | null
          notes: string | null
          result: string | null
        }
        Insert: {
          created_at?: string
          grn_line_id?: string | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
          notes?: string | null
          result?: string | null
        }
        Update: {
          created_at?: string
          grn_line_id?: string | null
          id?: string
          inspected_at?: string
          inspected_by?: string | null
          notes?: string | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspections_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "grn_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspections_grn_line_id_fkey"
            columns: ["grn_line_id"]
            isOneToOne: false
            referencedRelation: "receiving_lines"
            referencedColumns: ["id"]
          },
        ]
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
      sales_headers: {
        Row: {
          cancel_approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          done_at: string | null
          done_by: string | null
          id: string
          invoice_date: string | null
          invoice_no: string | null
          notes: string | null
          ready_at: string | null
          ready_by: string | null
          received_at: string | null
          received_by: string | null
          returns_at: string | null
          salesman_id: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          cancel_approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          notes?: string | null
          ready_at?: string | null
          ready_by?: string | null
          received_at?: string | null
          received_by?: string | null
          returns_at?: string | null
          salesman_id?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          cancel_approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          notes?: string | null
          ready_at?: string | null
          ready_by?: string | null
          received_at?: string | null
          received_by?: string | null
          returns_at?: string | null
          salesman_id?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_headers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_headers_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "salesmen"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_lines: {
        Row: {
          created_at: string | null
          discount: number | null
          header_id: string | null
          id: string
          line_no: number | null
          line_total: number | null
          product_id: string | null
          quantity: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          header_id?: string | null
          id?: string
          line_no?: number | null
          line_total?: number | null
          product_id?: string | null
          quantity?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          header_id?: string | null
          id?: string
          line_no?: number | null
          line_total?: number | null
          product_id?: string | null
          quantity?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_lines_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "sales_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lines_header_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      sales_return_allocations: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          condition: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          invoice_id: string | null
          invoice_line_id: string | null
          outbound_execution_allocation_id: string | null
          outbound_execution_line_id: string | null
          product_id: string
          qty_returned: number
          return_line_id: string
          return_movement_id: string | null
        }
        Insert: {
          batch_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          outbound_execution_allocation_id?: string | null
          outbound_execution_line_id?: string | null
          product_id: string
          qty_returned: number
          return_line_id: string
          return_movement_id?: string | null
        }
        Update: {
          batch_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          outbound_execution_allocation_id?: string | null
          outbound_execution_line_id?: string | null
          product_id?: string
          qty_returned?: number
          return_line_id?: string
          return_movement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "sales_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_outbound_execution_allocation_id_fkey"
            columns: ["outbound_execution_allocation_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_outbound_execution_line_id_fkey"
            columns: ["outbound_execution_line_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "sales_return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_return_movement_id_fkey"
            columns: ["return_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_allocations_return_movement_id_fkey"
            columns: ["return_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements_log"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_lines: {
        Row: {
          allocation_id: string | null
          batch_no: string | null
          condition: string | null
          created_at: string
          expiry_date: string | null
          id: string
          invoice_line_id: string | null
          outbound_execution_line_id: string | null
          product_id: string
          qty_returned: number
          reason: string | null
          return_id: string
          return_movement_id: string | null
          unit_price: number | null
        }
        Insert: {
          allocation_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_line_id?: string | null
          outbound_execution_line_id?: string | null
          product_id: string
          qty_returned: number
          reason?: string | null
          return_id: string
          return_movement_id?: string | null
          unit_price?: number | null
        }
        Update: {
          allocation_id?: string | null
          batch_no?: string | null
          condition?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          invoice_line_id?: string | null
          outbound_execution_line_id?: string | null
          product_id?: string
          qty_returned?: number
          reason?: string | null
          return_id?: string
          return_movement_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_lines_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "sales_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_outbound_execution_line_id_fkey"
            columns: ["outbound_execution_line_id"]
            isOneToOne: false
            referencedRelation: "outbound_execution_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_return_movement_id_fkey"
            columns: ["return_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_return_movement_id_fkey"
            columns: ["return_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements_log"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          invoice_id: string
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          received_at: string | null
          received_by: string | null
          return_no: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          received_at?: string | null
          received_by?: string | null
          return_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          received_at?: string | null
          received_by?: string | null
          return_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      salesmen: {
        Row: {
          code: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string | null
          name_ar: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          name_ar?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          name_ar?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_batches: {
        Row: {
          batch_no: string | null
          created_at: string
          expiry_date: string | null
          id: string
          product_id: string
          qty_available: number
          qty_received: number
          warehouse_id: string | null
        }
        Insert: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id: string
          qty_available: number
          qty_received: number
          warehouse_id?: string | null
        }
        Update: {
          batch_no?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          product_id?: string
          qty_available?: number
          qty_received?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity: number
          reference_id: string
          reference_type: string
          type: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity: number
          reference_id: string
          reference_type: string
          type: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reference_id?: string
          reference_type?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      supplier_sku_mappings: {
        Row: {
          created_at: string
          external_code: string | null
          external_name: string
          id: string
          last_used: string
          product_id: string | null
          supplier_id: string | null
          usage_count: number
        }
        Insert: {
          created_at?: string
          external_code?: string | null
          external_name: string
          id?: string
          last_used?: string
          product_id?: string | null
          supplier_id?: string | null
          usage_count?: number
        }
        Update: {
          created_at?: string
          external_code?: string | null
          external_name?: string
          id?: string
          last_used?: string
          product_id?: string | null
          supplier_id?: string | null
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplier_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_sku_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplier_sku_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          code: string | null
          country: string | null
          created_at: string | null
          credit_days: number | null
          id: string
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          code?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          code?: string | null
          country?: string | null
          created_at?: string | null
          credit_days?: number | null
          id?: string
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      inventory_batch_stock_details: {
        Row: {
          batch_no: string | null
          expiry_date: string | null
          first_received_date: string | null
          grn_no: string | null
          issued_quantity: number | null
          last_received_date: string | null
          product_id: string | null
          production_date: string | null
          received_quantity: number | null
          receiving_invoice_no: string | null
          receiving_reference: string | null
          remaining_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_movements_log: {
        Row: {
          balance_after: number | null
          batch_id: string | null
          batch_no: string | null
          brand: string | null
          expiry_date: string | null
          grn_no: string | null
          id: string | null
          invoice_no: string | null
          location_ref: string | null
          movement_type: string | null
          notes: string | null
          performed_at: string | null
          performed_by: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          product_name_ar: string | null
          qty_in: number | null
          qty_out: number | null
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
          uom: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_product_stock_summary: {
        Row: {
          all_barcodes: string[] | null
          available_quantity: number | null
          batch_count: number | null
          brand: string | null
          carton_holds: number | null
          category: string | null
          code: string | null
          item_code: string | null
          name: string | null
          name_ar: string | null
          name_en: string | null
          nearest_expiry: string | null
          packaging: string | null
          primary_barcode: string | null
          product_id: string | null
          section: string | null
          storage_type: string | null
          uom: string | null
        }
        Relationships: []
      }
      inventory_stock_by_batch: {
        Row: {
          available_quantity: number | null
          batch_no: string | null
          expiry_date: string | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_stock_by_expiry: {
        Row: {
          available_quantity: number | null
          batch_no: string | null
          expiry_date: string | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_stock_by_product: {
        Row: {
          available_quantity: number | null
          batch_no: string | null
          expiry_date: string | null
          product_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_master: {
        Row: {
          barcodes: string[] | null
          brand: string | null
          brand_id: string | null
          carton_holds: number | null
          category: string | null
          code: string | null
          country: string | null
          country_of_origin: string | null
          created_at: string | null
          id: string | null
          image_path: string | null
          internal_code: string | null
          is_active: boolean | null
          item_code: string | null
          name: string | null
          name_ar: string | null
          name_en: string | null
          pack_size: string | null
          packaging: string | null
          section: string | null
          storage_type: string | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          barcodes?: string[] | null
          brand?: string | null
          brand_id?: string | null
          carton_holds?: number | null
          category?: string | null
          code?: string | null
          country?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          id?: string | null
          image_path?: string | null
          internal_code?: string | null
          is_active?: boolean | null
          item_code?: string | null
          name?: string | null
          name_ar?: string | null
          name_en?: string | null
          pack_size?: string | null
          packaging?: string | null
          section?: string | null
          storage_type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          barcodes?: string[] | null
          brand?: string | null
          brand_id?: string | null
          carton_holds?: number | null
          category?: string | null
          code?: string | null
          country?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          id?: string | null
          image_path?: string | null
          internal_code?: string | null
          is_active?: boolean | null
          item_code?: string | null
          name?: string | null
          name_ar?: string | null
          name_en?: string | null
          pack_size?: string | null
          packaging?: string | null
          section?: string | null
          storage_type?: string | null
          uom?: string | null
          updated_at?: string | null
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
      products_overview: {
        Row: {
          all_barcodes: string[] | null
          brand: string | null
          brand_id: string | null
          carton_holds: number | null
          category: string | null
          code: string | null
          cost_price: number | null
          country: string | null
          country_of_origin: string | null
          created_at: string | null
          discount: number | null
          id: string | null
          image_path: string | null
          internal_code: string | null
          is_active: boolean | null
          item_code: string | null
          name: string | null
          name_ar: string | null
          name_en: string | null
          pack_size: string | null
          packaging: string | null
          price_source: string | null
          primary_barcode: string | null
          section: string | null
          selling_price: number | null
          storage_type: string | null
          uom: string | null
          updated_at: string | null
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
      receiving_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          grn_no: string | null
          id: string | null
          inspected_at: string | null
          inspected_by: string | null
          municipality_approved_at: string | null
          municipality_approved_by: string | null
          municipality_notes: string | null
          municipality_reference_no: string | null
          municipality_submitted_at: string | null
          municipality_submitted_by: string | null
          notes: string | null
          received_date: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string | null
          supplier_id: string | null
          supplier_invoice_date: string | null
          supplier_invoice_no: string | null
          supplier_name: string | null
          transport_mode: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_no?: string | null
          id?: string | null
          inspected_at?: string | null
          inspected_by?: string | null
          municipality_approved_at?: string | null
          municipality_approved_by?: string | null
          municipality_notes?: string | null
          municipality_reference_no?: string | null
          municipality_submitted_at?: string | null
          municipality_submitted_by?: string | null
          notes?: string | null
          received_date?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string | null
          transport_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          grn_no?: string | null
          id?: string | null
          inspected_at?: string | null
          inspected_by?: string | null
          municipality_approved_at?: string | null
          municipality_approved_by?: string | null
          municipality_notes?: string | null
          municipality_reference_no?: string | null
          municipality_submitted_at?: string | null
          municipality_submitted_by?: string | null
          notes?: string | null
          received_date?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_invoice_date?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string | null
          transport_mode?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_headers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_lines: {
        Row: {
          batch_no: string | null
          created_at: string | null
          expiry_date: string | null
          header_id: string | null
          id: string | null
          line_no: number | null
          notes: string | null
          product_id: string | null
          production_date: string | null
          putaway_location_ref: string | null
          putaway_warehouse_id: string | null
          putaway_zone_id: string | null
          qc_checked_quantity: number | null
          qc_inspected_at: string | null
          qc_inspected_by: string | null
          qc_notes: string | null
          qc_reason: string | null
          qc_status: string | null
          qty_accepted: number | null
          qty_damaged: number | null
          qty_missing: number | null
          qty_sample: number | null
          quantity: number | null
          received_quantity: number | null
          unit_cost: number | null
        }
        Insert: {
          batch_no?: string | null
          created_at?: string | null
          expiry_date?: string | null
          header_id?: string | null
          id?: string | null
          line_no?: number | null
          notes?: string | null
          product_id?: string | null
          production_date?: string | null
          putaway_location_ref?: string | null
          putaway_warehouse_id?: string | null
          putaway_zone_id?: string | null
          qc_checked_quantity?: number | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qc_reason?: string | null
          qc_status?: string | null
          qty_accepted?: number | null
          qty_damaged?: number | null
          qty_missing?: number | null
          qty_sample?: number | null
          quantity?: number | null
          received_quantity?: number | null
          unit_cost?: number | null
        }
        Update: {
          batch_no?: string | null
          created_at?: string | null
          expiry_date?: string | null
          header_id?: string | null
          id?: string | null
          line_no?: number | null
          notes?: string | null
          product_id?: string | null
          production_date?: string | null
          putaway_location_ref?: string | null
          putaway_warehouse_id?: string | null
          putaway_zone_id?: string | null
          qc_checked_quantity?: number | null
          qc_inspected_at?: string | null
          qc_inspected_by?: string | null
          qc_notes?: string | null
          qc_reason?: string | null
          qc_status?: string | null
          qty_accepted?: number | null
          qty_damaged?: number | null
          qty_missing?: number | null
          qty_sample?: number | null
          quantity?: number | null
          received_quantity?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "grn_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_grn_id_fkey"
            columns: ["header_id"]
            isOneToOne: false
            referencedRelation: "receiving_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_product_stock_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_stock_balance"
            referencedColumns: ["product_id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          done_at: string | null
          done_by: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          notes: string | null
          ready_at: string | null
          ready_by: string | null
          received_at: string | null
          received_by: string | null
          returns_at: string | null
          salesman_id: string | null
          salesman_name: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_headers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_headers_salesman_id_fkey"
            columns: ["salesman_id"]
            isOneToOne: false
            referencedRelation: "salesmen"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_stock_balance: {
        Row: {
          item_code: string | null
          name: string | null
          product_id: string | null
          qty_available: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_invoice: {
        Args: { p_invoice_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          date: string
          id: string
          salesman_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoice_headers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_invoice: {
        Args: { p_approver?: string; p_header_id: string; p_reason: string }
        Returns: Json
      }
      check_duplicate_invoice: {
        Args: {
          p_customer_id?: string
          p_invoice_date?: string
          p_invoice_no: string
          p_total_amount?: number
        }
        Returns: Json
      }
      confirm_picking_done: { Args: { p_invoice_id: string }; Returns: Json }
      create_product_full:
        | {
            Args: {
              p_barcode: string
              p_barcode_source?: string
              p_cost_price?: number
              p_discount?: number
              p_item_code: string
              p_name_ar: string
              p_name_en: string
              p_price_source?: string
              p_selling_price?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_barcode_source?: string
              p_barcodes: string[]
              p_category: string
              p_cost_price: number
              p_discount: number
              p_item_code: string
              p_name_ar: string
              p_name_en: string
              p_price_source?: string
              p_selling_price: number
              p_storage_type: string
              p_uom: string
            }
            Returns: string
          }
      dearmor: { Args: { "": string }; Returns: string }
      gen_random_uuid: { Args: never; Returns: string }
      gen_salt: { Args: { "": string }; Returns: string }
      get_product_available_qty: {
        Args: { p_product_id: string }
        Returns: number
      }
      get_user_role: { Args: never; Returns: string }
      import_food_choice_customers: {
        Args: { customers_payload: Json }
        Returns: {
          inserted_rows: number
          processed_rows: number
          unresolved_salesman_codes: number
          updated_rows: number
        }[]
      }
      import_food_choice_opening_stock: {
        Args: { opening_stock_payload: Json }
        Returns: {
          inserted_opening_rows: number
          processed_batches: number
          replaced_opening_rows: number
        }[]
      }
      import_food_choice_product_master: {
        Args: {
          barcodes_payload: Json
          prices_payload: Json
          products_payload: Json
          review_item_codes?: Json
        }
        Returns: {
          inserted_barcodes: number
          inserted_prices: number
          inserted_products: number
          processed_products: number
          skipped_review_items: number
          updated_prices: number
          updated_products: number
        }[]
      }
      import_food_choice_salesmen: {
        Args: { salesmen_payload: Json }
        Returns: {
          inserted_rows: number
          processed_rows: number
          updated_rows: number
        }[]
      }
      mark_invoice_done: { Args: { p_header_id: string }; Returns: Json }
      mark_invoice_received: { Args: { p_header_id: string }; Returns: Json }
      pgp_armor_headers: {
        Args: { "": string }
        Returns: Record<string, unknown>[]
      }
      post_receiving_to_inventory: { Args: { p_grn_id: string }; Returns: Json }
      post_sales_invoice: { Args: { p_sales_header_id: string }; Returns: Json }
      post_sales_return: { Args: { p_return_id: string }; Returns: Json }
      receive_sales_return: { Args: { p_return_id: string }; Returns: Json }
      record_outbound_scan: {
        Args: { p_barcode: string; p_invoice_id: string; p_qty?: number }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_or_get_picking_session: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      update_product_full:
        | {
            Args: {
              p_barcode: string
              p_cost_price?: number
              p_discount?: number
              p_item_code: string
              p_name_ar: string
              p_name_en: string
              p_product_id: string
              p_selling_price?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_barcodes: string[]
              p_category: string
              p_cost_price: number
              p_discount: number
              p_is_active?: boolean
              p_item_code: string
              p_name_ar: string
              p_name_en: string
              p_product_id: string
              p_selling_price: number
              p_storage_type: string
              p_uom: string
            }
            Returns: undefined
          }
      upsert_supplier_sku_mapping: {
        Args: {
          p_external_code: string
          p_external_name: string
          p_product_id: string
          p_supplier_id: string
        }
        Returns: undefined
      }
      uuid_generate_v1: { Args: never; Returns: string }
      uuid_generate_v1mc: { Args: never; Returns: string }
      uuid_generate_v3: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_generate_v4: { Args: never; Returns: string }
      uuid_generate_v5: {
        Args: { name: string; namespace: string }
        Returns: string
      }
      uuid_nil: { Args: never; Returns: string }
      uuid_ns_dns: { Args: never; Returns: string }
      uuid_ns_oid: { Args: never; Returns: string }
      uuid_ns_url: { Args: never; Returns: string }
      uuid_ns_x500: { Args: never; Returns: string }
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {},
  },
} as const

