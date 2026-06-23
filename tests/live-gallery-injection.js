const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const SCREENSHOT_PATH = '/tmp/opug-gallery-injection.png';

function loadEnv() {
  const env = {};
  const text = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

async function main() {
  const env = loadEnv();
  if (!env.OPU_EMAIL || !env.OPU_PASSWORD) {
    throw new Error('OPU_EMAIL and OPU_PASSWORD must be set in .env.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const warnings = [];
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto('https://opu.peklo.biz/?page=prihlaseni', { waitUntil: 'domcontentloaded' });
    const loginForm = page.locator('form').filter({ has: page.locator('input[name="heslo"]') }).first();
    await loginForm.locator('input[name="email"]').fill(env.OPU_EMAIL);
    await loginForm.locator('input[name="heslo"]').fill(env.OPU_PASSWORD);
    await loginForm.locator('input[name="permanentlogin"][type="checkbox"]').check();
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      loginForm.locator('input[name="tl_prihlasit"]').click()
    ]);

    await page.goto('https://opu.peklo.biz/?page=userpanel', { waitUntil: 'domcontentloaded' });
    const loginFormCount = await page.locator('input[name="heslo"]').count();
    if (loginFormCount > 0) throw new Error('Login did not reach the user panel.');

    await page.addScriptTag({ path: path.join(ROOT, 'OPUg.user.js') });
    await page.locator('#opug-panel').waitFor({ state: 'visible', timeout: 10000 });

    const boxCount = await page.locator('.box, .boxtop').count();
    const testTag = `smoke-${Date.now()}`;
    await page.evaluate((tag) => {
      localStorage.removeItem('opug_upload_index_v1');
      document.querySelector('.box input[type="checkbox"][name^="item"], .boxtop input[type="checkbox"][name^="item"]')?.click();
      document.getElementById('opug-tags').value = tag;
    }, testTag);
    await page.locator('#opug-tag-selected').click();
    await page.waitForFunction(() => /Saved 1\./.test(document.getElementById('opug-status')?.textContent || ''), null, { timeout: 10000 });
    await page.locator('#opug-search').click();
    await page.locator('.opug-result').first().waitFor({ state: 'visible', timeout: 10000 });

    const panelText = await page.locator('#opug-panel').innerText();
    const tagButtonVisible = await page.locator('#opug-tag-selected').isVisible();
    const searchButtonVisible = await page.locator('#opug-search').isVisible();
    const resultCount = await page.locator('.opug-result').count();
    const statusText = await page.locator('#opug-status').innerText();
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });

    console.log(`url=${page.url()}`);
    console.log(`title=${JSON.stringify(await page.title())}`);
    console.log(`galleryBoxes=${boxCount}`);
    console.log(`panelText=${JSON.stringify(panelText.replace(/\s+/g, ' ').trim())}`);
    console.log(`tagButtonVisible=${tagButtonVisible}`);
    console.log(`searchButtonVisible=${searchButtonVisible}`);
    console.log(`localTag=${testTag}`);
    console.log(`resultCount=${resultCount}`);
    console.log(`statusText=${JSON.stringify(statusText)}`);
    console.log(`warnings=${warnings.length}`);
    console.log(`errors=${errors.length}`);
    console.log(`screenshot=${SCREENSHOT_PATH}`);

    if (boxCount < 1) throw new Error('No OPU gallery boxes found after login.');
    if (!tagButtonVisible || !searchButtonVisible) throw new Error('OPUg controls are not visible.');
    if (resultCount < 1) throw new Error('Local tag search returned no rendered results.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
