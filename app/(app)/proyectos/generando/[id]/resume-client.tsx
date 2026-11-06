"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GeneratingOverlay } from "@/components/ui/generating-overlay";
import { useGenerationPolling } from "@/lib/utils/use-generation-polling";

export function ResumeClient({ generationId }: { generationId: string }) {
  const router = useRouter();
  const result = useGenerationPolling(generationId);

  useEffect(() => {
    if (result.kind === "success") {
      router.replace(`/proyectos/${result.projectId}`);
    }
  }, [result, router]);

  if (result.kind === "error") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6 text-center">
        <div className="mb-6 max-w-sm rounded-2xl border-[1.5px] border-brand-red bg-[#ffe0e0] p-4 text-sm">
          <p className="mb-3 font-medium text-[var(--grade-3-text)]">{result.message}</p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Button variant="primary" className="w-full" onClick={() => router.replace("/proyectos/nuevo")}>
            Intentar de nuevo
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.replace("/dashboard")}>
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  return <GeneratingOverlay stageIdx={result.kind === "pending" ? result.stageIdx : 0} />;
}
