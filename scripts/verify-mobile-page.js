const [cdpUrl = "http://127.0.0.1:9223", baseUrl = "http://127.0.0.1:8080/"] = process.argv.slice(2);

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH);
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    const page = context.pages().find((candidate) => candidate.url().startsWith(baseUrl));
    if (!page) throw new Error("No se encontro la pestaña de Cine Juntos");

    await page.waitForLoadState("load", { timeout: 15000 });
    await page.waitForFunction(
      () => document.readyState === "complete" && document.title.includes("Cine Juntos") && document.querySelector("main"),
      null,
      { timeout: 15000 },
    );
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      mainVisible: Boolean(document.querySelector("main")),
    }));
    process.stdout.write(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
