# Design System — Colombiando

Source of truth for every visual decision in the Colombiando app. Read this before changing UI. If you need to deviate, ask the user first and log the decision below.

## Product Context
- **What this is:** A web app helping rural multigrade-school teachers in Colombia plan project-based learning. One teacher, one classroom, grades 1-5 simultaneously.
- **Who it's for:** Diana Molina-style users — teachers in rural Colombia, working from a phone after school, occasionally from a desktop browser.
- **Space/industry:** Non-profit ed-tech. Spanish-language. Field-authentic.
- **Project type:** Mobile-first, fully responsive web app (Next.js 16 + React 19 + Tailwind 4 + Supabase).
- **Memorable thing:** *"Por fin alguien me entiende."* The teacher feels respected as an expert. Every choice serves competence — not playfulness, not corporate gloss.
- **Reference brand:** https://www.colombiando.co/es/ — the marketing site. The app translates that visual language to a working tool.

## Aesthetic Direction
- **Direction:** *Warm-utilitarian.* Posters-from-the-70s warmth meets a well-made notebook. The 3D pill button is the mood made literal — chunky, friendly, clearly made by humans, in a place that has color.
- **Decoration level:** *Intentional.* Speech bubbles and brand color appear at specific moments (AI insights, celebration, status, grade identity), not as wallpaper.
- **Mood:** Diana opens the app at 9pm after dinner. It feels like home, treats her like a professional, and wastes none of her time.
- **What this is NOT:** Material Design. iOS-native. Generic SaaS. Indigo-and-Inter. Soft-gradient buttons. Decorative blob backgrounds. Stock-photo heroes.

## Typography
- **Single family:** Montserrat. Weights: 400, 600, 700. No second face.
- **Loading:** `next/font/google` with `Montserrat({ subsets: ['latin'], weight: ['400','600','700'], variable: '--font-montserrat' })`. Already wired in `app/layout.tsx`.
- **Color:** body text is true black `#000000` — *not* `#222`. Matches the marketing site's computed CSS. Soft grays only for muted/secondary text.
- **Scale (mobile-first, 16px root):**

| Token       | Size / Line | Weight | Notes |
|-------------|------------|--------|-------|
| `display`   | 32 / 36    | 700    | Page title. One per screen. |
| `h1`        | 24 / 32    | 700    | Section openers — often `--c-blue`, mirroring the marketing site's blue H2 move. |
| `h2`        | 20 / 28    | 600    | Sub-section headers. |
| `h3`        | 16 / 24    | 600    | Card titles, inline emphasis. |
| `body`      | 16 / 24    | 400    | Default text. Color black. |
| `body-sm`   | 14 / 20    | 400    | Captions, metadata, muted. |
| `button`    | 16 / 20    | 700    | All buttons. Bold. |
| `tabular`   | 14         | 500    | Numbers in lists/tables. `font-feature-settings: 'tnum'`. |

Desktop: bump `display` to 40/44 at `lg` (1024+).

## Color
- **Approach:** *Restrained-semantic.* Brand colors carry meaning, not decoration. If a color appears, it's saying something.

| Token        | Hex      | Used for |
|--------------|----------|----------|
| `--c-yellow` | `#FFB100`| Secondary CTA, AI-insight callouts, grade 1 badge, "esta semana" status |
| `--c-blue`   | `#0060BB`| Primary CTA, section headings (H1), links, active nav, grade 2 badge |
| `--c-red`    | `#D00000`| **Destructive only** — delete, sign out, error state, grade 3 badge |
| `--c-teal`   | `#37BBCA`| Grade 4 badge |
| `--c-green`  | `#89D819`| Grade 5 badge, "en curso" status indicator |
| `--c-orange` | `#FF7B17`| Reserved for future editorial accents |
| `--black`    | `#000000`| Body text, button-depth border |
| `--text-muted` | `#666666` | Subtitles, metadata, captions |
| `--text-placeholder` | `#999999` | Input placeholder |
| `--surface`  | `#FFFFFF`| Page background, card background |
| `--surface-soft` | `#FAFAFA` | Input background, mobile content background |
| `--border`   | `#EEEEEE`| Card borders, dividers |

**Grade badge tokens** (semantic, mapped to Escuela Nueva grades 1-5):

| Grade | bg        | text     |
|-------|-----------|----------|
| G1    | `#FFF3D0` | `#B07800`|
| G2    | `#D0E8FF` | `#004488`|
| G3    | `#FFE0E0` | `#990000`|
| G4    | `#D0F0F5` | `#1A7A85`|
| G5    | `#D8F5D8` | `#3D7A00`|

**Dark mode:** deferred to v2. Diana plans late at night and would benefit, but foundation first. Add by redesigning surfaces (not just inverting) and reducing brand-color saturation 10-15%.

## Spacing
- **Base unit:** 4px.
- **Density:** Comfortable. Card padding 16-24px. Section gaps 24-32px. Button vertical padding 12-16px (mobile-tappable).

