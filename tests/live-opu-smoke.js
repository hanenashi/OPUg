const { chromium, firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = '/tmp/opug-smoke-original-name.jpg';

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
    await page.addScriptTag({ path: path.join(ROOT, 'OPUg.user.js') });
    await page.locator('#opug-upload-tags').waitFor({ state: 'visible', timeout: 10000 });
    fs.writeFileSync(FIXTURE, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await page.locator('#obrazek').setInputFiles({ name: 'Original Fancy Name.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(FIXTURE) });
    const uploadTagValue = await page.locator('#opug-upload-tags input').inputValue();
    console.log(`${name}: title=${JSON.stringify(title)} fileInput=${fileInputCount} uploadForm=${uploadFormCount} uploadTags=${JSON.stringify(uploadTagValue)}`);
    if (!/Okoun Picture Uploader/i.test(title)) throw new Error(`${name}: unexpected title`);
    if (fileInputCount !== 1) throw new Error(`${name}: #obrazek missing`);
    if (uploadFormCount !== 1) throw new Error(`${name}: form#xpc missing`);
    if (uploadTagValue !== 'original-fancy-name') throw new Error(`${name}: upload tag default did not use original filename`);
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
