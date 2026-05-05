import "server-only";
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
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const LINK_TTL_SECONDS = 60 * 10;
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
