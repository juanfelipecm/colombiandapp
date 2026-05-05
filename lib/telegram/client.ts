import "server-only";
import { logTelegramMessage } from "./store";

type SendMessageOptions = {
  chatId: string;
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  teacherId?: string;
  providerUserId?: string;
};

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return token;
}

export function configuredBotUsername(): string | null {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? process.env.TELEGRAM_BOT_USERNAME ?? null;
}

export async function telegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = (await resp.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.description ?? `Telegram ${method} failed with ${resp.status}`);
  }
  return data.result as T;
}

export async function sendTelegramMessage(options: SendMessageOptions): Promise<void> {
  try {
    await telegramApi("sendMessage", {
      chat_id: options.chatId,
      text: options.text,
      ...(options.parseMode ? { parse_mode: options.parseMode } : {}),
      disable_web_page_preview: true,
    });
    await logTelegramMessage({
      ts: Date.now(),
      direction: "out",
      chatId: options.chatId,
      teacherId: options.teacherId,
      providerUserId: options.providerUserId,
      text: options.text,
      ok: true,
    });
  } catch (err) {
    await logTelegramMessage({
      ts: Date.now(),
      direction: "out",
      chatId: options.chatId,
      teacherId: options.teacherId,
      providerUserId: options.providerUserId,
      text: options.text,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function setTelegramWebhook(webhookUrl: string, secretToken: string): Promise<unknown> {
  return telegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  });
}
