import { after, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram/handler";
import type { TelegramUpdate } from "@/lib/telegram/types";
import { logTelegramMessage } from "@/lib/telegram/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await handleTelegramUpdate(update);
    if (result.background) {
      after(async () => {
        try {
          await result.background?.();
        } catch (err) {
          await logTelegramMessage({
            ts: Date.now(),
            direction: "system",
            chatId: String(update.message?.chat.id ?? update.edited_message?.chat.id ?? ""),
            text: "background job failed",
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            updateId: update.update_id,
          });
        }
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logTelegramMessage({
      ts: Date.now(),
      direction: "system",
      chatId: String(update.message?.chat.id ?? update.edited_message?.chat.id ?? ""),
      text: "webhook handler failed",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      updateId: update.update_id,
    });
    return NextResponse.json({ ok: true });
  }
}
