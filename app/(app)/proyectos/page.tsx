import { BottomNav } from "@/components/ui/bottom-nav";

export default function ProyectosPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-input-bg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-bold text-text-primary">Proyectos</h2>
      <p className="text-sm text-text-secondary">Proximamente</p>
      <BottomNav />
    </div>
  );
}
