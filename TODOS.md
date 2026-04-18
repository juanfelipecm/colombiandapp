# TODOS

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
