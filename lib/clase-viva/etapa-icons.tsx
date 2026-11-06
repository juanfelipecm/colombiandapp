import {
  Brain,
  CircleAlert,
  ClipboardList,
  Flag,
  FlaskConical,
  Layers,
  Lightbulb,
  Megaphone,
  Pencil,
  PencilRuler,
  Play,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { BloqueTipo } from "./bloques";
import type { Etapa } from "./etapas";

export const ETAPA_ICON: Record<Etapa, LucideIcon> = {
  despertar_curiosidad: Lightbulb,
  indagar_investigar: Search,
  crear: PencilRuler,
  reflexionar: Brain,
  compartir: Megaphone,
};

export const BLOQUE_ICON: Record<BloqueTipo | "invalido", LucideIcon> = {
  inicio: Play,
  rompehielos: Users,
  experiencia: FlaskConical,
  actividad: Pencil,
  actividad_por_grados: Layers,
  tarea: ClipboardList,
  cierre: Flag,
  invalido: CircleAlert,
};
