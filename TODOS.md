# TODOS

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

## P3: Kebab touch target below 44px guideline
**What:** Bump `KebabMenu` button from `h-9 w-9` (36×36px) to `h-11 w-11` (44×44px) in `app/(app)/proyectos/[id]/project-view.tsx`. Audit other small icon buttons (BackLink chevron, DisclosureSection chevrons) for the same issue.
**Why:** Pre-existing a11y concern flagged during plan-design-review Pass 6. WCAG 2.5.5 Target Size guideline says 44×44px minimum on touch surfaces.
**Effort:** S (CC: ~10 min, single PR).
**Priority:** P3
**Depends on:** None.
**Context:** Surfaced in /plan-design-review 2026-05-03. Out of scope for the share-image PR (different surface, different intent).

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
