import "server-only";
import { randomUUID } from "node:crypto";
import { redisCommand, redisPipeline, type RedisCommand } from "@/lib/upstash/redis";
import type { TelegramIdentity, TelegramMessageLog, TelegramSession } from "./types";

export const TG_KEYS = {
  msgs: "tg:msgs",
  userCounts: "tg:user_counts",
  teacherCounts: "tg:teacher_counts",
  identities: "tg:identities",
  teacherChats: "tg:teacher_chats",
  session: (chatId: string) => `tg:session:${chatId}`,
  link: (code: string) => `tg:link:${code}`,
  docs: (teacherId: string) => `tg:docs:${teacherId}`,
};

type StoredDocument = {
  id: string;
  title: string;
  htmlContent: string;
  source: "freeform" | "project";
  projectId?: string;
  createdAt: number;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const LINK_TTL_SECONDS = 60 * 10;
const DOCS_TTL_SECONDS = 60 * 60 * 24 * 365;
const DOCS_MAX = 20;
const MESSAGE_LOG_MAX = 5000;

export async function logTelegramMessage(entry: TelegramMessageLog): Promise<void> {
  const serialized = JSON.stringify(entry);
  const commands: RedisCommand[] = [
    ["LPUSH", TG_KEYS.msgs, serialized],
    ["LTRIM", TG_KEYS.msgs, 0, MESSAGE_LOG_MAX - 1],
  ];

  if (entry.providerUserId) {
    commands.push(["ZINCRBY", TG_KEYS.userCounts, 1, entry.providerUserId]);
  }
  if (entry.teacherId) {
    commands.push(["ZINCRBY", TG_KEYS.teacherCounts, 1, entry.teacherId]);
  }

  try {
    await redisPipeline(commands);
  } catch (err) {
    console.error("[telegram] log failed", err);
  }
}

export async function getIdentity(providerUserId: string): Promise<TelegramIdentity | null> {
  const raw = await redisCommand<string>(["HGET", TG_KEYS.identities, providerUserId]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramIdentity;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: TelegramIdentity): Promise<void> {
  const serialized = JSON.stringify(identity);
  await redisPipeline([
    ["HSET", TG_KEYS.identities, identity.providerUserId, serialized],
    ["HSET", TG_KEYS.teacherChats, identity.teacherId, serialized],
  ]);
}

export async function createLinkCode(teacherId: string): Promise<string> {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await redisPipeline([
    [
      "SET",
      TG_KEYS.link(code),
      JSON.stringify({ teacherId, createdAt: Date.now() }),
      "EX",
      LINK_TTL_SECONDS,
    ],
  ]);
  return code;
}

export async function consumeLinkCode(code: string): Promise<{ teacherId: string } | null> {
  const normalized = code.trim().toUpperCase();
  const key = TG_KEYS.link(normalized);
  const raw = await redisCommand<string>(["GET", key]);
  if (!raw) return null;
  await redisPipeline([["DEL", key]]);
  try {
    const parsed = JSON.parse(raw) as { teacherId?: string };
    return parsed.teacherId ? { teacherId: parsed.teacherId } : null;
  } catch {
    return null;
  }
}

export async function getSession(chatId: string): Promise<TelegramSession | null> {
  const raw = await redisCommand<string>(["GET", TG_KEYS.session(chatId)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramSession;
  } catch {
    return null;
  }
}

export async function saveSession(chatId: string, session: TelegramSession): Promise<void> {
  await redisPipeline([
    ["SET", TG_KEYS.session(chatId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS],
  ]);
}

export async function clearSession(chatId: string): Promise<void> {
  await redisPipeline([["DEL", TG_KEYS.session(chatId)]]);
}

export async function clearTelegramMessageLogs(target: {
  chatId: string;
  providerUserId?: string;
  teacherId?: string;
}): Promise<void> {
  try {
    const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.msgs, 0, MESSAGE_LOG_MAX - 1]);
    const kept = (raw ?? []).filter((item) => {
      try {
        const message = JSON.parse(item) as TelegramMessageLog;
        return !matchesTelegramLogTarget(message, target);
      } catch {
        return true;
      }
    });

    const commands: RedisCommand[] = [["DEL", TG_KEYS.msgs]];
    if (kept.length > 0) {
      commands.push(["RPUSH", TG_KEYS.msgs, ...kept]);
    }
    if (target.providerUserId) {
      commands.push(["ZREM", TG_KEYS.userCounts, target.providerUserId]);
    }
    if (target.teacherId) {
      commands.push(["ZREM", TG_KEYS.teacherCounts, target.teacherId]);
    }

    await redisPipeline(commands);
  } catch (err) {
    console.error("[telegram] clear logs failed", err);
  }
}

export async function deleteIdentity(identity: TelegramIdentity): Promise<void> {
  await redisPipeline([
    ["HDEL", TG_KEYS.identities, identity.providerUserId],
    ["HDEL", TG_KEYS.teacherChats, identity.teacherId],
    ["DEL", TG_KEYS.session(identity.chatId)],
  ]);
}

export async function getTeacherTelegramIdentity(teacherId: string): Promise<TelegramIdentity | null> {
  const raw = await redisCommand<string>(["HGET", TG_KEYS.teacherChats, teacherId]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramIdentity;
  } catch {
    return null;
  }
}

export async function recentMessageLogs(limit = 200): Promise<TelegramMessageLog[]> {
  const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.msgs, 0, Math.max(0, limit - 1)]);
  return (raw ?? [])
    .map((item) => {
      try {
        return JSON.parse(item) as TelegramMessageLog;
      } catch {
        return null;
      }
    })
    .filter((item): item is TelegramMessageLog => item !== null);
}

