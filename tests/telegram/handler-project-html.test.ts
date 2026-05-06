import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramIdentity, TelegramUpdate } from "@/lib/telegram/types";

const mocks = vi.hoisted(() => ({
  appBaseUrl: vi.fn(),
  clearSession: vi.fn(),
  getIdentity: vi.fn(),
  getSession: vi.fn(),
  logTelegramMessage: vi.fn(),
  renderProjectHtmlFile: vi.fn(),
  saveSession: vi.fn(),
  sendTelegramDocument: vi.fn(),
  sendTelegramMessage: vi.fn(),
  startTelegramProjectGeneration: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/telegram/app-actions", () => ({
  appBaseUrl: mocks.appBaseUrl,
  buildTeacherSummary: vi.fn(),
  createTeacherFromTelegram: vi.fn(),
  formatMateriaPrompt: vi.fn(),
  parseMateriaSelection: vi.fn(),
  resetTelegramUser: vi.fn(),
  saveAttendanceFromTelegram: vi.fn(),
  startTelegramProjectGeneration: mocks.startTelegramProjectGeneration,
  teacherExists: vi.fn(),
}));
vi.mock("@/lib/telegram/client", () => ({
  sendTelegramDocument: mocks.sendTelegramDocument,
  sendTelegramMessage: mocks.sendTelegramMessage,
}));
vi.mock("@/lib/telegram/project-html", () => ({
  renderProjectHtmlFile: mocks.renderProjectHtmlFile,
}));
vi.mock("@/lib/telegram/store", () => ({
  clearSession: mocks.clearSession,
  clearTelegramMessageLogs: vi.fn(),
  consumeLinkCode: vi.fn(),
  deleteIdentity: vi.fn(),
  getIdentity: mocks.getIdentity,
  getSession: mocks.getSession,
  logTelegramMessage: mocks.logTelegramMessage,
  saveIdentity: vi.fn(),
  saveSession: mocks.saveSession,
}));

import { handleTelegramUpdate } from "@/lib/telegram/handler";

describe("telegram project generation delivery", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.appBaseUrl.mockReturnValue("https://example.test");
  });

  it("sends a generated project as an HTML document", async () => {
    const identity: TelegramIdentity = {
      teacherId: "teacher-1",
      providerUserId: "provider-1",
      chatId: "100",
      username: null,
      firstName: "Profe",
      lastName: null,
      linkedAt: 123,
    };
    const update: TelegramUpdate = {
      update_id: 42,
      message: {
        message_id: 7,
        chat: { id: 100, type: "private" },
        from: { id: 200, first_name: "Profe" },
        date: 123,
        text: "la huerta escolar",
      },
    };

    mocks.getIdentity.mockResolvedValue(identity);
    mocks.getSession.mockResolvedValue({
      flow: "project",
      step: "tema",
      teacherId: "teacher-1",
      selectedMateriaIds: ["materia-1"],
      duracionSemanas: 1,
      updatedAt: 123,
    });
    mocks.startTelegramProjectGeneration.mockResolvedValue({
      ok: true,
      generationId: "generation-1",
      projectId: "project-1",
    });
    mocks.renderProjectHtmlFile.mockResolvedValue({
      fileName: "proyecto.html",
      fileBuffer: Buffer.from("<html></html>", "utf-8"),
    });

    const result = await handleTelegramUpdate(update);
    await result.background?.();

    expect(mocks.startTelegramProjectGeneration).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      materiaIds: ["materia-1"],
      duracionSemanas: 1,
      temaContexto: "la huerta escolar",
    });
    expect(mocks.renderProjectHtmlFile).toHaveBeenCalledWith("project-1");
    expect(mocks.sendTelegramDocument).toHaveBeenCalledWith({
      chatId: "100",
      fileName: "proyecto.html",
      fileBuffer: Buffer.from("<html></html>", "utf-8"),
      caption: "Tu proyecto está listo.",
      teacherId: "teacher-1",
      providerUserId: "provider-1",
    });
    expect(mocks.appBaseUrl).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("/proyectos/project-1"),
      }),
    );
  });
});
