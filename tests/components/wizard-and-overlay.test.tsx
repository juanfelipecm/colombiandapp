import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

import {
  GENERATING_STAGE_MESSAGES,
  GENERATING_TERMINAL_MESSAGE,
  GeneratingOverlay,
  nextStageIdx,
} from "@/components/ui/generating-overlay";
import { DRAFT_KEY, WizardClient } from "@/app/(app)/proyectos/nuevo/wizard-client";
import { generationErrorMessage } from "@/lib/utils/use-generation-polling";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const MAT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const students = [
  { id: "11111111-1111-1111-1111-111111111111", first_name: "Ana", grade: 0 },
  { id: "22222222-2222-2222-2222-222222222222", first_name: "Bruno", grade: 3 },
];
const materias = [{ id: MAT, slug: "lenguaje", nombre: "Lenguaje", orden: 1 }];

describe("GeneratingOverlay", () => {
  afterEach(cleanup);

  it("walks the five fases and ends on a terminal message", () => {
    expect(GENERATING_STAGE_MESSAGES).toHaveLength(8);
    expect(GENERATING_STAGE_MESSAGES[1]).toMatch(/^Fase 1 · /);
    expect(GENERATING_STAGE_MESSAGES[5]).toMatch(/^Fase 5 · /);
    expect(GENERATING_STAGE_MESSAGES.at(-1)).toBe(GENERATING_TERMINAL_MESSAGE);
    expect(GENERATING_STAGE_MESSAGES.some((m) => EMOJI.test(m))).toBe(false);
  });

  it("never wraps back to the first stage", () => {
    let i = 0;
    for (let n = 0; n < 50; n++) i = nextStageIdx(i);
    expect(i).toBe(GENERATING_STAGE_MESSAGES.length - 1);
    render(<GeneratingOverlay stageIdx={999} />);
    expect(screen.getByText(GENERATING_TERMINAL_MESSAGE)).toBeTruthy();
  });

  it("maps each failure status to teacher copy", () => {
    expect(generationErrorMessage("validation_failed")).toMatch(/otro tema o menos materias/);
    expect(generationErrorMessage("timeout")).toMatch(/Tardó más de lo esperado/);
    expect(generationErrorMessage("db_error")).toMatch(/de nuestro lado/);
    expect(generationErrorMessage(undefined)).toMatch(/de nuestro lado/);
  });
});

describe("WizardClient (3 steps)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    replace.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("has three steps, shows Transición, and posts without duracion_semanas", async () => {
    window.localStorage.setItem("pbl-wizard-draft-v1", JSON.stringify({ step: 4 }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ generation_id: "g1", status: "pending" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-3333-3333-333333333333" });

    render(<WizardClient students={students} materias={materias} />);
    await waitFor(() => expect(window.localStorage.getItem("pbl-wizard-draft-v1")).toBeNull());

    expect(screen.getByText("Paso 1 de 3")).toBeTruthy();
    expect(screen.getByText("Transición")).toBeTruthy();
    fireEvent.click(screen.getByText("Siguiente"));
    fireEvent.click(screen.getByText("Lenguaje"));
    fireEvent.click(screen.getByText("Siguiente"));
    expect(screen.getByText("Paso 3 de 3")).toBeTruthy();
    expect(screen.getByText(/Tu proyecto tendrá 5 fases: Despertar la curiosidad/)).toBeTruthy();
    expect(window.localStorage.getItem(DRAFT_KEY)).toContain('"step":3');

    fireEvent.click(screen.getByText("Generar proyecto"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(["grados", "materia_ids", "student_ids", "tema_contexto"]);
    expect(body.grados).toEqual([0, 3]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/proyectos/generando/g1"));
  });
});
