#!/usr/bin/env node
import puppeteer from 'puppeteer-core';
import { createInterface } from 'readline';

const BASE = process.env.MAGENTO_BASE_URL || 'https://test.pandz.in';
const ADMIN = BASE + '/notoms';
const EXCLUDE_DATES = (process.env.EXCLUDE_DATES || '15-07-2026,16-07-2026').split(',');
const LIGHTPANDA_WS = process.env.LIGHTPANDA_WS || 'ws://127.0.0.1:9222';
const STORE_PUNE_ID = process.env.STORE_PUNE_ID;
const STORE_MUMBAI_ID = process.env.STORE_MUMBAI_ID;

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, a => { rl.close(); resolve(a); }));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitFor(page, selector, timeout = 30000) {
  for (let i = 0; i < timeout / 500; i++) {
    try {
      const el = await page.$(selector);
      if (el) return el;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timeout waiting for ${selector}`);
}

(async () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Magento SalesIgniter — Blackout via Lightpanda║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  console.log(`Dates: ${EXCLUDE_DATES.join(', ')}`);
  console.log(`Admin: ${ADMIN}`);
  console.log(`Lightpanda: ${LIGHTPANDA_WS}\n`);

  const browser = await puppeteer.connect({ browserWSEndpoint: LIGHTPANDA_WS });
  const page = await browser.newPage();

  try {
    // ── Step 1: Navigate to admin login ──
    console.log('1. Navigating to admin login...');
    await page.goto(ADMIN, { waitUntil: 'networkidle0', timeout: 30000 });
    const pageTitle = await page.title();
    console.log(`   Page title: ${pageTitle}`);

    // Check if we hit Cloudflare or got the login page
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '');
    if (bodyText.includes('captcha') || bodyText.includes('Checking your browser')) {
      console.log('   ⚠️  Cloudflare captcha triggered — manual intervention needed.');
      const bypass = await prompt('   Press Enter after completing the captcha in the browser window...');
    }

    // ── Step 2: Fill login form ──
    console.log('2. Filling login form...');
    const usernameInput = await waitFor(page, '#username');
    const passwordInput = await waitFor(page, '#login');
    await usernameInput.type('kapilt');
    await passwordInput.type('3OCArt&rpi4%j');
    await page.click('.action-login');

    // ── Step 3: Wait for 2FA page ──
    console.log('3. Waiting for 2FA page...');
    await sleep(3000);
    const afterLogin = await page.evaluate(() => ({
      title: document.title,
      tfaVisible: !!document.querySelector('input#tfa-otp,input[name="otp"],input.google-otp'),
      otpInput: !!document.querySelector('input[type="text"]:not(#username):not(#login)'),
    }));
    console.log(`   After login: ${JSON.stringify(afterLogin)}`);

    if (afterLogin.otpInput || afterLogin.tfaVisible) {
      const otp = await prompt('   Enter Google Authenticator TOTP code: ');
      const otpField = await page.$('input#tfa-otp,input[name="otp"],input.google-otp,input[type="text"]:not(#username):not(#login)');
      if (otpField) {
        await otpField.type(otp);
        await page.click('button.primary,.action-primary,button[type=submit]');
        console.log('   TOTP submitted.');
      }
    }

    // ── Step 4: Verify logged in ──
    console.log('4. Verifying login...');
    await sleep(3000);
    const loggedIn = await page.evaluate(() => !!document.querySelector('.admin__menu'));
    if (!loggedIn) {
      const curTitle = await page.title();
      const curText = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '');
      console.log(`   Title: ${curTitle}`);
      console.log(`   Body: ${curText}`);
      const retry = await prompt('   Login may have failed. Press Enter to retry or Ctrl+C to abort...');
    }
    console.log('   ✅ Logged in.\n');

    // ── Step 5: Get store IDs ──
    const puneId = STORE_PUNE_ID;
    const mumbaiId = STORE_MUMBAI_ID;
    if (!puneId || !mumbaiId) {
      console.log('5. Discovering store IDs...');
      await page.goto(ADMIN + '/admin/system_store/index/', { waitUntil: 'networkidle0', timeout: 15000 });
      const stores = await page.evaluate(() => {
        const rows = document.querySelectorAll('table#storeGrid_table tbody tr');
        return Array.from(rows).map(tr => {
          const tds = tr.querySelectorAll('td');
          if (tds.length < 4) return null;
          const name = tds[1]?.textContent?.trim() || '';
          const type = tds[2]?.textContent?.trim() || '';
          const link = tds[1]?.querySelector('a')?.href || '';
          const id = link.match(/store\/(\d+)/)?.[1] || '';
          return { name, type, id };
        }).filter(Boolean);
      });
      console.log(`   Found stores: ${JSON.stringify(stores, null, 2)}`);

      const views = stores.filter(s => s.type === 'Store View');
      const pune = views.find(s => s.name.toLowerCase().includes('pune'));
      const mumbai = views.find(s => s.name.toLowerCase().includes('mumbai'));

      if (!pune || !mumbai) {
        console.error('   Could not find Pune/Mumbai store views.');
        console.error(`   Found: ${views.map(s => s.name).join(', ') || 'none'}`);
        await prompt('   Set STORE_PUNE_ID and STORE_MUMBAI_ID env vars and re-run. Press Enter to exit.');
        process.exit(1);
      }
      STORE_PUNE_ID = pune.id;
      STORE_MUMBAI_ID = mumbai.id;
      STORE_PUNE_NAME = pune.name;
      STORE_MUMBAI_NAME = mumbai.name;
      console.log(`   📍 Pune: ${pune.name} (ID ${pune.id}), Mumbai: ${mumbai.name} (ID ${mumbai.id})\n`);
    } else {
      STORE_PUNE_NAME = 'Pune';
      STORE_MUMBAI_NAME = 'Mumbai';
      console.log(`5. Using env vars: Pune ID=${puneId}, Mumbai ID=${mumbaiId}\n`);
    }

    // ── Step 6: Configure each store ──
    for (const { name, id, label } of [
      { name: 'pune', id: puneId || STORE_PUNE_ID, label: STORE_PUNE_NAME },
      { name: 'mumbai', id: mumbaiId || STORE_MUMBAI_ID, label: STORE_MUMBAI_NAME },
    ]) {
      console.log(`\n─────────────────────────────────────────────────`);
      console.log(`Configuring ${label} (ID: ${id})...`);

      // Navigate to rental settings page to get form_key
      console.log(`   Navigating to rental settings...`);
      await page.goto(`${ADMIN}/admin/system_config/edit/section/rental_settings/?store=${id}`, {
        waitUntil: 'networkidle0', timeout: 15000
      });

      // Extract form_key
      const fKey = await page.evaluate(() => {
        const fk = document.querySelector('input[name=form_key]');
        return fk ? fk.value : null;
      });
      if (!fKey) {
        console.error(`   ❌ Could not find form_key on settings page for ${label}.`);
        const title = await page.title();
        console.error(`   Page: ${title}`);
        continue;
      }
      console.log(`   form_key: ${fKey}`);

      // POST the config save
      const result = await page.evaluate(({ fKey, dates, storeId, base, admin }) => {
        return fetch(`${base}/notoms/admin/system_config/save/section/rental_settings/?store=${storeId}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            'form_key': fKey,
            ...Object.fromEntries(dates.map(d => [`groups[general][fields][excludedates][value][]`, d])),
            'groups[general][fields][excludedates][inherit]': '0',
          }).toString(),
        }).then(async resp => {
          if (resp.redirected && !resp.url.includes('section/rental_settings')) {
            return { ok: true, redirected: resp.url.slice(-60) };
          }
          const text = await resp.text();
          const hasSuccess = text.includes('message-success') || text.includes('saved') || text.includes('The configuration has been saved');
          return {
            ok: hasSuccess,
            snippet: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
          };
        }).catch(e => ({ ok: false, error: e.message }));
      }, { fKey, dates: EXCLUDE_DATES, storeId: id, base: BASE, admin: ADMIN });

      if (result.ok) {
        console.log(`   ✅ ${label} — blackout dates saved!`);
        if (result.redirected) console.log(`      Redirect: ...${result.redirected}`);
      } else {
        console.log(`   ❌ ${label} — failed`);
        console.log(`      ${result.error || result.snippet}`);
      }
    }

    // ── Done ──
    console.log(`\n─────────────────────────────────────────────────`);
    console.log(`✅ All done!`);
    console.log(`   Dates: ${EXCLUDE_DATES.join(', ')}`);
    console.log(`   Remember to flush config cache if not visible:`);
    console.log(`   Admin → System → Cache Management → Flush Config Cache`);
    console.log(``);

  } catch (err) {
    console.error(`\n❌ Fatal: ${err.message}`);
    console.error(err.stack);
  } finally {
    await browser.disconnect();
    process.exit(0);
  }
})();
