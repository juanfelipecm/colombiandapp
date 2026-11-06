# TODOS

## P2: Upgrade `@anthropic-ai/sdk`, enable `strict: true` on `emit_plan`, move to the Claude 5 family
**What:** Bump the SDK from 0.70.1, add `strict: true` to the `emit_plan` tool, and move `PROMPT_MODEL` off `claude-opus-4-7`.
**Why:** Strict tool schemas remove most structural (Zod) failures and therefore most retries. The current-generation models are the supported path going forward.
**Effort:** M (CC: ~1 h + an eval run).
**Priority:** P2
**Depends on:** Clase Viva shipped and the eval baseline recorded (`npm run eval:prompt -- --all --runs 3`) so the model change can be compared against it.
**Context:** Surfaced in /plan-eng-review 2026-11-06. SDK 0.70.1 has no `strict` field. Claude 5.x models reject forced `tool_choice` (`{type: "tool"}`) with a 400, so this is not a one-line model swap: it needs `tool_choice: auto` + a prompt instruction naming the tool + a "no tool call" retry path in `lib/ai/generate-project.ts`.

## P2: `009_drop_pbl_v1.sql` cleanup migration
**What:** Drop `project_activities`, `project_activity_dba_refs` and `check_activity_dba_ref_consistency`; drop `projects.duracion_semanas/producto_final/cierre_actividad/cierre_evaluacion` and `project_phases.dias_label/descripcion`; `SET NOT NULL` on `project_phases.etapa` and `bloques`; regenerate types (`npm run gen:types`).
**Why:** 008 keeps these so legacy pbl-v1 rows survive. Once nothing reads them they are drift surface, and nullable etapa/bloques weaken the CHECKs.
**Effort:** S (CC: ~20 min).
**Priority:** P2
**Depends on:** Deciding to delete legacy pbl-v1 projects (the `SET NOT NULL` fails while they exist). Juan's call.
**Context:** Surfaced in /plan-eng-review 2026-11-06 (Clase Viva engine, D5/D14).

## P3: Sweeper for `project_generation_logs` stuck in `pending`
**What:** A scheduled job (Supabase cron or a Vercel cron route) that marks rows still `pending` after 10 minutes as `timeout` with `error_message = 'function terminated'`.
**Why:** If the platform kills the function (300s cap, OOM, deploy mid-run) nothing writes the terminal status. The admin log keeps a phantom `pending` and nobody counts how often it happens.
**Effort:** S (CC: ~30 min).
**Priority:** P3
**Depends on:** Nothing. Reuses the existing `timeout` status.
**Context:** Pre-existing gap surfaced in /plan-eng-review 2026-11-06. The Clase Viva retry clamp + stream abort make it rare, not impossible.

## P3: "Arte" as a selectable área
**What:** Let teachers pick Arte in the wizard. All three reference Clase Viva projects list it among their áreas.
**Why:** Teachers following the methodology's own examples will look for Arte and not find it.
**Effort:** S after the decision (CC: ~30 min).
**Priority:** P3
**Depends on:** A curriculum decision: MEN publishes no DBA for Educación Artística, so `materias` has no Arte row and a DBA-less pair would need its own representation in the validator and the "DBA por grado" table.
**Context:** Surfaced in /plan-eng-review 2026-11-06 reading the reference PDFs.

## P3: Friendly page for legacy share links
**What:** When `/api/proyectos/[id]/share-{image,pdf}` hits `no_phases` (archived pbl-v1 project), return a small branded HTML page (flag bar, "Este plan ya no está disponible. Pídele a tu colega la versión nueva.") instead of a bare 422.
**Why:** A colleague opening an old link on a phone sees JSON at the one moment the app meets a new teacher.
**Effort:** S (CC: ~15 min). `lib/share-render/route-helper.ts` already branches on `no_phases`.
**Priority:** P3
**Depends on:** Nothing.
**Context:** Surfaced in /plan-design-review 2026-11-06. Only matters if pbl-v1 share links were actually sent around.

