export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      derechos_basicos_aprendizaje: {
        Row: {
          created_at: string
          enunciado: string
          grado: number
          id: string
          materia_id: string
          numero: number
        }
        Insert: {
          created_at?: string
          enunciado: string
          grado: number
          id?: string
          materia_id: string
          numero: number
        }
        Update: {
          created_at?: string
          enunciado?: string
          grado?: number
          id?: string
          materia_id?: string
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "derechos_basicos_aprendizaje_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
        ]
      }
      evidencias_aprendizaje: {
        Row: {
          created_at: string
          dba_id: string
          descripcion: string
          id: string
          numero: number
        }
        Insert: {
          created_at?: string
          dba_id: string
          descripcion: string
          id?: string
          numero: number
        }
        Update: {
          created_at?: string
          dba_id?: string
          descripcion?: string
          id?: string
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "evidencias_aprendizaje_dba_id_fkey"
            columns: ["dba_id"]
            isOneToOne: false
            referencedRelation: "derechos_basicos_aprendizaje"
            referencedColumns: ["id"]
          },
        ]
      }
      materias: {
        Row: {
          created_at: string
          id: string
          nombre: string
          orden: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          orden: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          slug?: string
        }
        Relationships: []
      }
      project_activities: {
        Row: {
          evidencia_observable: string
          grado: number
          id: string
          materia_id: string
          phase_id: string
          tarea: string
        }
        Insert: {
          evidencia_observable: string
          grado: number
          id?: string
          materia_id: string
          phase_id: string
          tarea: string
        }
        Update: {
          evidencia_observable?: string
          grado?: number
          id?: string
          materia_id?: string
          phase_id?: string
          tarea?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activities_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activities_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "project_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_dba_refs: {
        Row: {
          activity_id: string
          dba_target_id: string
        }
        Insert: {
          activity_id: string
          dba_target_id: string
        }
        Update: {
          activity_id?: string
          dba_target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_dba_refs_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "project_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_dba_refs_dba_target_id_fkey"
            columns: ["dba_target_id"]
            isOneToOne: false
            referencedRelation: "project_dba_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      project_dba_targets: {
        Row: {
          dba_id: string
          evidencia_id: string | null
          grado: number
          id: string
          materia_id: string
          orden: number
          project_id: string
        }
        Insert: {
          dba_id: string
          evidencia_id?: string | null
          grado: number
          id?: string
          materia_id: string
          orden: number
          project_id: string
        }
        Update: {
          dba_id?: string
          evidencia_id?: string | null
          grado?: number
          id?: string
          materia_id?: string
          orden?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_dba_targets_dba_id_fkey"
            columns: ["dba_id"]
            isOneToOne: false
            referencedRelation: "derechos_basicos_aprendizaje"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dba_targets_evidencia_id_fkey"
            columns: ["evidencia_id"]
            isOneToOne: false
            referencedRelation: "evidencias_aprendizaje"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dba_targets_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dba_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_generation_logs: {
        Row: {
          attempt_number: number
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          inputs_jsonb: Json
          latency_ms: number | null
          model: string
          parent_attempt_id: string | null
          project_id: string | null
          prompt_version: string
          raw_output_jsonb: Json | null
          status: string
          teacher_id: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          inputs_jsonb: Json
          latency_ms?: number | null
          model: string
          parent_attempt_id?: string | null
          project_id?: string | null
          prompt_version: string
          raw_output_jsonb?: Json | null
          status: string
          teacher_id: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          attempt_number?: number
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          inputs_jsonb?: Json
          latency_ms?: number | null
          model?: string
          parent_attempt_id?: string | null
          project_id?: string | null
          prompt_version?: string
          raw_output_jsonb?: Json | null
          status?: string
          teacher_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_generation_logs_parent_attempt_id_fkey"
            columns: ["parent_attempt_id"]
            isOneToOne: false
            referencedRelation: "project_generation_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_generation_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_generation_logs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_grados: {
        Row: {
          grado: number
          project_id: string
        }
        Insert: {
          grado: number
          project_id: string
        }
        Update: {
          grado?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_grados_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_materiales: {
        Row: {
          id: string
          nombre: string
          orden: number
          project_id: string
        }
        Insert: {
          id?: string
          nombre: string
          orden: number
          project_id: string
        }
        Update: {
          id?: string
          nombre?: string
          orden?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_materiales_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_materias: {
        Row: {
          materia_id: string
          project_id: string
        }
        Insert: {
          materia_id: string
          project_id: string
        }
        Update: {
          materia_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_materias_materia_id_fkey"
            columns: ["materia_id"]
            isOneToOne: false
            referencedRelation: "materias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_materias_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_phases: {
        Row: {
          descripcion: string
          dias_label: string
          id: string
          nombre: string
          orden: number
          project_id: string
        }
        Insert: {
          descripcion: string
          dias_label: string
          id?: string
          nombre: string
          orden: number
          project_id: string
        }
        Update: {
          descripcion?: string
          dias_label?: string
          id?: string
          nombre?: string
          orden?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_students: {
        Row: {
          project_id: string
          student_id: string
        }
        Insert: {
          project_id: string
          student_id: string
        }
        Update: {
          project_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_students_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cierre_actividad: string
          cierre_evaluacion: string
          created_at: string
          duracion_semanas: number
          id: string
          idempotency_key: string
          model: string
          pregunta_guia: string
          producto_final: string
          prompt_version: string
          school_id: string
          se_enseno_bien: boolean | null
          status: string
          teacher_id: string
          tema_contexto: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          cierre_actividad: string
          cierre_evaluacion: string
          created_at?: string
          duracion_semanas: number
          id?: string
          idempotency_key: string
          model: string
          pregunta_guia: string
          producto_final: string
          prompt_version: string
          school_id: string
          se_enseno_bien?: boolean | null
          status?: string
          teacher_id: string
          tema_contexto?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          cierre_actividad?: string
          cierre_evaluacion?: string
          created_at?: string
          duracion_semanas?: number
          id?: string
          idempotency_key?: string
          model?: string
          pregunta_guia?: string
          producto_final?: string
          prompt_version?: string
          school_id?: string
          se_enseno_bien?: boolean | null
          status?: string
          teacher_id?: string
          tema_contexto?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          department: string
          grades: number[]
          id: string
          municipality: string
          name: string
          teacher_id: string
          updated_at: string
          vereda: string | null
        }
        Insert: {
          created_at?: string
          department: string
          grades?: number[]
          id?: string
          municipality: string
          name: string
          teacher_id: string
          updated_at?: string
          vereda?: string | null
        }
        Update: {
          created_at?: string
          department?: string
          grades?: number[]
          id?: string
          municipality?: string
          name?: string
          teacher_id?: string
          updated_at?: string
          vereda?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: true
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          created_at: string
          first_name: string
          grade: number
          id: string
          last_name: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          first_name: string
          grade: number
          id?: string
          last_name?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          first_name?: string
          grade?: number
          id?: string
          last_name?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          first_name: string
          id: string
          last_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name: string
          id: string
          last_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_project_from_plan: { Args: { plan: Json }; Returns: string }
      get_teacher_school_ids: { Args: never; Returns: string[] }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
      upsert_dba: {
        Args: {
          p_enunciado: string
          p_evidencias: Json
          p_grado: number
          p_materia_slug: string
          p_numero: number
        }
        Returns: string
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
