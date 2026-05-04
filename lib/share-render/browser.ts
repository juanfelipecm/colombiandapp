import "server-only";
import type { Browser } from "puppeteer-core";

// Singleton browser instance reused across invocations within a warm Vercel
// function. Locked in plan-eng-review: dev uses puppeteer (bundled chromium),
// prod uses puppeteer-core + @sparticuz/chromium. Selected via process.env.VERCEL.
// NOTE: @sparticuz/chromium@131 only sets up LD_LIBRARY_PATH on Node 20.x/22.x
// runtimes; on Node 24+ the al2023 libs aren't extracted and chromium fails to
// find libnss3.so. package.json pins engines.node to 22.x — drop the pin once
// @sparticuz/chromium adds newer Node support.

// Cache the launch *promise*, not the resolved browser, so concurrent callers
// (e.g. prewarm + real render arriving back-to-back) await the same launch
// instead of racing two chromium.br extractions into /tmp/chromium and hitting
// ETXTBSY when one spawn fires while the other write is still open.
let pending: Promise<Browser> | null = null;

function isProd(): boolean {
  // VERCEL is "1" in Vercel runtimes (build, preview, prod). Any of those
  // require @sparticuz/chromium since they ship without a local Chromium.
  return process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

async function launch(): Promise<Browser> {
  if (isProd()) {
    process.env.AWS_EXECUTION_ENV ??= "AWS_Lambda_nodejs22.x";
    const { default: chromium } = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");
    const { existsSync, readdirSync } = await import("node:fs");

    const execPath = await chromium.executablePath();
    const libDir = "/tmp/al2023/lib";
    console.log(
      "[share-render] launch state:",
      JSON.stringify({
        node: process.version,
        AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
        LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
        execPath,
        execExists: existsSync(execPath),
        libDirExists: existsSync(libDir),
        libnss3Exists: existsSync(`${libDir}/libnss3.so`),
        libDirContents: existsSync(libDir) ? readdirSync(libDir).slice(0, 5) : null,
      }),
    );

    return (await puppeteer.launch({
      args: chromium.args,
      executablePath: execPath,
      headless: chromium.headless,
      defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    })) as unknown as Browser;
  }
  // Dev: puppeteer ships with its own Chromium binary.
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
  })) as unknown as Browser;
}

export async function getBrowser(): Promise<Browser> {
  if (pending) {
    try {
      const browser = await pending;
      // puppeteer connection can drop between invocations on cold->warm transitions.
      // .version() is the cheapest probe that round-trips to the browser.
      await browser.version();
      return browser;
    } catch {
      pending = null;
    }
  }

  pending = launch();
  try {
    return await pending;
  } catch (err) {
    pending = null;
    throw err;
  }
}
