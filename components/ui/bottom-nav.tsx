"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type LucideIcon,
  ClipboardCheck,
  FolderOpen,
  Home,
  User,
  Users,
} from "lucide-react";

const tabs: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/proyectos", label: "Proyectos", icon: FolderOpen },
  { href: "/asistencia", label: "Asistencia", icon: ClipboardCheck },
  { href: "/estudiantes", label: "Estudiantes", icon: Users },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white no-print"
    >
      <div className="mx-auto flex max-w-[480px]">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 min-h-[48px] min-w-[48px] ${
                isActive ? "text-brand-blue" : "text-text-placeholder"
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} aria-hidden />
              <span className="text-[10px]">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
