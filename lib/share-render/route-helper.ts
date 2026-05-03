import "server-only";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { loadShareData } from "./load-project";
import { renderShare } from "./render";
import { slugify } from "./slug";
import { getBrowser } from "./browser";
import { makeEtag } from "./etag";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Format = "image" | "pdf";

function jsonError(error: string, status: number, message?: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

export async function handleShareRequest(
  request: Request,
  projectId: string,
  format: Format,
): Promise<Response> {
  if (!UUID_RE.test(projectId)) return jsonError("invalid_id", 400);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("unauthorized", 401);

  // Prewarm: cheap path. Auth-check + boot the chromium singleton so the next
  // real call lands warm. No render, no DB load.
  const url = new URL(request.url);
  if (url.searchParams.get("prewarm") === "1") {
    getBrowser().catch(() => {});
    return new NextResponse(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const result = await loadShareData(projectId);
  if (!result.ok) {
    if (result.error === "not_found") return jsonError("not_found", 404);
    if (result.error === "no_phases")
      return jsonError("no_phases", 422, "Proyecto sin plan generado");
    return jsonError("load_failed", 500);
  }
  if (result.teacherId !== user.id) return jsonError("forbidden", 403);

  const etag = makeEtag(result.data.project.updated_at, format);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      },
    });
  }

  let rendered;
  try {
    rendered = await renderShare(result.data, format);
  } catch (err) {
    console.error("[share-render] render failed:", err);
    return jsonError("render_failed", 500);
  }

  const filename = `${slugify(rendered.filenameSlug)}.${format === "image" ? "png" : "pdf"}`;
  return new NextResponse(rendered.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Length": String(rendered.buffer.length),
      ETag: etag,
      "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
