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
      achievements: {
        Row: {
          character_id: string
          color: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          character_id: string
          color?: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          character_id?: string
          color?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          created_at: string
          id: string
          pin: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          pin: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          pin?: string
          username?: string
        }
        Relationships: []
      }
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          max_players: number
          name: string
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_players?: number
          name: string
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_players?: number
          name?: string
          owner_user_id?: string | null
        }
        Relationships: []
      }
      characters: {
        Row: {
          base_defense: number
          base_hp: number
          campaign_id: string
          car: number
          class: string | null
          coins: number
          color: string
          con: number
          created_at: string
          current_hp: number
          damage_boost: number
          des: number
          fue: number
          id: string
          image_offset_x: number
          image_offset_y: number
          image_scale: number
          image_url: string | null
          initiative: number
          int_stat: number
          name: string
          race: string | null
          role: Database["public"]["Enums"]["character_role"]
          user_id: string | null
          velocity: number
          wis: number
        }
        Insert: {
          base_defense?: number
          base_hp?: number
          campaign_id: string
          car?: number
          class?: string | null
          coins?: number
          color?: string
          con?: number
          created_at?: string
          current_hp?: number
          damage_boost?: number
          des?: number
          fue?: number
          id?: string
          image_offset_x?: number
          image_offset_y?: number
          image_scale?: number
          image_url?: string | null
          initiative?: number
          int_stat?: number
          name: string
          race?: string | null
          role?: Database["public"]["Enums"]["character_role"]
          user_id?: string | null
          velocity?: number
          wis?: number
        }
        Update: {
          base_defense?: number
          base_hp?: number
          campaign_id?: string
          car?: number
          class?: string | null
          coins?: number
          color?: string
          con?: number
          created_at?: string
          current_hp?: number
          damage_boost?: number
          des?: number
          fue?: number
          id?: string
          image_offset_x?: number
          image_offset_y?: number
          image_scale?: number
          image_url?: string | null
          initiative?: number
          int_stat?: number
          name?: string
          race?: string | null
          role?: Database["public"]["Enums"]["character_role"]
          user_id?: string | null
          velocity?: number
          wis?: number
        }
        Relationships: [
          {
            foreignKeyName: "characters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          campaign_id: string
          category: string
          created_at: string
          damage_bonus: number
          defense_bonus: number
          description: string | null
          equipped: boolean
          hp_bonus: number
          id: string
          in_dm_vault: boolean
          max_uses: number | null
          name: string
          owner_character_id: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          slot: Database["public"]["Enums"]["equipment_slot"]
          uses: number | null
        }
        Insert: {
          campaign_id: string
          category?: string
          created_at?: string
          damage_bonus?: number
          defense_bonus?: number
          description?: string | null
          equipped?: boolean
          hp_bonus?: number
          id?: string
          in_dm_vault?: boolean
          max_uses?: number | null
          name: string
          owner_character_id?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          slot: Database["public"]["Enums"]["equipment_slot"]
          uses?: number | null
        }
        Update: {
          campaign_id?: string
          category?: string
          created_at?: string
          damage_bonus?: number
          defense_bonus?: number
          description?: string | null
          equipped?: boolean
          hp_bonus?: number
          id?: string
          in_dm_vault?: boolean
          max_uses?: number | null
          name?: string
          owner_character_id?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          slot?: Database["public"]["Enums"]["equipment_slot"]
          uses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_owner_character_id_fkey"
            columns: ["owner_character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          segments: Json
          undo: Json | null
          undone: boolean
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          segments: Json
          undo?: Json | null
          undone?: boolean
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          segments?: Json
          undo?: Json | null
          undone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
      character_role: "dm" | "player" | "spectator"
      equipment_slot:
        | "casco"
        | "pecho"
        | "pantalon"
        | "botas"
        | "cinturon"
        | "accesorio1"
        | "accesorio2"
        | "mochila"
        | "arma_principal"
        | "arma_secundaria"
        | "guantes"
        | "aditamento"
        | "objeto"
      item_rarity: "white" | "blue" | "purple" | "gold"
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
      character_role: ["dm", "player", "spectator"],
      equipment_slot: [
        "casco",
        "pecho",
        "pantalon",
        "botas",
        "cinturon",
        "accesorio1",
        "accesorio2",
        "mochila",
        "arma_principal",
        "arma_secundaria",
        "guantes",
        "aditamento",
        "objeto",
      ],
      item_rarity: ["white", "blue", "purple", "gold"],
    },
  },
} as const
