const { chromium, firefox } = require('playwright');

async function run(browserType, name) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const messages = [];
  page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`));

  try {
    await page.goto('https://opu.peklo.biz/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    const fileInputCount = await page.locator('#obrazek').count();
    const uploadFormCount = await page.locator('form#xpc').count();
    console.log(`${name}: title=${JSON.stringify(title)} fileInput=${fileInputCount} uploadForm=${uploadFormCount}`);
    if (!/Okoun Picture Uploader/i.test(title)) throw new Error(`${name}: unexpected title`);
    if (fileInputCount !== 1) throw new Error(`${name}: #obrazek missing`);
    if (uploadFormCount !== 1) throw new Error(`${name}: form#xpc missing`);
  } finally {
    await browser.close();
  }

  if (messages.length) {
    console.log(`${name}: console messages=${messages.length}`);
  }
}

(async () => {
  await run(chromium, 'chromium');
  await run(firefox, 'firefox');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
