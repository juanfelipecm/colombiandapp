# Colombiando

A Next.js 16 + React 19 web application that helps rural multigrade schoolteachers in Colombia plan project-based learning (PBL) curricula. Teachers interact through a mobile-first web interface or a Telegram bot that supports voice notes, attendance tracking, and AI-powered project generation -- all in Spanish.

## Architecture

```
Telegram Bot API
       |
       v
  /api/telegram/webhook  (POST, secret-token validated)
       |
       v
  handler.ts  ── voice.ts ── OpenAI STT/TTS
       |              |
       v              v
  store.ts        Anthropic Claude
  (Upstash Redis)     |
       |              v
       v         Supabase (PostgreSQL)
  Session state   Teachers, schools, students,
  Message log     projects, attendance, generation logs
```

### Core components

| Component | Path | What it does |
|-----------|------|--------------|
| Webhook entry | `app/api/telegram/webhook/route.ts` | Validates Telegram secret, dispatches to handler, runs background jobs via `after()` |
| Message handler | `lib/telegram/handler.ts` | Routes commands, voice, free-form text; manages onboarding, attendance, and project generation flows |
| Voice pipeline | `lib/telegram/voice.ts` | Downloads OGG from Telegram, transcribes, asks Claude, generates TTS reply, converts to OGG via ffmpeg |
| Session store | `lib/telegram/store.ts` | Redis-backed session state, identity mapping, circular message log |
| Project generation | `lib/ai/generate-project.ts` | Two-attempt Claude call with Zod-validated tool_use, semantic validation, DBA curriculum alignment |
| Generation runner | `lib/api/project-generation-runner.ts` | Orchestrates generation, budget gating, and logging |
| Spy dashboard | `app/api/spy/route.ts` | Server-rendered HTML dashboard for live Telegram message monitoring (30s auto-refresh) |
| Web app | `app/(app)/` | Dashboard, project CRUD/wizard, student management, attendance, profile, onboarding |

## AI models and API keys

The app uses two AI providers. Each requires its own API key:

### Anthropic (`ANTHROPIC_API_KEY`)

- **Model:** `claude-sonnet-4-6`
- **Used for:**
  - Generating PBL project plans (structured tool_use with `emit_plan`)
  - Responding to free-form Telegram text messages
  - Responding to voice note transcriptions

### OpenAI (`OPENAI_API_KEY`)

- **Model:** `gpt-4o-mini-transcribe` -- speech-to-text
  - Transcribes incoming voice notes (Spanish, OGG format)
- **Model:** `gpt-4o-mini-tts` -- text-to-speech
  - Generates voice replies (voice: "coral", Spanish latino)
  - Output is MP3, converted to OGG via ffmpeg for Telegram

## Data stores

### Supabase (PostgreSQL) -- source of truth

Teachers, schools, students, projects, attendance records, and generation logs all live in Supabase. Auth uses Supabase Auth with RLS. Server-side admin operations use the service-role key.

### Upstash Redis -- ephemeral session layer

Redis is used as a fast, ephemeral store for Telegram bot state. It is **not** the source of truth for anything -- all durable data lives in Supabase.

| Key pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `tg:session:{chatId}` | JSON string | 14 days | Multi-step flow state (onboarding, project wizard, attendance) |
| `tg:identities` | Hash | None | Telegram user ID to teacher account mapping |
| `tg:teacher_chats` | Hash | None | Reverse mapping: teacher ID to Telegram identity |
| `tg:msgs` | List | None | Circular message log, capped at 5,000 entries |
| `tg:link:{code}` | String | 10 min | One-time codes for linking a web account to Telegram |
| `tg:user_counts` / `tg:teacher_counts` | Sorted set | None | Per-user message counts |

**Current limitations:**

- The message log is a circular buffer capped at 5,000 entries. Older messages are silently dropped.
- Sessions expire after 14 days of inactivity; in-progress flows reset.
- No voice notes or media files are persisted -- they are downloaded, processed, and discarded.
- Redis is cache-only with no durability guarantees.

## Planned: Telegram message persistence

There is a detailed plan (`PLAN-telegram-persistence.md`) to move Telegram message logging from the Redis circular buffer to a persistent Supabase table (`telegram_messages`) with full-text search and media archival:

- **Database table** stores every message with direction, type, teacher link, and timestamps
- **Supabase Storage bucket** (`telegram-media`) archives incoming voice notes (`voice/{id}.ogg`) and outgoing HTML files (`files/{id}.html`)
- **Redis logging stays** as the fast path for the live spy dashboard; Supabase becomes the durable archive
- **Admin dashboard** gets audio playback and file download via signed URLs

Status: waiting on DB table and storage bucket creation.

## Telegram bot flows

### Voice notes
User sends voice -> download OGG -> transcribe (OpenAI) -> respond (Claude) -> generate speech (OpenAI TTS) -> convert MP3 to OGG (ffmpeg) -> send voice reply + text

### Commands
- `/start [code]` -- link to existing account or begin onboarding
- `/proyecto` -- 3-step project generation wizard (subjects, duration, theme)
- `/asistencia` -- mark attendance via natural language ("todos presentes" or "ausentes: Maria, Pedro")
- `/reset` -- delete account and all data
- `/help` -- show introduction

### Free-form text
Unrecognized messages are sent to Claude with a pedagogical system prompt. Long responses (containing `\n---\n`) are split and sent as an HTML file attachment.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API (Sonnet for generation + chat) |
| `OPENAI_API_KEY` | Yes | Voice transcription (STT) and speech generation (TTS) |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API authentication |
| `TELEGRAM_BOT_USERNAME` | Yes | Bot username without @ |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Yes | Public-facing bot username |
| `TELEGRAM_WEBHOOK_SECRET` | No | Webhook request validation |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase admin key (server-only) |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis bearer token |
| `ADMIN_TEACHER_IDS` | Yes | Comma-separated UUIDs for admin access |
| `SPY_DASHBOARD_SECRET` | Yes | Secret for `/api/spy` monitoring dashboard |

## Development

```bash
npm install
npm run dev          # Local dev server (port 3000)
npm run build        # Production build
npm run test         # Vitest
npm run test:e2e     # Playwright
```

**System dependency:** `ffmpeg` must be installed for voice note processing (MP3 to OGG conversion).

## Deployment

The app runs on a DigitalOcean droplet behind Caddy (HTTPS). See `TELEGRAM_DEPLOYMENT.md` for full details.

```bash
npm run deploy:droplet   # SSH deploy: pull, build, restart systemd service
```

- **Host:** `root@134.122.12.116`
- **Service:** `colombiandapp.service` (systemd, port 3001)
- **HTTPS:** Caddy reverse proxy with auto-TLS via nip.io