| Token | Value | Use |
|-------|-------|-----|
| `space-1` | 4px  | Atomic gaps (between icon and label) |
| `space-2` | 8px  | Stacked related elements |
| `space-3` | 12px | Input internal padding |
| `space-4` | 16px | Card padding, gap between cards |
| `space-6` | 24px | Section to section |
| `space-8` | 32px | Page-title to first section |
| `space-12`| 48px | Hero / onboarding moments |

## Layout & Responsive
- **Approach:** Mobile-first single column. Desktop earns extra columns where it serves comprehension, not just to fill width.
- **Max content width:** 1200px on desktop. Centered.
- **Breakpoints:**

| Breakpoint | min-width | Behavior |
|-----------|-----------|----------|
| `base`    | 0         | Single column. Bottom nav. One primary action per screen. |
| `sm`      | 640px     | Roomier padding. Forms can go 2-column where it helps. |
| `md`      | 768px     | List + detail layouts (master/detail). Bottom nav still acceptable. |
| `lg`      | 1024px    | **Sidebar nav replaces bottom nav.** Card grids up to 3 columns. Max-width 1200px engages. |
| `xl`      | 1280px    | Generous padding. |

**The exception:** Long-form reading views (project plan, "Plan Tomorrow" generated output, lesson detail) stay **single-column at any width**. Long text needs a comfortable measure (~65-75 characters), not stretched edge-to-edge.

## Border Radius

| Token        | Value   | Use |
|--------------|---------|-----|
| `radius-sm`  | 8px     | Inputs, badges |
| `radius-md`  | 12px    | Cards, alerts |
| `radius-lg`  | 16px    | Bottom sheets, speech bubbles |
| `radius-pill`| 9999px  | **Buttons — the signature** |

## The 3D Button (the signature mechanic)

The single most identifiable element of the brand. Ported from the marketing site (`Button.astro:7-25` in the reference repo). **Critical differentiator: black text on colored fills, hard black depth border, pill shape.** Every other ed-tech tool ships flat or soft-gradient buttons. We don't.

### Spec

```tsx
// Default ("rest") state
display: inline-flex; gap: 8px;
border-radius: 9999px;            // pill
padding: 12px 24px;               // md (default)
font: Montserrat 700 16px/20px;
color: #000;                      // BLACK text on colored fills (the differentiator)
background: <variant color>;
border: none;
border-bottom: 6px solid #000;    // the 3D depth
transition: transform 150ms ease-out, border-bottom-width 150ms ease-out, padding-bottom 150ms ease-out;

// Hover ("press") state
transform: translateY(2px);
border-bottom-width: 2px;
padding-bottom: 16px;             // padding compensates so total height stays constant

// Disabled
opacity: 0.4; cursor: not-allowed;
// no hover transform when disabled
```

### Variants

| Variant      | bg          | text         | Use |
|--------------|-------------|--------------|-----|
| `primary`    | `--c-blue`  | `#000`       | Primary action per screen |
| `secondary`  | `--c-yellow`| `#000`       | Alternative emphasis, AI-suggested action |
| `destructive`| `--c-red`   | `#FFF` (white is the readability exception) | Delete, sign out |
| `ghost`      | `#FFF`      | `#000`       | Cancel, secondary in a pair |
| `active`     | `#FFF`      | `--c-blue`   | Selected nav item — 2px border in brand color, 2px bottom border (looks "pressed in") |

### Sizes

| Size  | Padding   | Border-bottom | Font |
|-------|-----------|---------------|------|
| `sm`  | 8px 16px  | 4px           | 14px |
| `md`  | 12px 24px | 6px (default) | 16px |
| `lg`  | 16px 32px | 8px           | 18px (onboarding hero CTAs) |

### Implementation note
Existing `components/ui/button.tsx` ships flat buttons (`bg-brand-blue text-white hover:bg-brand-blue/90`). **This needs to change** to the 3D mechanic above to align with the brand. Do that as its own PR — flag any UI work that depends on it.

## Iconography

