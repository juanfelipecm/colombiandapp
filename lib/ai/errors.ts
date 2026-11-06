export type ValidationIssue =
  | { kind: "zod_parse"; message: string; path?: (string | number)[] }
  | { kind: "unknown_token"; token: string; where: string }
  | { kind: "missing_cross_product"; grado: number; materia_id: string }
  | { kind: "target_token_wrong_pair"; token: string; grado: number; materia_id: string }
  | { kind: "evidencia_index_out_of_range"; token: string; index: number }
  | { kind: "evidencia_required_for_non_ingles"; token: string }
  | { kind: "duplicate_dba_target"; grado: number; materia_id: string; dba_id: string }
  | { kind: "etapa_orden_mismatch"; index: number; expected_etapa: string; got_etapa: string; got_orden: number }
  | { kind: "variantes_required"; fase: number; bloque: number }
  | { kind: "variantes_unexpected"; fase: number; bloque: number; tipo: string }
  | {
      kind: "variantes_not_partition";
      fase: number;
      bloque: number;
      missing: number[];
      extra: number[];
      duplicated: number[];
    }
  | { kind: "variantes_single_grade"; fase: number; bloque: number };

const MAX_HINT_ISSUES = 8;

function g(n: number): string {
  return n === 0 ? "Transición" : `${n}°`;
}

export function describeIssue(issue: ValidationIssue): string {
  switch (issue.kind) {
    case "zod_parse":
      return `- Error de forma en ${(issue.path ?? []).join(".") || "(raíz)"}: ${issue.message}`;
    case "unknown_token":
      return `- Usaste el token ${issue.token} en ${issue.where}, pero no está en la lista de DBA permitidos.`;
    case "missing_cross_product":
      return `- Falta dba_targets para (grado=${issue.grado}, materia_id=${issue.materia_id}). Cada par (grado × materia) necesita 1-2 DBA.`;
    case "target_token_wrong_pair":
      return `- El token ${issue.token} no pertenece al par (grado=${issue.grado}, materia_id=${issue.materia_id}). Usa solo los DBA listados para ese par.`;
    case "evidencia_index_out_of_range":
      return `- evidencia_index ${issue.index} no existe para el DBA ${issue.token}.`;
    case "evidencia_required_for_non_ingles":
      return `- El DBA ${issue.token} no es de Inglés: evidencia_index no puede ser null.`;
    case "duplicate_dba_target":
      return `- DBA repetido en (grado=${issue.grado}, materia_id=${issue.materia_id}). Cada par lleva 1-2 DBA distintos.`;
    case "etapa_orden_mismatch":
      return `- fases[${issue.index}] debe tener orden ${issue.index + 1} y etapa '${issue.expected_etapa}', pero tiene orden ${issue.got_orden} y etapa '${issue.got_etapa}'.`;
    case "variantes_required":
      return `- Fase ${issue.fase}, bloque ${issue.bloque + 1}: tipo actividad_por_grados exige variantes_por_grado.`;
    case "variantes_unexpected":
      return `- Fase ${issue.fase}, bloque ${issue.bloque + 1}: tipo ${issue.tipo} debe tener variantes_por_grado = null.`;
    case "variantes_not_partition": {
      const parts: string[] = [];
      if (issue.missing.length) parts.push(`faltan ${issue.missing.map(g).join(", ")}`);
      if (issue.extra.length) parts.push(`sobran ${issue.extra.map(g).join(", ")}`);
      if (issue.duplicated.length) parts.push(`repetidos ${issue.duplicated.map(g).join(", ")}`);
      return `- Fase ${issue.fase}, bloque ${issue.bloque + 1}: las variantes deben cubrir cada grado seleccionado exactamente una vez (${parts.join("; ")}).`;
    }
    case "variantes_single_grade":
      return `- Fase ${issue.fase}, bloque ${issue.bloque + 1}: hay un solo grupo de edad; no uses actividad_por_grados, diferencia por roles dentro del contenido.`;
  }
}

export class PlanValidationError extends Error {
  readonly issues: ValidationIssue[];
  readonly rawOutput: string;

  constructor(issues: ValidationIssue[], rawOutput: string) {
    super(`Plan validation failed: ${issues.length} issue(s)`);
    this.name = "PlanValidationError";
    this.issues = issues;
    this.rawOutput = rawOutput;
  }

  /** Spanish retry hint listing the first issues, for the model's second attempt. */
  toRetryHint(): string {
    const lines = this.issues.slice(0, MAX_HINT_ISSUES).map(describeIssue);
    const more =
      this.issues.length > MAX_HINT_ISSUES
        ? `\n- (y ${this.issues.length - MAX_HINT_ISSUES} error(es) más del mismo tipo)`
        : "";
    return `Tu respuesta anterior falló la validación:\n${lines.join("\n")}${more}\n\nVuelve a llamar a la herramienta con el proyecto completo corregido.`;
  }
}

export class AnthropicError extends Error {
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "AnthropicError";
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

export class FKResolutionError extends Error {
  readonly badToken: string;

  constructor(token: string) {
    super(`Token ${token} did not resolve to a DBA UUID in the in-memory map.`);
    this.name = "FKResolutionError";
    this.badToken = token;
  }
}
