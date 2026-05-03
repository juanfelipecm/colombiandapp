import Link from "next/link";

const containerClass =
  "inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-full bg-input-bg p-1";

export function SegmentedTabs({ children }: { children: React.ReactNode }) {
  return (
    <div role="tablist" className={containerClass}>
      {children}
    </div>
  );
}

type TabContentProps = {
  active: boolean;
  label: string;
  count?: number;
};

function tabClass(active: boolean): string {
  return [
    "shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
    active
      ? "bg-white text-text-primary shadow-sm"
      : "text-text-secondary hover:text-text-primary",
  ].join(" ");
}

function TabContent({ label, count }: Omit<TabContentProps, "active">) {
  return (
    <>
      {label}
      {typeof count === "number" ? (
        <span className="ml-1.5 opacity-75">· {count}</span>
      ) : null}
    </>
  );
}

type ButtonTabProps = TabContentProps & {
  onClick: () => void;
};

export function SegmentedTabButton({ active, label, count, onClick }: ButtonTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={tabClass(active)}
    >
      <TabContent label={label} count={count} />
    </button>
  );
}

type LinkTabProps = TabContentProps & {
  href: string;
};

export function SegmentedTabLink({ active, label, count, href }: LinkTabProps) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      scroll={false}
      className={tabClass(active)}
    >
      <TabContent label={label} count={count} />
    </Link>
  );
}