## P2: Build playwright auth-session helper
**What:** Implement `tests/e2e/fixtures/auth.ts` per the pattern in `tests/e2e/README.md` (service-role JWT injection or storageState).
**Why:** Five specs are currently `test.skip`-gated waiting on this: `wizard-happy-path`, `idempotency`, `backgrounding`, `admin-404`, and the new `share-image-authed.spec.ts` (added in the Satori rewrite). Without it we have no authenticated end-to-end coverage of the share render pipeline.
**Effort:** S (CC: ~1-2 hr)
**Priority:** P2
**Depends on:** Service-role key env var available to playwright runner.
**Context:** Flagged repeatedly in /plan-eng-review cycles. Unit tests + golden snapshot in `tests/share-render/render.test.ts` cover renderer correctness; the missing piece is the integration assertion (route + auth + render + cache headers all together).

## P2: Per-user rate limit on share routes
**What:** Add per-user rate limiting (~60 req/min) on `/api/proyectos/[id]/share-{image,pdf}`.
**Why:** ETag + Vercel edge cache absorbs most repeat-share volume today. At >100 daily active teachers, or if an account is compromised and someone scripts share calls, the chromium render becomes the most expensive request in the app and worth gating.
**Effort:** S (CC: ~30 min — wire `@upstash/ratelimit` middleware in `lib/share-render/route-helper.ts` before auth check, return 429 + `Retry-After: 60`).
**Priority:** P2
**Depends on:** None — can be added any time.
**Context:** Surfaced in /plan-eng-review 2026-05-03 (share-image plan). Deferred per "engineered enough" — current cache + Vercel concurrency limits handle today's load. Revisit at >100 DAU or first abuse signal.

## P2: Write DESIGN.md via /design-consultation after PBL ships
**What:** Run `/design-consultation` to produce a formal DESIGN.md documenting the design system that emerged from PBL implementation.
**Why:** Tokens + components exist in code but no authoritative design doc. Future design reviews have no calibration source.
**Effort:** S (CC: ~2-3 hrs after PBL lands)
**Priority:** P2
**Depends on:** PBL project creator shipped.
**Context:** Surfaced in /plan-design-review 2026-04-17 (PBL plan, score 6/10 → 9/10). Informal system: Colombian flag tokens, grade color pairs (accessible bg+text), Montserrat, motion spec (accordion 200ms, generating flag-bar 12s, completion 300/900/300ms), voice spec (collaborative "we", no diminutives, 15 canonical strings). Run /design-consultation after PBL to formalize.

## P2: Apply viewport policy across existing pages
**What:** Wrap `app/(app)/layout.tsx` with a `SingleColumnContainer` so dashboard, onboarding, perfil, estudiantes also get the mobile-only + 420px-centered fallback on tablet/desktop.
**Why:** Policy set for PBL but applies app-wide. Existing pages stretch full-width on desktop.
**Effort:** S (CC: ~30 min)
**Priority:** P2
**Depends on:** `SingleColumnContainer` built during PBL step 7.
**Context:** Surfaced in /plan-design-review 2026-04-17. Juan's users are mobile-only but the app shouldn't look broken on shared sede desktops.

## P2: Edit flow for school and student data
**What:** Add back navigation in onboarding steps + edit school info and student records on Perfil tab.
**Why:** A teacher who mistypes her school name on a phone keyboard currently has no way to fix it. Same for student names and birth dates.
**Effort:** S (CC: ~15min)
**Priority:** P2
**Depends on:** Foundation build complete
**Context:** Flagged by outside voice during CEO review (2026-03-28). The foundation build ships without editing capability. Onboarding is forward-only. Perfil tab is a placeholder with just a logout button. This TODO adds: (1) back button in each onboarding step, (2) edit school info screen accessible from Perfil, (3) edit/delete individual students from a student management screen. RLS already supports UPDATE operations on schools and students.
