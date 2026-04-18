import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertInputs,
  checkKillSwitch,
  getMonthlyTokenBudget,
  isKillSwitchOn,
  MAX_MATERIAS,
} from "@/lib/api/pbl-gate";

const MAT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STU = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const base = {
  grados: [1, 2],
  materia_ids: [MAT],
  student_ids: [STU],
  duracion_semanas: 1,
  tema_contexto: "el agua de la quebrada",
};

describe("assertInputs", () => {
  it("accepts a well-formed body", () => {
    const r = assertInputs(base);
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.grados).toEqual([1, 2]);
      expect(r.materia_ids).toEqual([MAT]);
      expect(r.tema_contexto).toBe("el agua de la quebrada");
    }
  });

  it("dedupes and sorts grados", () => {
    const r = assertInputs({ ...base, grados: [3, 1, 3, 2] });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.grados).toEqual([1, 2, 3]);
  });

  it("treats empty-string tema_contexto as null", () => {
    const r = assertInputs({ ...base, tema_contexto: "   " });
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.tema_contexto).toBeNull();
  });

  it("rejects grado > 5", () => {
    const r = assertInputs({ ...base, grados: [6] });
    expect("error" in r).toBe(true);
  });

  it("rejects empty grados", () => {
    const r = assertInputs({ ...base, grados: [] });
    expect("error" in r).toBe(true);
  });

  it(`rejects more than ${MAX_MATERIAS} materias`, () => {
    const r = assertInputs({
      ...base,
      materia_ids: Array.from({ length: MAX_MATERIAS + 1 }, (_, i) =>
        `${i}aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`.slice(0, 36),
      ),
    });
    expect("error" in r).toBe(true);
  });

  it("rejects malformed materia_id (non-UUID)", () => {
    const r = assertInputs({ ...base, materia_ids: ["not-a-uuid"] });
    expect("error" in r).toBe(true);
  });

  it("rejects duracion_semanas that is not 1 or 2", () => {
    const r = assertInputs({ ...base, duracion_semanas: 3 });
    expect("error" in r).toBe(true);
  });

  it("rejects empty student_ids", () => {
    const r = assertInputs({ ...base, student_ids: [] });
    expect("error" in r).toBe(true);
  });

  it("rejects overly long tema_contexto", () => {
    const r = assertInputs({ ...base, tema_contexto: "a".repeat(501) });
    expect("error" in r).toBe(true);
  });

  it("rejects non-object body", () => {
    const r = assertInputs("nope");
    expect("error" in r).toBe(true);
  });
});

describe("kill switch + monthly budget config", () => {
  afterEach(() => {
    delete process.env.PBL_KILL_SWITCH;
    delete process.env.PBL_MONTHLY_TOKEN_BUDGET;
  });

  it("kill switch off by default", () => {
    expect(isKillSwitchOn()).toBe(false);
    expect(checkKillSwitch().ok).toBe(true);
  });

  it("kill switch on when env var equals 'true'", () => {
    vi.stubEnv("PBL_KILL_SWITCH", "true");
    expect(isKillSwitchOn()).toBe(true);
    const r = checkKillSwitch();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("monthly budget defaults to 5M", () => {
    expect(getMonthlyTokenBudget()).toBe(5_000_000);
  });

  it("monthly budget reads env var when set to a positive number", () => {
    vi.stubEnv("PBL_MONTHLY_TOKEN_BUDGET", "1234567");
    expect(getMonthlyTokenBudget()).toBe(1_234_567);
    vi.unstubAllEnvs();
  });

  it("monthly budget falls back to default on garbage", () => {
    vi.stubEnv("PBL_MONTHLY_TOKEN_BUDGET", "not-a-number");
    expect(getMonthlyTokenBudget()).toBe(5_000_000);
    vi.unstubAllEnvs();
  });
});
