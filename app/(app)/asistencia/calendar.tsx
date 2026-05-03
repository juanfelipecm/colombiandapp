"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayBucket } from "@/lib/asistencia/calendar";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const WEEKDAY_LABELS = ["L", "Ma", "Mi", "J", "V"];

// CSS-variable-driven cell colors. Soft red uses the existing G3 badge token
// (FFE0E0 / 990000) so we get a "concerning" tint without touching brand red,
// which DESIGN.md reserves for destructive actions.
const bucketStyles: Record<DayBucket, string> = {
  all: "bg-[var(--grade-5-bg)] text-[var(--grade-5-text)]",
  partial: "bg-[var(--grade-1-bg)] text-[var(--grade-1-text)]",
  low: "bg-[var(--grade-3-bg)] text-[var(--grade-3-text)]",
  empty: "bg-[var(--input-bg)] text-text-placeholder border border-border",
};

export interface CalendarCell {
  dateIso: string;
  dayOfMonth: number;
  weekdayCol: 1 | 2 | 3 | 4 | 5; // L=1 ... V=5
  presentCount: number;
  totalStudents: number;
  bucket: DayBucket;
}

interface CalendarProps {
  monthIso: string;
  todayIso: string;
  cells: CalendarCell[];
  prevMonthIso: string;
  nextMonthIso: string | null;
}

function formatMonthTitle(monthIso: string): string {
  const [y, m] = monthIso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].charAt(0).toUpperCase()}${MONTH_NAMES[m - 1].slice(1)} ${y}`;
}

export function AttendanceCalendar({
  monthIso,
  todayIso,
  cells,
  prevMonthIso,
  nextMonthIso,
}: CalendarProps) {
  return (
    <section aria-label="Calendario de asistencia">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={`/asistencia?month=${prevMonthIso}`}
          aria-label="Mes anterior"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-input-bg"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h2 className="text-base font-semibold">{formatMonthTitle(monthIso)}</h2>
        {nextMonthIso ? (
          <Link
            href={`/asistencia?month=${nextMonthIso}`}
            aria-label="Mes siguiente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-input-bg"
          >
            <ChevronRight size={20} aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-placeholder/40">
            <ChevronRight size={20} aria-hidden />
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1.5" role="presentation">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="pb-1 text-center text-xs font-semibold text-text-secondary"
          >
            {label}
          </div>
        ))}
        {renderCells(cells, todayIso)}
      </div>

      <Legend />
    </section>
  );
}

function renderCells(cells: CalendarCell[], todayIso: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursorCol = 1;
  for (const cell of cells) {
    while (cursorCol < cell.weekdayCol) {
      out.push(<div key={`spacer-${cell.dateIso}-${cursorCol}`} aria-hidden />);
      cursorCol++;
    }
    out.push(<DayCell key={cell.dateIso} cell={cell} isToday={cell.dateIso === todayIso} />);
    cursorCol = cursorCol === 5 ? 1 : cursorCol + 1;
  }
  return out;
}

function DayCell({ cell, isToday }: { cell: CalendarCell; isToday: boolean }) {
  const ring = isToday ? "ring-2 ring-brand-blue" : "";
  const label = describeCell(cell);
  return (
    <div
      className={`flex aspect-square min-h-11 flex-col items-center justify-center rounded-lg ${bucketStyles[cell.bucket]} ${ring}`}
      title={label}
      aria-label={label}
    >
      <span
        className="text-sm font-semibold"
        style={{ fontFeatureSettings: "'tnum'" }}
      >
        {cell.dayOfMonth}
      </span>
    </div>
  );
}

function describeCell(cell: CalendarCell): string {
  const dateLabel = formatLongDate(cell.dateIso);
  if (cell.bucket === "empty") return `${dateLabel}: sin registro`;
  return `${dateLabel}: ${cell.presentCount} de ${cell.totalStudents} presentes`;
}

function formatLongDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

function Legend() {
  const items: Array<{ bucket: DayBucket; label: string }> = [
    { bucket: "all", label: "Todos" },
    { bucket: "partial", label: "≥ 40%" },
    { bucket: "low", label: "< 40%" },
    { bucket: "empty", label: "Sin registro" },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
      {items.map((item) => (
        <div key={item.bucket} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-3 w-3 rounded ${bucketStyles[item.bucket]}`}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}
