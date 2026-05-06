# Plan: Telegram Message Persistence in Supabase

## Goal

Move all Telegram message logging from the rolling Redis list (`tg:msgs`, capped at 5,000) to a permanent Supabase table. Save user voice notes and outgoing HTML files so the spy dashboard can play back audio and download files.

---

## 1. Database table: `telegram_messages`

**Status:** Waiting for DB team to create.

```sql
create table telegram_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  provider_user_id text,
  teacher_id uuid references teachers(id) on delete set null,
  direction text not null check (direction in ('in', 'out', 'system')),
  message_type text not null default 'text' check (message_type in ('text', 'voice')),
  text text not null,
  command text,
  ok boolean,
  error text,
  created_at timestamptz not null default now()
);

create index idx_telegram_messages_chat_id on telegram_messages (chat_id, created_at desc);
create index idx_telegram_messages_teacher_id on telegram_messages (teacher_id, created_at desc);
```

No RLS needed -- only accessed via the service-role admin client from server code.

---

## 2. Supabase Storage bucket: `telegram-media`

**Status:** Waiting for DB team to create.

```sql
insert into storage.buckets (id, name, public)
values ('telegram-media', 'telegram-media', false);
```

Private bucket (not public). Files are served through a signed URL or an API route that checks admin auth.

### What gets stored

| Scenario | Stored? | Path pattern | Content type |
|----------|---------|-------------|--------------|
| User sends voice note (incoming OGG) | Yes | `voice/{message_id}.ogg` | `audio/ogg` |
| Bot replies with voice note (outgoing OGG) | No | -- | -- |
| Bot sends HTML file (freeform long response) | Yes | `files/{message_id}.html` | `text/html` |
| Bot sends HTML file (project generation) | Yes | `files/{message_id}.html` | `text/html` |

We only save the **user's** voice notes, not the bot's TTS replies (per requirement). We do save outgoing HTML files since those are generated content worth keeping.

### Linking media to messages

Add a nullable column to `telegram_messages`:

```sql
alter table telegram_messages add column media_path text;
```

When a message has associated media, `media_path` stores the Storage path (e.g. `voice/12345.ogg`). The spy dashboard uses this to render a play button or download link.

---

## 3. Code changes

### 3a. `lib/telegram/store.ts` — `logTelegramMessage`

**Current:** Writes to Redis via `LPUSH` / `LTRIM`.
**New:** Also inserts into `telegram_messages` via `createAdminClient()`. Keep the Redis write as a non-blocking cache for the live auto-refresh spy view (it refreshes every 30s). The Supabase write is the durable record.

Add a `message_type` field and optional `media_path` to `TelegramMessageLog` in `types.ts`.

```ts
// In logTelegramMessage, after the existing Redis pipeline:
try {
  const admin = createAdminClient();
  await admin.from("telegram_messages").insert({
    chat_id: entry.chatId,
    provider_user_id: entry.providerUserId ?? null,
    teacher_id: entry.teacherId ?? null,
    direction: entry.direction,
    message_type: entry.messageType ?? "text",
    text: entry.text,
    command: entry.command ?? null,
    ok: entry.ok ?? null,
    error: entry.error ?? null,
    media_path: entry.mediaPath ?? null,
  });
} catch (err) {
  console.error("[telegram] supabase log failed", err);
}
```

### 3b. `lib/telegram/voice.ts` — Save incoming voice to Storage

In `handleVoiceMessage`, after downloading the Telegram voice file and before transcribing:

```ts
const storagePath = `voice/${message.message_id}.ogg`;
const admin = createAdminClient();
const audioBuffer = await readFile(inputPath);
await admin.storage.from("telegram-media").upload(storagePath, audioBuffer, {
  contentType: "audio/ogg",
  upsert: true,
});
```

Then pass `mediaPath: storagePath` and `messageType: "voice"` to the inbound log entry.

### 3c. `lib/telegram/handler.ts` — Save outgoing HTML files to Storage

In `sendAsHtmlFile`, after generating the HTML buffer:

```ts
const storagePath = `files/${Date.now()}.html`;
const admin = createAdminClient();
await admin.storage.from("telegram-media").upload(storagePath, Buffer.from(html, "utf-8"), {
  contentType: "text/html",
  upsert: true,
});
```

Pass `mediaPath: storagePath` to the outbound log entry.

Same pattern in the project generation HTML path (`renderProjectHtmlFile` result → `sendTelegramDocument`).

### 3d. `lib/telegram/types.ts` — Extend `TelegramMessageLog`

```ts
export type TelegramMessageLog = {
  ts: number;
  direction: TelegramLogDirection;
  chatId: string;
  providerUserId?: string;
  teacherId?: string;
  username?: string;
  firstName?: string;
  text: string;
  command?: string;
  updateId?: number;
  ok?: boolean;
  error?: string;
  messageType?: "text" | "voice";  // NEW
  mediaPath?: string;              // NEW
};
```

### 3e. Spy dashboard — Add playback and download

**Admin page** (`app/(app)/admin/telegram/page.tsx`):

For messages with `mediaPath`:
- **Voice:** Render an `<audio>` element with controls. Source is an API route that generates a signed URL.
- **Files:** Render a download link pointing to the same API route.

**Spy HTML route** (`app/api/spy/route.ts`):

Same treatment — inline `<audio>` player for voice messages, download link for files.

### 3f. New API route: `app/api/admin/telegram/media/route.ts`

Serves media from the private Storage bucket. Checks admin auth, then generates a signed URL and redirects:

```ts
export async function GET(request: NextRequest) {
  await requireAdmin();
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("telegram-media")
    .createSignedUrl(path, 300); // 5 min expiry

  if (!data?.signedUrl) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
```

For the HTML spy route (`/api/spy`), use the `SPY_DASHBOARD_SECRET` query param instead of admin auth.

---

## 4. Migration file

Once the DB team confirms, create `supabase/migrations/008_telegram_messages.sql` with the full DDL (table + indexes + storage bucket + media_path column).

---

## 5. What NOT to change

- **Redis logging stays.** It's the fast path for the live 30-second auto-refresh. Supabase is the durable archive.
- **No new npm dependencies.** Everything uses the existing `@supabase/supabase-js` admin client.
- **No changes to the webhook route or message handler flow** beyond passing the new log fields.
- **Bot's outgoing voice notes are NOT saved** — only the user's incoming voice and the bot's HTML files.

---

## 6. Ordering

1. DB team creates the table, storage bucket, and `media_path` column
2. Extend `TelegramMessageLog` type with `messageType` and `mediaPath`
3. Update `logTelegramMessage` to write to Supabase
4. Update `voice.ts` to upload incoming voice and pass media fields
5. Update `handler.ts` to upload HTML files and pass media fields
6. Create the `/api/admin/telegram/media` route
7. Update both spy dashboards to show audio players and download links
