"use client";

import { useFormStatus } from "react-dom";

type ButtonVariant = "primary" | "secondary" | "accent";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  pendingText?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-blue text-white hover:bg-brand-blue/90",
  secondary: "bg-white text-brand-blue border-[1.5px] border-brand-blue hover:bg-brand-blue/5",
  accent: "bg-brand-yellow text-text-primary font-bold hover:bg-brand-yellow/90",
};

export function Button({
  variant = "primary",
  loading,
  pendingText,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`w-full rounded-xl px-5 py-4 text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {pendingText || children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function SubmitButton({
  variant = "primary",
  pendingText,
  children,
  className = "",
  ...props
}: Omit<ButtonProps, "loading">) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      loading={pending}
      pendingText={pendingText}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}
