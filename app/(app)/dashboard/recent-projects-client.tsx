"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectCard, type ProjectCardData } from "@/components/ui/project-card";

const LAST_SEEN_KEY = "colombiando-dashboard-last-seen-v1";
// Keep the NUEVO badge visible for a beat before bumping the timestamp, so
// the teacher actually notices it on the visit where it first appears.
const ACK_DELAY_MS = 2_000;

export function RecentProjectsClient({ projects }: { projects: ProjectCardData[] }) {
  // Snapshot lastSeen exactly once on mount so the set of "new" projects is
  // stable for this render cycle. Subsequent writes to localStorage must not
  // retroactively strip the badge.
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_SEEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage read on mount
      setLastSeen(raw);
    } catch {
      setLastSeen(null);
    }
    setHydrated(true);
  }, []);

  const newIds = useMemo(() => {
    if (!hydrated || !lastSeen) return new Set<string>();
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isNaN(lastSeenMs)) return new Set<string>();
    return new Set(projects.filter((p) => new Date(p.created_at).getTime() > lastSeenMs).map((p) => p.id));
  }, [projects, lastSeen, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      } catch {
        // ignore quota errors
      }
    }, ACK_DELAY_MS);
    return () => clearTimeout(t);
  }, [hydrated]);

  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <div key={p.id} className="relative">
          <ProjectCard project={p} />
          {newIds.has(p.id) ? (
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-primary">
              Nuevo
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
