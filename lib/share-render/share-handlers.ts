// Pure handler logic for the kebab "Compartir como imagen" / "Descargar PDF"
// items. Extracted from project-view.tsx so the regression flows (canShare
// true / canShare false / fetch fail / AbortError / 422) can be unit-tested
// without mounting the whole component tree.

import { slugify } from "./slug";

export type ShareKebabState =
  | "default"
  | "loading"
  | "success"
  | "error"
  | "error_no_phases";

type Setter = (s: ShareKebabState) => void;

type ShareDeps = {
  projectId: string;
  titulo: string;
  setState: Setter;
  // Injectable for tests. Defaults to globals at call time.
  fetchFn?: typeof fetch;
  navigatorRef?: Navigator | null;
  documentRef?: Document | null;
  successResetMs?: number;
};

const DEFAULT_RESET_MS = 2000;

function pickFetch(deps: ShareDeps): typeof fetch {
  return deps.fetchFn ?? globalThis.fetch.bind(globalThis);
}

function pickNavigator(deps: ShareDeps): Navigator | null {
  if (deps.navigatorRef !== undefined) return deps.navigatorRef;
  return typeof navigator !== "undefined" ? navigator : null;
}

function pickDocument(deps: ShareDeps): Document | null {
  if (deps.documentRef !== undefined) return deps.documentRef;
  return typeof document !== "undefined" ? document : null;
}

async function downloadBlob(
  blob: Blob,
  filename: string,
  doc: Document | null,
): Promise<void> {
  if (!doc) return;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function shareImage(deps: ShareDeps): Promise<void> {
  const { projectId, titulo, setState } = deps;
  const fetchFn = pickFetch(deps);
  const nav = pickNavigator(deps);
  const doc = pickDocument(deps);
  const resetMs = deps.successResetMs ?? DEFAULT_RESET_MS;

  setState("loading");

  let res: Response;
  try {
    res = await fetchFn(`/api/proyectos/${projectId}/share-image`);
  } catch {
    setState("error");
    return;
  }

  if (!res.ok) {
    setState(res.status === 422 ? "error_no_phases" : "error");
    return;
  }

  const blob = await res.blob();
  const file = new File([blob], `${slugify(titulo)}.png`, { type: "image/png" });

  const canShareFiles =
    nav &&
    "canShare" in nav &&
    typeof (nav as unknown as { canShare?: (data: ShareData) => boolean })
      .canShare === "function" &&
    (nav as unknown as { canShare: (data: ShareData) => boolean }).canShare({ files: [file] });

  if (canShareFiles && nav) {
    try {
      await nav.share({
        files: [file],
        title: titulo,
        text: `Plan de proyecto · ${titulo}`,
      });
      setState("default");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setState("default");
      } else {
        setState("error");
      }
    }
    return;
  }

  await downloadBlob(blob, `${slugify(titulo)}.png`, doc);
  setState("success");
  if (typeof window !== "undefined") {
    window.setTimeout(() => setState("default"), resetMs);
  }
}

export async function downloadPdf(deps: ShareDeps): Promise<void> {
  const { projectId, titulo, setState } = deps;
  const fetchFn = pickFetch(deps);
  const doc = pickDocument(deps);
  const resetMs = deps.successResetMs ?? DEFAULT_RESET_MS;

  setState("loading");

  let res: Response;
  try {
    res = await fetchFn(`/api/proyectos/${projectId}/share-pdf`);
  } catch {
    setState("error");
    return;
  }

  if (!res.ok) {
    setState(res.status === 422 ? "error_no_phases" : "error");
    return;
  }

  const blob = await res.blob();
  await downloadBlob(blob, `${slugify(titulo)}.pdf`, doc);
  setState("success");
  if (typeof window !== "undefined") {
    window.setTimeout(() => setState("default"), resetMs);
  }
}
