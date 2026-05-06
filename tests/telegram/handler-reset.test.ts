import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramIdentity, TelegramUpdate } from "@/lib/telegram/types";

const mocks = vi.hoisted(() => ({
  clearSession: vi.fn(),
  clearTelegramMessageLogs: vi.fn(),
  deleteIdentity: vi.fn(),
  getIdentity: vi.fn(),
  getSession: vi.fn(),
  logTelegramMessage: vi.fn(),
  resetTelegramUser: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/telegram/app-actions", () => ({
  appBaseUrl: vi.fn(),
  buildTeacherSummary: vi.fn(),
  createTeacherFromTelegram: vi.fn(),
  formatMateriaPrompt: vi.fn(),
  parseMateriaSelection: vi.fn(),
  resetTelegramUser: mocks.resetTelegramUser,
  saveAttendanceFromTelegram: vi.fn(),
  startTelegramProjectGeneration: vi.fn(),
  teacherExists: vi.fn(),
}));
vi.mock("@/lib/telegram/client", () => ({
  sendTelegramDocument: vi.fn(),
  sendTelegramMessage: mocks.sendTelegramMessage,
}));
vi.mock("@/lib/telegram/store", () => ({
  clearSession: mocks.clearSession,
  clearTelegramMessageLogs: mocks.clearTelegramMessageLogs,
  consumeLinkCode: vi.fn(),
  deleteIdentity: mocks.deleteIdentity,
  getIdentity: mocks.getIdentity,
  getSession: mocks.getSession,
  logTelegramMessage: mocks.logTelegramMessage,
  saveIdentity: vi.fn(),
  saveSession: vi.fn(),
}));

import { handleTelegramUpdate } from "@/lib/telegram/handler";

describe("telegram reset handler", () => {
  const oldEnableReset = process.env.TELEGRAM_ENABLE_RESET;

  beforeEach(() => {
    process.env.TELEGRAM_ENABLE_RESET = "true";
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    process.env.TELEGRAM_ENABLE_RESET = oldEnableReset;
  });

  it("clears monitor logs after confirming a reset for a linked user", async () => {
    const identity: TelegramIdentity = {
      teacherId: "teacher-1",
      providerUserId: "provider-1",
      chatId: "chat-1",
      username: "profe",
      firstName: "Profe",
      lastName: null,
      linkedAt: 123,
    };
    const update: TelegramUpdate = {
      update_id: 42,
      message: {
        message_id: 7,
        chat: { id: 100, type: "private" },
        from: { id: 200, first_name: "Profe", username: "profe" },
        date: 123,
        text: "\\reset",
      },
    };

    mocks.getIdentity.mockResolvedValue(identity);
    mocks.resetTelegramUser.mockResolvedValue(true);

    await handleTelegramUpdate(update);

    expect(mocks.resetTelegramUser).toHaveBeenCalledWith("teacher-1");
    expect(mocks.deleteIdentity).toHaveBeenCalledWith(identity);
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith({
      chatId: "100",
      text: "Listo. Te borré como usuario de prueba. Escribe cualquier mensaje para empezar de nuevo.",
      teacherId: undefined,
      providerUserId: undefined,
    });
    expect(mocks.clearTelegramMessageLogs).toHaveBeenCalledWith({
      chatId: "100",
      providerUserId: "200",
      teacherId: "teacher-1",
    });
    expect(mocks.clearTelegramMessageLogs.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.sendTelegramMessage.mock.invocationCallOrder[0],
    );
  });
});
