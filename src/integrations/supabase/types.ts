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
      achievement_templates: {
        Row: {
          campaign_id: string
          color: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          campaign_id: string
          color?: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          campaign_id?: string
          color?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          id: string
          language: string
          pin: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          pin: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          pin?: string
          username?: string
        }
        Relationships: []
      }
      booster_assignments: {
        Row: {
          booster_id: string
          campaign_id: string
          character_id: string
          created_at: string
          id: string
          max_uses: number
          uses: number
        }
        Insert: {
          booster_id: string
          campaign_id: string
          character_id: string
          created_at?: string
          id?: string
          max_uses?: number
          uses?: number
        }
        Update: {
          booster_id?: string
          campaign_id?: string
          character_id?: string
          created_at?: string
          id?: string
          max_uses?: number
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "booster_assignments_booster_id_fkey"
            columns: ["booster_id"]
            isOneToOne: false
            referencedRelation: "boosters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booster_assignments_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      boosters: {
        Row: {
          campaign_id: string
          created_at: string
          dados: string | null
          distancia: string | null
          efecto: string | null
          external_id: string | null
          id: string
          in_dm_vault: boolean
          max_uses: number
          modo_lanzamiento: string | null
          name: string
          objetivos: string | null
          owner_character_id: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          template_id: string
          tipo: string | null
          uses: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          dados?: string | null
          distancia?: string | null
          efecto?: string | null
          external_id?: string | null
          id?: string
          in_dm_vault?: boolean
          max_uses?: number
          modo_lanzamiento?: string | null
          name: string
          objetivos?: string | null
          owner_character_id?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          template_id: string
          tipo?: string | null
          uses?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          dados?: string | null
          distancia?: string | null
          efecto?: string | null
          external_id?: string | null
          id?: string
          in_dm_vault?: boolean
          max_uses?: number
          modo_lanzamiento?: string | null
          name?: string
          objetivos?: string | null
          owner_character_id?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          template_id?: string
          tipo?: string | null
          uses?: number
        }
        Relationships: []
      }
      campaign_bans: {
        Row: {
          banned_at: string
          campaign_id: string
          id: string
          user_id: string
        }
        Insert: {
          banned_at?: string
          campaign_id: string
          id?: string
          user_id: string
        }
        Update: {
          banned_at?: string
          campaign_id?: string
          id?: string
          user_id?: string
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
          lock_character_names: boolean
          max_players: number
          name: string
          owner_user_id: string | null
          single_dm_only: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          lock_character_names?: boolean
          max_players?: number
          name: string
          owner_user_id?: string | null
          single_dm_only?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          lock_character_names?: boolean
          max_players?: number
          name?: string
          owner_user_id?: string | null
          single_dm_only?: boolean
        }
        Relationships: []
      }
      character_conditions: {
        Row: {
          catalog_id: string | null
          character_id: string
          created_at: string
          damage_per_turn: number
          icon: string
          id: string
          label: string
          turns_left: number
        }
        Insert: {
          catalog_id?: string | null
          character_id: string
          created_at?: string
          damage_per_turn?: number
          icon?: string
          id?: string
          label: string
          turns_left?: number
        }
        Update: {
          catalog_id?: string | null
          character_id?: string
          created_at?: string
          damage_per_turn?: number
          icon?: string
          id?: string
          label?: string
          turns_left?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_conditions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "condition_effects_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_conditions_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_notes: {
        Row: {
          character_id: string
          content: string
          updated_at: string
        }
        Insert: {
          character_id: string
          content?: string
          updated_at?: string
        }
        Update: {
          character_id?: string
          content?: string
          updated_at?: string
        }
        Relationships: []
      }
      character_skills: {
        Row: {
          campaign_id: string
          character_id: string
          cost: number
          created_at: string
          dice: string | null
          effect: string | null
          icon_key: string | null
          id: string
          imported_row_index: number | null
          is_unlocked: boolean
          name: string
          name_key: string
          order_index: number
          range_targets: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          source: string
          type: string | null
          unlocked_at: string | null
          updated_at: string
          visual_brief: string | null
        }
        Insert: {
          campaign_id: string
          character_id: string
          cost?: number
          created_at?: string
          dice?: string | null
          effect?: string | null
          icon_key?: string | null
          id?: string
          imported_row_index?: number | null
          is_unlocked?: boolean
          name: string
          name_key: string
          order_index?: number
          range_targets?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          source?: string
          type?: string | null
          unlocked_at?: string | null
          updated_at?: string
          visual_brief?: string | null
        }
        Update: {
          campaign_id?: string
          character_id?: string
          cost?: number
          created_at?: string
          dice?: string | null
          effect?: string | null
          icon_key?: string | null
          id?: string
          imported_row_index?: number | null
          is_unlocked?: boolean
          name?: string
          name_key?: string
          order_index?: number
          range_targets?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          source?: string
          type?: string | null
          unlocked_at?: string | null
          updated_at?: string
          visual_brief?: string | null
        }
        Relationships: []
      }
      characters: {
        Row: {
          backpack_slots: number
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
          level: number
          name: string
          race: string | null
          role: Database["public"]["Enums"]["character_role"]
          skill_points: number
          user_id: string | null
          velocity: number
          wis: number
        }
        Insert: {
          backpack_slots?: number
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
          level?: number
          name: string
          race?: string | null
          role?: Database["public"]["Enums"]["character_role"]
          skill_points?: number
          user_id?: string | null
          velocity?: number
          wis?: number
        }
        Update: {
          backpack_slots?: number
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
          level?: number
          name?: string
          race?: string | null
          role?: Database["public"]["Enums"]["character_role"]
          skill_points?: number
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
      combat_encounters: {
        Row: {
          campaign_id: string
          created_at: string
          current_turn_index: number
          ended_at: string | null
          id: string
          requested_by_character_id: string | null
          round_number: number
          started_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          current_turn_index?: number
          ended_at?: string | null
          id?: string
          requested_by_character_id?: string | null
          round_number?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          current_turn_index?: number
          ended_at?: string | null
          id?: string
          requested_by_character_id?: string | null
          round_number?: number
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      combat_enemy_skills: {
        Row: {
          campaign_id: string
          combat_participant_id: string
          created_at: string
          dice: string | null
          effect: string | null
          encounter_id: string
          id: string
          name: string
          order_index: number
          range_text: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          skill_type: string | null
          target_shape: string | null
          targets: string | null
          template_skill_id: string | null
          visual_brief: string | null
        }
        Insert: {
          campaign_id: string
          combat_participant_id: string
          created_at?: string
          dice?: string | null
          effect?: string | null
          encounter_id: string
          id?: string
          name: string
          order_index?: number
          range_text?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          skill_type?: string | null
          target_shape?: string | null
          targets?: string | null
          template_skill_id?: string | null
          visual_brief?: string | null
        }
        Update: {
          campaign_id?: string
          combat_participant_id?: string
          created_at?: string
          dice?: string | null
          effect?: string | null
          encounter_id?: string
          id?: string
          name?: string
          order_index?: number
          range_text?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          skill_type?: string | null
          target_shape?: string | null
          targets?: string | null
          template_skill_id?: string | null
          visual_brief?: string | null
        }
        Relationships: []
      }
      combat_participants: {
        Row: {
          campaign_id: string
          character_id: string | null
          color: string | null
          created_at: string
          display_name: string
          encounter_id: string
          enemy_color: string | null
          enemy_defense: number | null
          enemy_hp: number | null
          enemy_icon: string | null
          enemy_instance_number: number | null
          enemy_max_hp: number | null
          enemy_name: string | null
          enemy_notes: string | null
          enemy_speed: string | null
          enemy_template_id: string | null
          has_ended_turn: boolean
          id: string
          image_url: string | null
          initiative: number
          is_defeated: boolean
          is_enemy_visible: boolean
          is_leader: boolean
          order_index: number
          participant_type: string
          turn_group_id: string | null
        }
        Insert: {
          campaign_id: string
          character_id?: string | null
          color?: string | null
          created_at?: string
          display_name?: string
          encounter_id: string
          enemy_color?: string | null
          enemy_defense?: number | null
          enemy_hp?: number | null
          enemy_icon?: string | null
          enemy_instance_number?: number | null
          enemy_max_hp?: number | null
          enemy_name?: string | null
          enemy_notes?: string | null
          enemy_speed?: string | null
          enemy_template_id?: string | null
          has_ended_turn?: boolean
          id?: string
          image_url?: string | null
          initiative?: number
          is_defeated?: boolean
          is_enemy_visible?: boolean
          is_leader?: boolean
          order_index?: number
          participant_type?: string
          turn_group_id?: string | null
        }
        Update: {
          campaign_id?: string
          character_id?: string | null
          color?: string | null
          created_at?: string
          display_name?: string
          encounter_id?: string
          enemy_color?: string | null
          enemy_defense?: number | null
          enemy_hp?: number | null
          enemy_icon?: string | null
          enemy_instance_number?: number | null
          enemy_max_hp?: number | null
          enemy_name?: string | null
          enemy_notes?: string | null
          enemy_speed?: string | null
          enemy_template_id?: string | null
          has_ended_turn?: boolean
          id?: string
          image_url?: string | null
          initiative?: number
          is_defeated?: boolean
          is_enemy_visible?: boolean
          is_leader?: boolean
          order_index?: number
          participant_type?: string
          turn_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combat_participants_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "combat_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combat_participants_turn_group_id_fkey"
            columns: ["turn_group_id"]
            isOneToOne: false
            referencedRelation: "combat_turn_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      combat_turn_groups: {
        Row: {
          campaign_id: string
          color: string | null
          created_at: string
          encounter_id: string
          group_initiative: number
          id: string
          leader_character_id: string
          name: string | null
        }
        Insert: {
          campaign_id: string
          color?: string | null
          created_at?: string
          encounter_id: string
          group_initiative?: number
          id?: string
          leader_character_id: string
          name?: string | null
        }
        Update: {
          campaign_id?: string
          color?: string | null
          created_at?: string
          encounter_id?: string
          group_initiative?: number
          id?: string
          leader_character_id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combat_turn_groups_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "combat_encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_effects_catalog: {
        Row: {
          campaign_id: string | null
          created_at: string
          damage_default: number
          icon: string
          id: string
          is_damage: boolean
          key: string
          label: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          damage_default?: number
          icon?: string
          id?: string
          is_damage?: boolean
          key: string
          label: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          damage_default?: number
          icon?: string
          id?: string
          is_damage?: boolean
          key?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "condition_effects_catalog_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_campaigns: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          name: string
          original_id: string
          owner_user_id: string | null
          payload: Json
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          name: string
          original_id: string
          owner_user_id?: string | null
          payload: Json
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          name?: string
          original_id?: string
          owner_user_id?: string | null
          payload?: Json
        }
        Relationships: []
      }
      dm_join_requests: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          kind: string
          requester_user_id: string
          requester_username: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          kind?: string
          requester_user_id: string
          requester_username: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          kind?: string
          requester_user_id?: string
          requester_username?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      enemy_template_skills: {
        Row: {
          campaign_id: string
          created_at: string
          dice: string | null
          effect: string | null
          enemy_template_id: string
          id: string
          name: string
          order_index: number
          range_text: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          skill_type: string | null
          target_shape: string | null
          targets: string | null
          updated_at: string
          visual_brief: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          dice?: string | null
          effect?: string | null
          enemy_template_id: string
          id?: string
          name: string
          order_index?: number
          range_text?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          skill_type?: string | null
          target_shape?: string | null
          targets?: string | null
          updated_at?: string
          visual_brief?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          dice?: string | null
          effect?: string | null
          enemy_template_id?: string
          id?: string
          name?: string
          order_index?: number
          range_text?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          skill_type?: string | null
          target_shape?: string | null
          targets?: string | null
          updated_at?: string
          visual_brief?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enemy_template_skills_enemy_template_id_fkey"
            columns: ["enemy_template_id"]
            isOneToOne: false
            referencedRelation: "enemy_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      enemy_templates: {
        Row: {
          base_damage: string | null
          behavior_notes: string | null
          biome: string | null
          campaign_id: string
          color: string
          created_at: string
          created_by_character_id: string | null
          defense: number
          description: string | null
          icon_key: string
          id: string
          immunities: Json
          is_boss: boolean
          is_elite: boolean
          max_hp: number
          name: string
          role: string
          speed: string
          tier: string
          updated_at: string
          weaknesses_text: string | null
        }
        Insert: {
          base_damage?: string | null
          behavior_notes?: string | null
          biome?: string | null
          campaign_id: string
          color?: string
          created_at?: string
          created_by_character_id?: string | null
          defense?: number
          description?: string | null
          icon_key?: string
          id?: string
          immunities?: Json
          is_boss?: boolean
          is_elite?: boolean
          max_hp?: number
          name: string
          role?: string
          speed?: string
          tier?: string
          updated_at?: string
          weaknesses_text?: string | null
        }
        Update: {
          base_damage?: string | null
          behavior_notes?: string | null
          biome?: string | null
          campaign_id?: string
          color?: string
          created_at?: string
          created_by_character_id?: string | null
          defense?: number
          description?: string | null
          icon_key?: string
          id?: string
          immunities?: Json
          is_boss?: boolean
          is_elite?: boolean
          max_hp?: number
          name?: string
          role?: string
          speed?: string
          tier?: string
          updated_at?: string
          weaknesses_text?: string | null
        }
        Relationships: []
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
      login_attempts: {
        Row: {
          blocked_until: string | null
          created_at: string
          failed_count: number
          id: string
          ip: string
          last_failed_at: string | null
          next_try_at: string | null
          username: string | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          ip: string
          last_failed_at?: string | null
          next_try_at?: string | null
          username?: string | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          ip?: string
          last_failed_at?: string | null
          next_try_at?: string | null
          username?: string | null
        }
        Relationships: []
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
      skill_templates: {
        Row: {
          campaign_id: string
          created_at: string
          dados: string | null
          description: string | null
          distancia: string | null
          efecto: string | null
          external_id: string | null
          id: string
          modo_lanzamiento: string | null
          name: string
          objetivos: string | null
          rarity: Database["public"]["Enums"]["item_rarity"]
          tipo: string | null
          unlocked: boolean
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          dados?: string | null
          description?: string | null
          distancia?: string | null
          efecto?: string | null
          external_id?: string | null
          id?: string
          modo_lanzamiento?: string | null
          name: string
          objetivos?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          tipo?: string | null
          unlocked?: boolean
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          dados?: string | null
          description?: string | null
          distancia?: string | null
          efecto?: string | null
          external_id?: string | null
          id?: string
          modo_lanzamiento?: string | null
          name?: string
          objetivos?: string | null
          rarity?: Database["public"]["Enums"]["item_rarity"]
          tipo?: string | null
          unlocked?: boolean
          user_id?: string
        }
        Relationships: []
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
