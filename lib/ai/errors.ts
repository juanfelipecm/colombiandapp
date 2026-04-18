export type ValidationIssue =
  | { kind: "zod_parse"; message: string; path?: (string | number)[] }
  | { kind: "unknown_token"; token: string; where: string }
  | { kind: "missing_cross_product"; grado: number; materia_id: string }
  | { kind: "activity_token_not_in_targets"; token: string; grado: number; materia_id: string }
  | { kind: "evidencia_index_out_of_range"; token: string; index: number }
  | { kind: "evidencia_required_for_non_ingles"; token: string }
  | { kind: "duplicate_dba_target"; grado: number; materia_id: string; dba_id: string };

export class PlanValidationError extends Error {
  readonly issues: ValidationIssue[];
  readonly rawOutput: string;

  constructor(issues: ValidationIssue[], rawOutput: string) {
    super(`Plan validation failed: ${issues.length} issue(s)`);
    this.name = "PlanValidationError";
    this.issues = issues;
    this.rawOutput = rawOutput;
  }

  /** Produce a retry hint for Claude containing specific error context. */
  toRetryHint(): string {
    const lines = this.issues.slice(0, 5).map((issue) => {
      switch (issue.kind) {
        case "zod_parse":
          return `- JSON shape error at ${(issue.path ?? []).join(".")}: ${issue.message}`;
        case "unknown_token":
          return `- You returned token ${issue.token} in ${issue.where}, but it is not in the allowed DBA set.`;
        case "missing_cross_product":
          return `- Missing dba_targets for (grado=${issue.grado}, materia_id=${issue.materia_id}). You must provide 1-2 DBAs for every (grado, materia) pair.`;
        case "activity_token_not_in_targets":
          return `- Activity for grado=${issue.grado}, materia=${issue.materia_id} uses token ${issue.token}, but that token is not in this project's dba_targets for that pair.`;
        case "evidencia_index_out_of_range":
          return `- evidencia_index is out of range for DBA ${issue.token}: index ${issue.index} does not exist.`;
        case "evidencia_required_for_non_ingles":
          return `- DBA ${issue.token} is not Inglés, so evidencia_index cannot be null.`;
        case "duplicate_dba_target":
          return `- Duplicate DBA in (grado=${issue.grado}, materia=${issue.materia_id}). Each (grado, materia) pair must contain 1-2 distinct DBAs.`;
      }
    });
    return `Previous response failed validation:\n${lines.join("\n")}\n\nReturn a corrected JSON response fixing these issues.`;
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