function matchesTelegramLogTarget(
  message: TelegramMessageLog,
  target: { chatId: string; providerUserId?: string; teacherId?: string },
): boolean {
  return (
    message.chatId === target.chatId ||
    (Boolean(target.providerUserId) && message.providerUserId === target.providerUserId) ||
    (Boolean(target.teacherId) && message.teacherId === target.teacherId)
  );
}

export async function recentChatHistory(
  chatId: string,
  limit = 10,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const scanLimit = Math.min(MESSAGE_LOG_MAX, 200);
  const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.msgs, 0, scanLimit - 1]);
  if (!raw) return [];

  const chatMessages: TelegramMessageLog[] = [];
  for (const item of raw) {
    try {
      const msg = JSON.parse(item) as TelegramMessageLog;
      if (msg.chatId === chatId && msg.text) chatMessages.push(msg);
    } catch {
      continue;
    }
    if (chatMessages.length >= limit) break;
  }

  chatMessages.reverse();

  const mapped = chatMessages.map((msg) => ({
    role: msg.direction === "in" || msg.direction === "system" ? ("user" as const) : ("assistant" as const),
    content: msg.text,
  }));

  // Anthropic API requires alternating user/assistant turns — merge consecutive same-role messages
  const merged: typeof mapped = [];
  for (const msg of mapped) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += `\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }

  // Must start with a user message
  while (merged.length > 0 && merged[0].role !== "user") {
    merged.shift();
  }

  return merged;
}

export async function saveTelegramDocument(
  teacherId: string,
  title: string,
  htmlContent: string,
  source: "freeform" | "project" = "freeform",
  projectId?: string,
): Promise<string | null> {
  try {
    const doc: StoredDocument = {
      id: randomUUID(),
      title,
      htmlContent,
      source,
      projectId,
      createdAt: Date.now(),
    };
    const key = TG_KEYS.docs(teacherId);
    await redisPipeline([
      ["LPUSH", key, JSON.stringify(doc)],
      ["LTRIM", key, 0, DOCS_MAX - 1],
      ["EXPIRE", key, DOCS_TTL_SECONDS],
    ]);
    return doc.id;
  } catch (err) {
    console.error("[telegram] save document failed", err);
    return null;
  }
}

export async function recentTeacherDocuments(
  teacherId: string,
  limit = 5,
): Promise<Array<{ id: string; title: string; source: string; createdAt: number }>> {
  try {
    const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.docs(teacherId), 0, limit - 1]);
    return (raw ?? [])
      .map((item) => {
        try {
          const doc = JSON.parse(item) as StoredDocument;
          return { id: doc.id, title: doc.title, source: doc.source, createdAt: doc.createdAt };
        } catch {
          return null;
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  } catch {
    return [];
  }
}

export async function getTelegramDocument(
  teacherId: string,
  docId: string,
): Promise<StoredDocument | null> {
  try {
    const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.docs(teacherId), 0, DOCS_MAX - 1]);
    for (const item of raw ?? []) {
      try {
        const doc = JSON.parse(item) as StoredDocument;
        if (doc.id === docId) return doc;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLatestTelegramDocument(
  teacherId: string,
): Promise<StoredDocument | null> {
  try {
    const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.docs(teacherId), 0, 0]);
    if (!raw?.[0]) return null;
    return JSON.parse(raw[0]) as StoredDocument;
  } catch {
    return null;
  }
}

export async function updateTelegramDocument(
  teacherId: string,
  docId: string,
  updatedHtml: string,
  updatedTitle?: string,
): Promise<boolean> {
  try {
    const raw = await redisCommand<string[]>(["LRANGE", TG_KEYS.docs(teacherId), 0, DOCS_MAX - 1]);
    if (!raw) return false;

    const updated = raw.map((item) => {
      try {
        const doc = JSON.parse(item) as StoredDocument;
        if (doc.id === docId) {
          return JSON.stringify({ ...doc, htmlContent: updatedHtml, title: updatedTitle ?? doc.title });
        }
        return item;
      } catch {
        return item;
      }
    });

    const key = TG_KEYS.docs(teacherId);
    await redisPipeline([
      ["DEL", key],
      ["RPUSH", key, ...updated],
      ["EXPIRE", key, DOCS_TTL_SECONDS],
    ]);
    return true;
  } catch {
    return false;
  }
}
