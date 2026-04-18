import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Auth
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use admin client to read the log row (bypasses RLS to enforce consistent
  // teacher ownership check in code — if the row's teacher_id doesn't match
  // the session user, return 404, never 403, so the endpoint doesn't leak
  // whether a given UUID exists for other teachers).
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("project_generation_logs")
    .select("id, status, project_id, teacher_id, error_message")
    .eq("id", id)
    .maybeSingle();

  if (!row || row.teacher_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    generation_id: row.id,
    status: row.status,
    project_id: row.project_id,
    error: row.status !== "success" && row.status !== "pending" ? row.error_message : null,
  });
}
