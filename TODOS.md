# TODOS

## P2: Edit flow for school and student data
**What:** Add back navigation in onboarding steps + edit school info and student records on Perfil tab.
**Why:** A teacher who mistypes her school name on a phone keyboard currently has no way to fix it. Same for student names and birth dates.
**Effort:** S (CC: ~15min)
**Priority:** P2
**Depends on:** Foundation build complete
**Context:** Flagged by outside voice during CEO review (2026-03-28). The foundation build ships without editing capability. Onboarding is forward-only. Perfil tab is a placeholder with just a logout button. This TODO adds: (1) back button in each onboarding step, (2) edit school info screen accessible from Perfil, (3) edit/delete individual students from a student management screen. RLS already supports UPDATE operations on schools and students.
