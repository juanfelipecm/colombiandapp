import "server-only";
import type { Browser } from "puppeteer-core";

// Singleton browser instance reused across invocations within a warm Vercel
// function. Locked in plan-eng-review: dev uses puppeteer (bundled chromium),
// prod uses puppeteer-core + @sparticuz/chromium. Selected via process.env.VERCEL.

let cached: Browser | null = null;

function isProd(): boolean {
  // VERCEL is "1" in Vercel runtimes (build, preview, prod). Any of those
  // require @sparticuz/chromium since they ship without a local Chromium.
  return process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

export async function getBrowser(): Promise<Browser> {
  if (cached) {
    try {
      // puppeteer connection can drop between invocations on cold->warm transitions.
      // .version() is the cheapest probe that round-trips to the browser.
      await cached.version();
      return cached;
    } catch {
      cached = null;
    }
  }

  if (isProd()) {
    const { default: chromium } = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");
    cached = (await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    })) as unknown as Browser;
  } else {
    // Dev: puppeteer ships with its own Chromium binary.
    const puppeteer = await import("puppeteer");
    cached = (await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    })) as unknown as Browser;
  }

  return cached;
}
