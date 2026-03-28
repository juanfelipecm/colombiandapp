import { BottomNav } from "@/components/ui/bottom-nav";

export default function EstudiantesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-input-bg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-bold text-text-primary">Estudiantes</h2>
      <p className="text-sm text-text-secondary">Proximamente</p>
      <BottomNav />
    </div>
  );
}
