import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FlagBar } from "@/components/ui/flag-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <FlagBar />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-[480px] flex-1 px-4 pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
