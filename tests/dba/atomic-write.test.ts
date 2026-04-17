import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "@/scripts/dba/lib";

describe("atomicWriteJson", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dba-atomic-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes valid JSON to the target path", async () => {
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { hello: "mundo", n: 3 });
    const raw = await readFile(target, "utf8");
    expect(JSON.parse(raw)).toEqual({ hello: "mundo", n: 3 });
  });

  it("leaves no tmp file behind on success", async () => {
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { a: 1 });
    const files = await readdir(dir);
    expect(files).toEqual(["out.json"]);
  });

  it("overwrites an existing file", async () => {
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { v: 1 });
    await atomicWriteJson(target, { v: 2 });
    const raw = await readFile(target, "utf8");
    expect(JSON.parse(raw)).toEqual({ v: 2 });
  });

  it("pretty-prints and trailing-newlines the JSON", async () => {
    const target = path.join(dir, "out.json");
    await atomicWriteJson(target, { a: 1 });
    const raw = await readFile(target, "utf8");
    expect(raw).toBe('{\n  "a": 1\n}\n');
  });
});
