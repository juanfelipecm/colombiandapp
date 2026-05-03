import { handleShareRequest } from "@/lib/share-render/route-helper";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return handleShareRequest(request, id, "image");
}

export async function HEAD(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  return handleShareRequest(request, id, "image");
}
