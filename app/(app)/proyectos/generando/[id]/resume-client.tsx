"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => router.replace("/proyectos/nuevo")}
            className="rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white"
          >
            Intentar de nuevo
          </button>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="text-sm font-medium text-text-secondary"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return <GeneratingOverlay stageIdx={result.kind === "pending" ? result.stageIdx : 0} />;
}