**Library:** [Lucide](https://lucide.dev) (`lucide-react`). MIT, tree-shakeable, ~1KB per icon, stroke-based, pairs with Montserrat 600/700.

**Never use emoji glyphs** — not in UI, not in mockups, not in alert prefixes, not in copy. Emojis render inconsistently across platforms and read as childish in a tool aimed at making teachers feel like respected professionals.

**Default sizes:**
- Bottom nav icons: 22px
- Sidebar nav, button leading icons, alert prefixes: 18px
- Inline emphasis: 14px (`1em` of body text)

**Stroke:** width 2, `currentColor` (so icons inherit text color from context — active nav blue, muted nav gray, etc.).

**Common mappings** (use these names from `lucide-react`):
- Projects: `<BookOpen />` 
- Students: `<Users />`
- Calendar / "Hoy": `<Calendar />`
- Evidencias: `<BarChart3 />`
- Mi escuela: `<School />`
- Mi perfil: `<User />`
- AI / generated content: `<Sparkles />`
- Add: `<Plus />`
- Success alert: `<Check />`
- Error / destructive confirm: `<X />`
- Info alert: `<Info />`
- Warning alert: `<AlertTriangle />`

## Motion

**Approach:** *Intentional.* Animations earn their keep — they explain a state change or signal an interaction.

| Token | Value | Use |
|-------|-------|-----|
| `duration-micro` | 50-100ms | Hover/focus state on small elements |
| `duration-short` | 150ms    | The 3D button "press" (signature) |
| `duration-medium`| 250ms    | Bottom-sheet slide, modal enter |
| `duration-long`  | 350ms    | LLM-generated content reveal (with subtle scale-from-0.98) |

Easing: `ease-out` for enter, `ease-in` for exit, `ease-in-out` for moves.

## Signature Decorative Elements

### 1. Speech bubble (the AI moment)

When the LLM generates a project plan, surfaces a tip, or proactively suggests an action, it appears in a colored speech-bubble card. This is the visual signature for "Colombiando is helping you."

```
- Background: --c-yellow (warm) or --c-blue (institutional). Yellow for invitations/tips, blue for confirmations/state.
- Border-bottom: 4px solid #000 (matches button depth language)
- Border-radius: 16px (radius-lg)
- Tail: triangle pointing down-left, 12px tall, color matches bubble bg, with a 2px black outline behind it
- Padding: 16px 18px
- Body: 14px / 1.45 / weight 500
- Open with a <Sparkles /> icon + "Diana," (the user's first name) — personal, not anonymous
- Always offers an action via the 3D button (sm size)
```

Use sparingly — at most one bubble per screen. Loses meaning if it appears on every surface.

### 2. Yellow callout cards
For curiosity prompts, info that adds context but isn't actionable. Yellow background, dark text, no tail (that's only for AI bubbles), 12px radius.

### 3. The flag bar
The 4px tri-color bar at the very top of the app (yellow 50% / blue 25% / red 25%) — already shipped in `components/ui/flag-bar.tsx`. Keep it on every authenticated screen. It's the most subtle Colombian signature in the system.

### 4. The wordmark
The multicolored "colombiANDO" wordmark from the marketing site (each letter rotates yellow/red/blue, "ANDO" is emphasized larger). Use the existing logo image at `recursos-marca/logo-ColombiAndo.png` for header surfaces. CSS reconstruction works as a fallback at small sizes but the rasterized logo is the source of truth.

## Forms

- Input bg: `--surface-soft` (`#FAFAFA`)
- Border: `1px solid --border` (`#EEEEEE`)
- Border-radius: 8px (`radius-sm`)
- Padding: 12px 14px
- Font: Montserrat 400, 15-16px
- Focus: border-color shifts to `--c-blue`, bg to white, no glow shadow
- Label: 13px, weight 600, color black, 6px below
- Error message: 13px, color `--c-red`, below input

## Alerts

Four variants, distinguished by left border color and tinted background. Always include a Lucide icon prefix (no emoji).

| Variant | bg | left border | icon |
|---------|----|-------------|----|
| success | `#E8F8DD` | `--c-green` | `<Check />` |
| info    | `#DDEEFF` | `--c-blue`  | `<Info />`  |
| warning | `#FFF3D0` | `--c-yellow`| `<AlertTriangle />` |
| error   | `#FFE0E0` | `--c-red`   | `<X />`     |

## Mobile patterns

- **Bottom nav** (`components/ui/bottom-nav.tsx` already shipped): 4 items max, icon (22px) + label (11px), active item in `--c-blue`. Hide on `lg` and up — sidebar nav takes over.
- **Bottom sheet** (`components/ui/bottom-sheet.tsx` already shipped): For secondary flows that don't deserve a full route. Slide-up 250ms.
- **Single primary action per screen.** The teacher knows what to do next without scanning.

## Voice / Copy

- Spanish, formal-but-warm "tú" or first-name address ("Diana, ...")
- Short sentences. Active voice.
- AI surfaces always identify themselves with `<Sparkles />`. Never pretend to be human.
- Status: "En curso", "Esta semana", "Borrador", "Listo" — concrete, no jargon
- Errors: name what happened in human language, then what to do next

## Decisions Log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-04-26 | Initial design system created | /design-consultation, based on marketing site at www.colombiando.co + extracted brand tokens |
| 2026-04-26 | Black text on colored buttons (not white) | Matches marketing site, signature differentiator vs every other ed-tech tool |
| 2026-04-26 | Reduced 3D button depth from 8px → 6px (md size) | Marketing site uses 8px at desktop hero scale; 6px reads better at app-component scale. Keep 8px for `lg` CTAs (onboarding). |
| 2026-04-26 | Lucide icons, never emoji | Emojis render inconsistently and read childish; Lucide is consistent, controllable, MIT-licensed, tiny |
| 2026-04-26 | Speech bubble = AI moment only | Decorative restraint — used everywhere it loses meaning. One per screen max. |
| 2026-04-26 | Long-form reading stays 1-column at any width | Comfortable measure (65-75ch) beats stretched-edge text |
| 2026-04-26 | Dark mode deferred to v2 | Diana plans at night, would benefit, but foundation first. |
