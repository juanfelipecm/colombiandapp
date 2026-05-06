"use client";

import { useState } from "react";
import { signOut, deleteAccount } from "./actions";
import { Button } from "@/components/ui/button";

export function PerfilActions() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [telegram, setTelegram] = useState<{
    code: string;
    deep_link: string | null;
    command: string;
  } | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    await deleteAccount();
  };

  const createTelegramCode = async () => {
    setTelegramLoading(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/telegram/link-code", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        deep_link?: string | null;
        command?: string;
      };
      if (!res.ok || !body.code || !body.command) {
        setTelegramError("No pudimos crear el codigo. Intenta de nuevo.");
        return;
      }
      setTelegram({
        code: body.code,
        deep_link: body.deep_link ?? null,
        command: body.command,
      });
    } finally {
      setTelegramLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-[1.5px] border-border bg-card-bg p-4">
        <p className="mb-1 text-sm font-semibold">Telegram</p>
        <p className="mb-3 text-xs text-text-secondary">
          Conecta este perfil con el bot para tomar asistencia y crear proyectos por chat.
        </p>
        {telegram ? (
          <div className="space-y-2">
            <div className="rounded-xl bg-input-bg p-3">
              <p className="text-xs text-text-secondary">Envia al bot:</p>
              <p className="font-mono text-sm font-semibold">{telegram.command}</p>
              <p className="mt-1 text-[11px] text-text-placeholder">Vence en 10 minutos.</p>
            </div>
            {telegram.deep_link ? (
              <a
                href={telegram.deep_link}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl bg-brand-blue px-4 py-3 text-center text-sm font-semibold text-white"
              >
                Abrir Telegram
              </a>
            ) : null}
            <Button type="button" variant="ghost" onClick={createTelegramCode} className="w-full">
              Crear otro codigo
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            loading={telegramLoading}
            pendingText="Creando..."
            onClick={createTelegramCode}
            className="w-full"
          >
            Conectar Telegram
          </Button>
        )}
        {telegramError ? <p className="mt-2 text-xs text-brand-red">{telegramError}</p> : null}
      </div>

      <form action={signOut}>
        <Button variant="ghost" type="submit" className="w-full">
          Cerrar sesion
        </Button>
      </form>

      {showConfirm ? (
        <div className="rounded-2xl border-[1.5px] border-brand-red/30 bg-brand-red/5 p-4">
          <p className="mb-3 text-sm text-text-primary">
            Esto eliminara tu cuenta, escuela y todos los datos de tus estudiantes. Esta accion no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowConfirm(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              loading={deleting}
              pendingText="Eliminando..."
              className="flex-1"
            >
              Si, eliminar
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full py-3 text-sm text-brand-red"
        >
          Eliminar mi cuenta
        </button>
      )}
    </div>
  );
}
