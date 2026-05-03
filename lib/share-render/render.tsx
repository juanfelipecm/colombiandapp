import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Infographic } from "@/components/share/Infographic";
import type { ShareData } from "./load-project";
import { estimateHeight, HEIGHT_LIMITS } from "./estimate-height";
import { getBrowser } from "./browser";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const FONT_DIR = path.join(PUBLIC_DIR, "fonts");

type AssetCache = {
  cssBase: string;
  fontFaceCss: string;
  logoDataUrl: string;
};

let assetCache: AssetCache | null = null;

async function loadAssets(): Promise<AssetCache> {
  if (assetCache) return assetCache;

  const [cssBase, regular, semibold, bold, logoBuf] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "lib/share-render/share.css"), "utf8"),
    readFontIfExists("Montserrat-Regular.ttf"),
    readFontIfExists("Montserrat-SemiBold.ttf"),
    readFontIfExists("Montserrat-Bold.ttf"),
    fs.readFile(path.join(PUBLIC_DIR, "logo-ColombiAndo.png")),
  ]);

  const fontFaceCss = [
    fontFace("Montserrat", 400, regular),
    fontFace("Montserrat", 600, semibold),
    fontFace("Montserrat", 700, bold),
  ]
    .filter(Boolean)
    .join("\n");

  const logoDataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;

  assetCache = { cssBase, fontFaceCss, logoDataUrl };
  return assetCache;
}

async function readFontIfExists(filename: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(FONT_DIR, filename));
  } catch {
    return null;
  }
}

function fontFace(family: string, weight: number, buf: Buffer | null): string {
  if (!buf) return "";
  const b64 = buf.toString("base64");
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDateEs(d: Date): string {
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

async function buildHtml(
  data: ShareData,
  assets: AssetCache,
  softCapped: boolean,
): Promise<string> {
  // Dynamic import keeps react-dom/server out of any browser-targeted bundle
  // Next might attempt to build for this module's transitive consumers.
  const { renderToString } = await import("react-dom/server");
  const body = renderToString(
    <Infographic
      data={data}
      logoDataUrl={assets.logoDataUrl}
      generatedAtLabel={formatDateEs(new Date())}
      softCapped={softCapped}
    />,
  );
  const altText = `Plan de proyecto: ${data.project.titulo}. Pregunta guía: ${data.project.pregunta_guia}.`;
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(altText)}</title>
<style>${assets.fontFaceCss}\n${assets.cssBase}</style>
</head><body>${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const html = await buildHtml(data, assets, heightInfo.softCapped);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for fonts. If they don't load, the CSS fallback stack ('Helvetica
    // Neue', Arial) renders. Locked in plan-eng-review: never fail on fonts.
    const fontsOk: boolean = await page
      .evaluate(async () => {
        try {
          await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
          return (
            (document as Document & { fonts: { check: (s: string) => boolean } }).fonts.check(
              "700 16px Montserrat",
            ) === true
          );
        } catch {
          return false;
        }
      })
      .catch(() => false);

    if (!fontsOk) {
      console.warn(
        `[share-render] Montserrat fonts did not register; falling back to system stack`,
      );
    }

    if (format === "image") {
      const rawBuf = (await page.screenshot({
        fullPage: true,
        type: "png",
        captureBeyondViewport: true,
        clip: heightInfo.hardCapped
          ? { x: 0, y: 0, width: 1080, height: HEIGHT_LIMITS.HARD_CAP }
          : undefined,
      })) as Buffer | Uint8Array;
      const buffer = Buffer.isBuffer(rawBuf) ? rawBuf : Buffer.from(rawBuf);
      return {
        buffer,
        contentType: "image/png",
        filenameSlug: data.project.titulo,
      };
    }

    const rawPdf = (await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    })) as Buffer | Uint8Array;
    const buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);
    return {
      buffer,
      contentType: "application/pdf",
      filenameSlug: data.project.titulo,
    };
  } finally {
    await page.close().catch(() => {});
  }
}
