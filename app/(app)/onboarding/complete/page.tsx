import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CelebrationContent } from "./celebration";

export default async function CompletePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teacher } = await supabase
    .from("teachers")
    .select("first_name")
    .eq("id", user.id)
    .single();

  const firstName = teacher?.first_name || "";

  return <CelebrationContent firstName={firstName} />;
}
