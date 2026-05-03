// REGRESSION test (mandatory per plan-eng-review):
// covers handleShareImage (canShare true / canShare false / fetch fail / AbortError)
// and handleDownloadPdf (happy / fetch fail) in lib/share-render/share-handlers.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareImage, downloadPdf } from "@/lib/share-render/share-handlers";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const TITULO = "Cómo cuidamos el agua";

function makeStateRecorder() {
  const calls: string[] = [];
  return {
    setter: (s: string) => calls.push(s),
    calls,
  };
}

function pngBlob(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
}

function pdfBlob(): Blob {
  return new Blob([new Uint8Array([4, 5, 6])], { type: "application/pdf" });
}

function fakeDocument() {
  const click = vi.fn();
  const remove = vi.fn();
  const append = vi.fn();
  const created: Array<{ href?: string; download?: string }> = [];
  const doc = {
    createElement: vi.fn(() => {
      const el: Record<string, unknown> & { click: () => void } = {
        click,
        href: "",
        download: "",
      };
      created.push(el as { href?: string; download?: string });
      return el;
    }),
    body: { appendChild: append, removeChild: remove },
  } as unknown as Document;
  return { doc, click, append, remove, created };
}

beforeEach(() => {
  // jsdom provides URL but not createObjectURL/revokeObjectURL — stub them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (URL as any).createObjectURL = vi.fn(() => "blob:fake");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (URL as any).revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shareImage — canShare files = true (mobile path)", () => {
  it("calls navigator.share with the PNG file and returns to default", async () => {
    const rec = makeStateRecorder();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const fetchFn = vi.fn(async () => new Response(pngBlob(), { status: 200 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: { share, canShare } as unknown as Navigator,
      documentRef: null,
      successResetMs: 0,
    });

    expect(rec.calls).toEqual(["loading", "default"]);
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0][0] as { files?: File[]; title?: string };
    expect(arg.files?.[0]).toBeInstanceOf(File);
    expect(arg.files?.[0].name).toBe("como-cuidamos-el-agua.png");
    expect(arg.title).toBe(TITULO);
  });
});

describe("shareImage — canShare = false (desktop path)", () => {
  it("falls back to <a download>, transitions to success then default", async () => {
    const rec = makeStateRecorder();
    const { doc, click, append } = fakeDocument();
    const fetchFn = vi.fn(async () => new Response(pngBlob(), { status: 200 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: { canShare: () => false } as unknown as Navigator,
      documentRef: doc,
      successResetMs: 0,
    });

    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    // States: loading → success → default (after timeout). The setTimeout
    // fires synchronously when successResetMs is 0 and we wait one tick.
    await new Promise((r) => setTimeout(r, 5));
    expect(rec.calls.slice(0, 2)).toEqual(["loading", "success"]);
    expect(rec.calls.includes("default")).toBe(true);
  });
});

describe("shareImage — fetch failure", () => {
  it("transitions to error on network reject", async () => {
    const rec = makeStateRecorder();
    const fetchFn = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: null,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error"]);
  });

  it("transitions to error_no_phases on 422", async () => {
    const rec = makeStateRecorder();
    const fetchFn = vi.fn(async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: null,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error_no_phases"]);
  });

  it("transitions to error on 500", async () => {
    const rec = makeStateRecorder();
    const fetchFn = vi.fn(async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: null,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error"]);
  });
});

describe("shareImage — AbortError when user cancels share sheet", () => {
  it("returns to default silently (does NOT show error)", async () => {
    const rec = makeStateRecorder();
    const abortErr = Object.assign(new Error("abort"), { name: "AbortError" });
    const share = vi.fn().mockRejectedValue(abortErr);
    const fetchFn = vi.fn(async () => new Response(pngBlob(), { status: 200 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: { share, canShare: () => true } as unknown as Navigator,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "default"]);
  });

  it("non-AbortError from navigator.share transitions to error", async () => {
    const rec = makeStateRecorder();
    const share = vi.fn().mockRejectedValue(new Error("permission denied"));
    const fetchFn = vi.fn(async () => new Response(pngBlob(), { status: 200 })) as unknown as typeof fetch;

    await shareImage({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      navigatorRef: { share, canShare: () => true } as unknown as Navigator,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error"]);
  });
});

describe("downloadPdf — happy path", () => {
  it("triggers download and transitions success → default", async () => {
    const rec = makeStateRecorder();
    const { doc, click } = fakeDocument();
    const fetchFn = vi.fn(async () => new Response(pdfBlob(), { status: 200 })) as unknown as typeof fetch;

    await downloadPdf({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      documentRef: doc,
      successResetMs: 0,
    });

    expect(click).toHaveBeenCalledOnce();
    await new Promise((r) => setTimeout(r, 5));
    expect(rec.calls.slice(0, 2)).toEqual(["loading", "success"]);
    expect(rec.calls.includes("default")).toBe(true);
  });
});

describe("downloadPdf — fetch failure", () => {
  it("transitions to error on network reject", async () => {
    const rec = makeStateRecorder();
    const fetchFn = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await downloadPdf({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error"]);
  });

  it("transitions to error_no_phases on 422", async () => {
    const rec = makeStateRecorder();
    const fetchFn = vi.fn(async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;

    await downloadPdf({
      projectId: PROJECT_ID,
      titulo: TITULO,
      setState: rec.setter,
      fetchFn,
      documentRef: null,
    });

    expect(rec.calls).toEqual(["loading", "error_no_phases"]);
  });
});
