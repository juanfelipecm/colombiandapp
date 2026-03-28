import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/bottom-nav";
import { PerfilActions } from "./actions-client";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teacher } = await supabase
    .from("teachers")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const { data: school } = await supabase.from("schools").select("name, department, municipality").single();

  return (
    <div className="py-6">
      <h1 className="mb-6 text-2xl font-bold">Perfil</h1>

      <div className="mb-6 rounded-2xl border-[1.5px] border-border p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue text-lg font-bold text-white">
            {teacher?.first_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-base font-semibold">{teacher?.first_name} {teacher?.last_name}</p>
            <p className="text-sm text-text-secondary">{user.email}</p>
          </div>
        </div>

        {school && (
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">{school.name}</p>
            <p className="text-xs text-text-secondary">{school.municipality}, {school.department}</p>
          </div>
        )}
      </div>

      <PerfilActions />

      <BottomNav />
    </div>
  );
}
