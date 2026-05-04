import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Infographic } from "@/components/share/Infographic";
import type { ShareData } from "./load-project";
import { estimateHeight, HEIGHT_LIMITS } from "./estimate-height";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const FONT_DIR = path.join(PUBLIC_DIR, "fonts");

// A4 in PDF points (72 dpi). Source PNG is rendered at 1080 px wide and
// scaled to fit A4 width — slice height in source pixels = 1080 / (W/H).
const A4_W_PT = 595;
const A4_H_PT = 842;
const RENDER_WIDTH_PX = 1080;
const PDF_PAGE_SLICE_PX = Math.round(RENDER_WIDTH_PX / (A4_W_PT / A4_H_PT));

type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
};

type AssetCache = {
  fonts: SatoriFont[];
  logoDataUrl: string;
};

let assetCache: AssetCache | null = null;

async function loadAssets(): Promise<AssetCache> {
  if (assetCache) return assetCache;

  const [regular, semibold, bold, logoBuf] = await Promise.all([
    readFontIfExists("Montserrat-Regular.ttf", 400),
    readFontIfExists("Montserrat-SemiBold.ttf", 600),
    readFontIfExists("Montserrat-Bold.ttf", 700),
    fs.readFile(path.join(PUBLIC_DIR, "logo-ColombiAndo.png")),
  ]);

  const fonts: SatoriFont[] = [regular, semibold, bold].filter(
    (f): f is SatoriFont => f !== null,
  );

  const logoDataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;

  assetCache = { fonts, logoDataUrl };
  return assetCache;
}

async function readFontIfExists(
  filename: string,
  weight: 400 | 600 | 700,
): Promise<SatoriFont | null> {
  try {
    const buf = await fs.readFile(path.join(FONT_DIR, filename));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return { name: "Montserrat", data: ab, weight, style: "normal" };
  } catch {
    // Locked invariant (never-fail-on-font-load): missing font must not fail
    // the share request. Log so the operator notices, fall back to system stack.
    console.warn(`[share-render] font fallback: weight ${weight} (${filename}) unavailable`);
    return null;
  }
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDateEs(d: Date): string {
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

export type RenderResult = {
  buffer: Buffer;
  contentType: "image/png" | "application/pdf";
  filenameSlug: string;
};

export async function renderShare(
  data: ShareData,
  format: "image" | "pdf",
): Promise<RenderResult> {
  const assets = await loadAssets();
  const heightInfo = estimateHeight(data);

  // Image format respects the hard cap (clips long projects); PDF takes the
  // full estimated height across multiple A4 pages.
  const renderHeight =
    format === "image" && heightInfo.hardCapped ? HEIGHT_LIMITS.HARD_CAP : heightInfo.estimated;

  const png = await renderPng(data, assets, heightInfo.softCapped, renderHeight);

  if (format === "image") {
    return {
      buffer: png,
      contentType: "image/png",
      filenameSlug: data.project.titulo,
    };
  }

  const pdfBuf = await renderPdf(png, renderHeight);
  return {
    buffer: pdfBuf,
    contentType: "application/pdf",
    filenameSlug: data.project.titulo,
  };
}

async function renderPng(
  data: ShareData,
  assets: AssetCache,
  softCapped: boolean,
  heightPx: number,
): Promise<Buffer> {
  const { default: satori } = await import("satori");
  const { Resvg } = await import("@resvg/resvg-js");

  const svg = await satori(
    <Infographic
      data={data}
      logoDataUrl={assets.logoDataUrl}
      generatedAtLabel={formatDateEs(new Date())}
      softCapped={softCapped}
    />,
    {
      width: RENDER_WIDTH_PX,
      height: heightPx,
      fonts: assets.fonts,
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: RENDER_WIDTH_PX },
  });
  return Buffer.from(resvg.render().asPng());
}

async function renderPdf(png: Buffer, totalHeightPx: number): Promise<Buffer> {
  const { PDFDocument } = await import("pdf-lib");

  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedPng(png);

  // Scale PNG width 1080 px → A4 width 595 pt. Scaled image height in pt:
  const scaledHeightPt = totalHeightPx * (A4_W_PT / RENDER_WIDTH_PX);
  const pageCount = Math.max(1, Math.ceil(scaledHeightPt / A4_H_PT));

  // For page i (0-indexed from top), the image's bottom-left y in page coords
  // is (i + 1) * A4_H_PT - scaledHeightPt. Derivation:
  //   - Stack pages bottom-to-top; total stack height = pageCount * A4_H_PT
  //   - Image's bottom-left in stack coords sits at pageCount*A4_H_PT - scaledHeightPt
  //   - Page i's bottom in stack coords: (pageCount - 1 - i) * A4_H_PT
  //   - Subtract → (i + 1) * A4_H_PT - scaledHeightPt
  // pdf-lib clips drawing to page bounds automatically, so the parts of the
  // image outside the visible page are just not rendered — cheaper than slicing.
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([A4_W_PT, A4_H_PT]);
    page.drawImage(embedded, {
      x: 0,
      y: (i + 1) * A4_H_PT - scaledHeightPt,
      width: A4_W_PT,
      height: scaledHeightPt,
    });
  }

  return Buffer.from(await pdf.save());
}

export const __test = {
  PDF_PAGE_SLICE_PX,
  A4_W_PT,
  A4_H_PT,
  RENDER_WIDTH_PX,
  renderPdf,
  renderPng,
  loadAssets,
};
