import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/api/admin";
import { appBaseUrl } from "@/lib/telegram/app-actions";
import { setTelegramWebhook } from "@/lib/telegram/client";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user.id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "missing_secret", message: "TELEGRAM_WEBHOOK_SECRET is required" }, { status: 500 });
  }

  const url = `${appBaseUrl()}/api/telegram/webhook`;
  const result = await setTelegramWebhook(url, secret);
  return NextResponse.json({ ok: true, url, result });
}
