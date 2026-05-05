import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLinkCode } from "@/lib/telegram/store";
import { configuredBotUsername } from "@/lib/telegram/client";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const code = await createLinkCode(user.id);
  const bot = configuredBotUsername();
  return NextResponse.json({
    code,
    expires_in_seconds: 600,
    deep_link: bot ? `https://t.me/${bot}?start=${encodeURIComponent(code)}` : null,
    command: `/start ${code}`,
  });
}
