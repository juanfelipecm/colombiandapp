interface CardProps {
  children: React.ReactNode;
  highlight?: boolean;
  className?: string;
}

export function Card({ children, highlight, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-2xl border-[1.5px] p-4 ${
        highlight
          ? "border-brand-yellow bg-[#fffbf0]"
          : "border-border bg-card-bg"
      } ${className}`}
    >
      {children}
    </div>
  );
}
