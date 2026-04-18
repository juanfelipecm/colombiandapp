/**
 * Admin-access helper. v1 uses a single comma-separated env var (ADMIN_TEACHER_IDS).
 * Admin routes MUST return 404 (not 403) for non-admins — we don't want to leak
 * the existence of an admin surface to anyone whose teacher_id happens to not be listed.
 */
import { notFound, redirect } from "next/navigation";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getAdminTeacherIds(): string[] {
  const raw = process.env.ADMIN_TEACHER_IDS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
}

export function isAdmin(teacherId: string | undefined): boolean {
  if (!teacherId) return false;
  return getAdminTeacherIds().includes(teacherId);
}

/**
 * Guard for admin-only server pages. Redirects to /login if unauthenticated,
 * calls notFound() otherwise. Returns the verified admin user_id on success.
 */
export async function requireAdmin(): Promise<string> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdmin(user.id)) notFound();
  return user.id;
}
