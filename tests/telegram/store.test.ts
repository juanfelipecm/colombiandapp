import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redisCommand: vi.fn(),
  redisPipeline: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/upstash/redis", () => ({
  redisCommand: mocks.redisCommand,
  redisPipeline: mocks.redisPipeline,
}));

import { clearTelegramMessageLogs, TG_KEYS } from "@/lib/telegram/store";
import type { TelegramMessageLog } from "@/lib/telegram/types";

describe("telegram store", () => {
  beforeEach(() => {
    mocks.redisCommand.mockReset();
    mocks.redisPipeline.mockReset();
  });

  it("clears monitor logs for the reset chat, provider, and teacher", async () => {
    const keep: TelegramMessageLog = {
      ts: 4,
      direction: "in",
      chatId: "other-chat",
      providerUserId: "other-user",
      teacherId: "other-teacher",
      text: "keep",
    };
    const byChat: TelegramMessageLog = {
      ts: 3,
      direction: "out",
      chatId: "chat-1",
      providerUserId: "other-user",
      teacherId: "other-teacher",
      text: "remove by chat",
    };
    const byProvider: TelegramMessageLog = {
      ts: 2,
      direction: "in",
      chatId: "other-chat",
      providerUserId: "provider-1",
      text: "remove by provider",
    };
    const byTeacher: TelegramMessageLog = {
      ts: 1,
      direction: "out",
      chatId: "other-chat",
      teacherId: "teacher-1",
      text: "remove by teacher",
    };

    const serializedKeep = JSON.stringify(keep);
    mocks.redisCommand.mockResolvedValue([
      serializedKeep,
      JSON.stringify(byChat),
      JSON.stringify(byProvider),
      JSON.stringify(byTeacher),
    ]);

    await clearTelegramMessageLogs({
      chatId: "chat-1",
      providerUserId: "provider-1",
      teacherId: "teacher-1",
    });

    expect(mocks.redisCommand).toHaveBeenCalledWith(["LRANGE", TG_KEYS.msgs, 0, 4999]);
    expect(mocks.redisPipeline).toHaveBeenCalledWith([
      ["DEL", TG_KEYS.msgs],
      ["RPUSH", TG_KEYS.msgs, serializedKeep],
      ["ZREM", TG_KEYS.userCounts, "provider-1"],
      ["ZREM", TG_KEYS.teacherCounts, "teacher-1"],
    ]);
  });
});
