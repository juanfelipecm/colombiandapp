@AGENTS.md

# gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, button mechanics, iconography, and aesthetic direction are defined there. Do not deviate without explicit user approval.

Hard rules from DESIGN.md (most-violated):
- **Never use emoji glyphs.** Use Lucide icons (`lucide-react`) for all icon needs — UI, mockups, alerts, status, copy. Emojis render inconsistently and read childish in a tool aimed at making teachers feel respected.
- **3D pill button is the signature.** `border-bottom: 6px solid #000`, `border-radius: 9999px`, **black text** on colored fills (not white). The hover "press" animation (`translateY(2px)` + border-bottom shrink + padding compensate) is the signature interaction.
- **Brand red is destructive only.** Never decorative.
- **Single typeface: Montserrat** (400/600/700). No second font.
- **Long-form reading views stay single-column** at any width — comfortable measure beats stretched text.
- **Speech bubble** = AI moment only. One per screen max.

In `/qa` and `/design-review`, flag any code that doesn't match DESIGN.md.
