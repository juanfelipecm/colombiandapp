import { describe, expect, it } from "vitest";
import { buildIntroMessage, buildLinkedIntroMessage } from "@/lib/telegram/messages";

describe("Telegram intro messages", () => {
  it("lists the guided options and free-form query path", () => {
    const message = buildIntroMessage("Jonathan L");

    expect(message).toContain("Hola, Jonathan L! Soy ColombiAndo");
    expect(message).toContain("/proyecto - Crear un proyecto ABP");
    expect(message).toContain("/asistencia - Tomar asistencia");
    expect(message).toContain("/resumen - Ver resumen del aula");
    expect(message).toContain("/cancelar - Cancelar un flujo");
    expect(message).toContain("También puedes escribir normal");
  });

  it("keeps linked-account confirmation with the same option structure", () => {
    const message = buildLinkedIntroMessage("Diana");

    expect(message).toContain("Cuenta vinculada.");
    expect(message).toContain("Hola, Diana!");
    expect(message).toContain("Crear un proyecto ABP");
  });
});
