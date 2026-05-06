import { recentMessageLogs } from "@/lib/telegram/store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const secret = process.env.SPY_DASHBOARD_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key !== secret) return new Response("Not found", { status: 404 });

  const limit = Math.min(1000, Math.max(50, parseInt(url.searchParams.get("n") ?? "250", 10) || 250));
  const teacherFilter = url.searchParams.get("teacher");
  const validTeacher = teacherFilter && UUID_RE.test(teacherFilter) ? teacherFilter : null;
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const rawMessages = await recentMessageLogs(limit);
  const messages = rawMessages.filter((m) => {
    if (validTeacher && m.teacherId !== validTeacher) return false;
    if (query && !`${m.text} ${m.username ?? ""} ${m.firstName ?? ""} ${m.chatId}`.toLowerCase().includes(query))
      return false;
    return true;
  });

  const teacherIds = [...new Set(rawMessages.map((m) => m.teacherId).filter((id): id is string => Boolean(id)))];
  const admin = createAdminClient();
  const { data: teachers } = teacherIds.length
    ? await admin.from("teachers").select("id, first_name, last_name").in("id", teacherIds)
    : { data: [] };
  const teacherById = new Map((teachers ?? []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
  const teacherOptions = [...teacherById.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));

  const grouped = groupByChat(messages);

  const chatCount = grouped.length;
  const msgCount = messages.length;

  const baseUrl = `${url.pathname}?key=${encodeURIComponent(secret)}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>ColombiAndo - Telegram Monitor</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Montserrat', sans-serif;
      font-weight: 400;
      font-size: 16px;
      line-height: 24px;
      color: #000;
      background: #FFF;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 32px 16px;
    }
    h1 {
      font-size: 24px;
      line-height: 32px;
      font-weight: 700;
      color: #0060BB;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 14px;
      line-height: 20px;
      color: #666;
      margin-bottom: 24px;
    }
    .filter-card {
      border: 1.5px solid #EEE;
      border-radius: 16px;
      background: #FFF;
      padding: 16px;
      margin-bottom: 24px;
    }
    .filter-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    .filter-field {
      flex: 1;
      min-width: 120px;
    }
    .filter-field.search { flex: 2; min-width: 200px; }
    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
      margin-bottom: 4px;
    }
    input, select {
      width: 100%;
      font-family: 'Montserrat', sans-serif;
      font-size: 14px;
      padding: 10px 12px;
      border: 1px solid #EEE;
      border-radius: 8px;
      background: #FAFAFA;
      color: #000;
      outline: none;
    }
    input:focus, select:focus {
      border-color: #0060BB;
      background: #FFF;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: 'Montserrat', sans-serif;
      font-size: 14px;
      font-weight: 700;
      padding: 10px 20px;
      border-radius: 9999px;
      border: none;
      border-bottom: 4px solid #000;
      background: #0060BB;
      color: #000;
      cursor: pointer;
      transition: transform 150ms ease-out, border-bottom-width 150ms ease-out, padding-bottom 150ms ease-out;
    }
    .btn:hover {
      transform: translateY(2px);
      border-bottom-width: 2px;
      padding-bottom: 12px;
    }
    .chat-card {
      border: 1.5px solid #EEE;
      border-radius: 16px;
      background: #FFF;
      padding: 16px;
      margin-bottom: 16px;
    }
    .chat-header {
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #EEE;
    }
    .chat-title {
      font-size: 16px;
      font-weight: 600;
      color: #000;
    }
    .chat-meta {
      font-size: 14px;
      color: #666;
      margin-top: 2px;
    }
    .msg {
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .msg:last-child { margin-bottom: 0; }
    .msg-in { background: #FAFAFA; }
    .msg-out { background: rgba(0, 96, 187, 0.1); }
    .msg-system { background: rgba(208, 0, 0, 0.05); }
    .msg-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .msg-dir {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #666;
    }
    .msg-time {
      font-size: 14px;
      color: #666;
    }
    .msg-text {
      font-size: 14px;
      line-height: 20px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-error {
      font-size: 13px;
      color: #D00000;
      margin-top: 6px;
    }
    .empty {
      text-align: center;
      padding: 32px 16px;
      color: #666;
      font-size: 14px;
      border: 1.5px dashed #EEE;
      border-radius: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>ColombiAndo &middot; Telegram Monitor</h1>
    <p class="subtitle">${msgCount} messages from ${chatCount} chats</p>

    <form method="GET" class="filter-card">
      <input type="hidden" name="key" value="${escapeHtml(secret)}">
      <div class="filter-row">
        <div class="filter-field search">
          <label for="q">Search</label>
          <input id="q" name="q" value="${escapeHtml(query)}" placeholder="message, username, chat id">
        </div>
        <div class="filter-field">
          <label for="teacher">Teacher</label>
          <select id="teacher" name="teacher">
            <option value="">Any teacher</option>
            ${teacherOptions
              .map(
                ([id, name]) =>
                  `<option value="${escapeHtml(id)}"${id === validTeacher ? " selected" : ""}>${escapeHtml(name)}</option>`,
              )
              .join("\n            ")}
          </select>
        </div>
        <div class="filter-field" style="max-width:100px">
          <label for="n">Limit</label>
          <input id="n" type="number" name="n" min="50" max="1000" value="${limit}">
        </div>
        <div class="filter-field" style="flex:0">
          <label>&nbsp;</label>
          <button type="submit" class="btn">Go</button>
        </div>
      </div>
    </form>

    ${
      grouped.length === 0
        ? `<div class="empty">No Telegram messages yet.</div>`
        : grouped
            .map(
              (group) => `
    <section class="chat-card">
      <div class="chat-header">
        <div class="chat-title">${group.teacherId ? escapeHtml(teacherById.get(group.teacherId) ?? group.teacherId) : "Unlinked chat"}</div>
        <div class="chat-meta">chat ${escapeHtml(group.chatId)}${group.username ? ` &middot; @${escapeHtml(group.username)}` : ""} &middot; ${group.entries.length} messages</div>
      </div>
      ${group.entries
        .map((m) => {
          const dirClass = m.direction === "in" ? "msg-in" : m.direction === "out" ? "msg-out" : "msg-system";
          const dirLabel = m.direction === "in" ? "IN" : m.direction === "out" ? "OUT" : "SYS";
          const ts = new Date(m.ts).toLocaleString("es-CO", {
            timeZone: "America/Bogota",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "2-digit",
            hour12: false,
          });
          const text = m.text.length > 300 ? m.text.slice(0, 300) + "..." : m.text;
          return `<div class="msg ${dirClass}">
        <div class="msg-head">
          <span class="msg-dir">${dirLabel}</span>
          <span class="msg-time">${ts}</span>
        </div>
        <p class="msg-text">${escapeHtml(text)}</p>${m.error ? `\n        <p class="msg-error">${escapeHtml(m.error)}</p>` : ""}
      </div>`;
        })
        .join("\n      ")}
    </section>`,
            )
            .join("")
    }
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type MessageLog = Awaited<ReturnType<typeof recentMessageLogs>>[number];

function groupByChat(messages: MessageLog[]) {
  const map = new Map<
    string,
    {
      chatId: string;
      teacherId?: string;
      username?: string;
      entries: MessageLog[];
    }
  >();

  for (const message of messages) {
    const group = map.get(message.chatId) ?? {
      chatId: message.chatId,
      teacherId: message.teacherId,
      username: message.username,
      entries: [],
    };
    if (!group.teacherId && message.teacherId) group.teacherId = message.teacherId;
    if (!group.username && message.username) group.username = message.username;
    group.entries.push(message);
    map.set(message.chatId, group);
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      entries: g.entries.slice().sort((a, b) => b.ts - a.ts),
    }))
    .sort((a, b) => {
      const aLatest = a.entries[0]?.ts ?? 0;
      const bLatest = b.entries[0]?.ts ?? 0;
      return bLatest - aLatest;
    });
}
