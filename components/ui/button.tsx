"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost" | "active";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  pendingText?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-blue text-black",
  secondary: "bg-brand-yellow text-black",
  destructive: "bg-brand-red text-white",
  ghost: "bg-white text-black",
  active: "bg-white text-brand-blue",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "w-full text-sm px-4 py-2",
  md: "w-full text-base px-6 py-3",
  lg: "w-full text-lg px-8 py-4",
  icon: "w-11 h-11 p-0 inline-flex items-center justify-center",
};

const depthStyles: Record<ButtonSize, string> = {
  sm: "border-b-4 hover:pb-[10px] hover:border-b-2",
  md: "border-b-[6px] hover:pb-[14px] hover:border-b-2",
  lg: "border-b-8 hover:pb-[18px] hover:border-b-2",
  icon: "border-b-[6px] hover:border-b-2",
};

const baseClasses =
  "rounded-full font-bold transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0";

function buildClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  extra: string,
): string {
  const isActive = variant === "active";
  const interactive = isActive
    ? "border-2 border-brand-blue cursor-default"
    : `border-x-0 border-t-0 border-b-black ${depthStyles[size]} hover:translate-y-[2px] cursor-pointer`;
  return `${baseClasses} ${sizeStyles[size]} ${variantStyles[variant]} ${interactive} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  pendingText,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const showText = size !== "icon";

  return (
    <button
      className={buildClassName(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {showText && (pendingText || children)}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function SubmitButton({
  variant = "primary",
  size = "md",
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
      size={size}
      loading={pending}
      pendingText={pendingText}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
}

interface LinkButtonProps extends Omit<React.ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: LinkButtonProps) {
  // text-center because Link is inline by default — sizeStyles uses w-full,
  // and a centered label reads as a button rather than a left-aligned anchor.
  return (
    <Link
      className={`${buildClassName(variant, size, className)} inline-block text-center`}
      {...props}
    >
      {children}
    </Link>
  );
}
