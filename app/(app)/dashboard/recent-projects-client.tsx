"use client";

import { useEffect, useMemo, useState } from "react";
import { ProjectCard, type ProjectCardData } from "@/components/ui/project-card";
import { SegmentedTabs, SegmentedTabButton } from "@/components/ui/segmented-tabs";

const LAST_SEEN_KEY = "colombiando-dashboard-last-seen-v1";
// Keep the NUEVO badge visible for a beat before bumping the timestamp, so
// the teacher actually notices it on the visit where it first appears.
const ACK_DELAY_MS = 2_000;

const PER_TAB_LIMIT = 3;

type TabKey = "activos" | "por-empezar";

const TAB_LABEL: Record<TabKey, string> = {
  activos: "Activos",
  "por-empezar": "Por empezar",
};

const TAB_ORDER: TabKey[] = ["activos", "por-empezar"];

const TAB_EMPTY_COPY: Record<TabKey, string> = {
  activos: "Aún no tienes proyectos en enseñanza.",
  "por-empezar": "Aún no tienes proyectos por empezar.",
};

export function RecentProjectsClient({ projects }: { projects: ProjectCardData[] }) {
  const [activeTab, setActiveTab] = useState<TabKey>("activos");

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

  const { byTab, counts } = useMemo(() => {
    const activos: ProjectCardData[] = [];
    const porEmpezar: ProjectCardData[] = [];
    for (const p of projects) {
      if (p.status === "en_ensenanza") activos.push(p);
      else if (p.status === "generado") porEmpezar.push(p);
    }
    return {
      byTab: {
        activos: activos.slice(0, PER_TAB_LIMIT),
        "por-empezar": porEmpezar.slice(0, PER_TAB_LIMIT),
      } satisfies Record<TabKey, ProjectCardData[]>,
      counts: {
        activos: activos.length,
        "por-empezar": porEmpezar.length,
      } satisfies Record<TabKey, number>,
    };
  }, [projects]);

  const visible = byTab[activeTab];

  return (
    <div>
      <div className="mb-3">
        <SegmentedTabs>
          {TAB_ORDER.map((key) => (
            <SegmentedTabButton
              key={key}
              active={key === activeTab}
              label={TAB_LABEL[key]}
              count={counts[key]}
              onClick={() => setActiveTab(key)}
            />
          ))}
        </SegmentedTabs>
      </div>

      {visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((p) => (
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
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-input-bg p-5 text-center">
          <p className="text-sm text-text-secondary">{TAB_EMPTY_COPY[activeTab]}</p>
        </div>
      )}
    </div>
  );
}
