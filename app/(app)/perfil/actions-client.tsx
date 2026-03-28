"use client";

import { useState } from "react";
import { signOut, deleteAccount } from "./actions";
import { Button } from "@/components/ui/button";

export function PerfilActions() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await deleteAccount();
  };

  return (
    <div className="space-y-3">
      <form action={signOut}>
        <Button variant="secondary" type="submit">
          Cerrar sesion
        </Button>
      </form>

      {showConfirm ? (
        <div className="rounded-2xl border-[1.5px] border-brand-red/30 bg-brand-red/5 p-4">
          <p className="mb-3 text-sm text-text-primary">
            Esto eliminara tu cuenta, escuela y todos los datos de tus estudiantes. Esta accion no se puede deshacer.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowConfirm(false)} className="flex-1">
              Cancelar
            </Button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-xl bg-brand-red py-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Eliminando..." : "Si, eliminar"}
            </button>
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
