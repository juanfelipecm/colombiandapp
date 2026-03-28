"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, visible, onDismiss, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom">
      <div className="rounded-xl border-l-4 border-l-brand-teal bg-white p-3 shadow-lg">
        <p className="text-sm text-text-primary">{message}</p>
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState({ message: "", visible: false });

  const show = (message: string) => setToast({ message, visible: true });
  const dismiss = () => setToast((t) => ({ ...t, visible: false }));

  return { toast, show, dismiss };
}
