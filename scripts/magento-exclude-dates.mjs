#!/usr/bin/env node
/**
 * Magento SalesIgniter — Set Excluded Dates (Browser Automation)
 *
 * Opens Chrome via browser-harness, you log in manually (captcha + 2FA),
 * then the script navigates to Rentals → Settings → General and adds
 * the configured exclude dates, then saves.
 *
 * Usage:
 *   node scripts/magento-exclude-dates.mjs
 *
 * Config via env:
 *   MAGENTO_BASE_URL   default: https://test.pandz.in/notoms
 *   EXCLUDE_DATES      default: 15-07-2026,16-07-2026
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

const BASE_URL = process.env.MAGENTO_BASE_URL || 'https://test.pandz.in/notoms';
const ADMIN_URL = BASE_URL + '/admin/dashboard/';
const EXCLUDE_DATES = (process.env.EXCLUDE_DATES || '15-07-2026,16-07-2026').split(',');
const SESSION_FILE = './magento-session.json';

function bh(code) {
  return execSync(
    `browser-harness -c ${JSON.stringify(code)}`,
    { stdio: 'pipe', timeout: 30000 }
  ).toString().trim();
}

function ensureDaemon() {
  try { bh('print("ok")'); }
  catch {
    console.log('Starting browser-harness daemon...');
    execSync('browser-harness -c "print(\'started\')"', { stdio: 'pipe', timeout: 30000 });
  }
}

(async () => {
  ensureDaemon();

  console.log(`Exclude dates to add: ${EXCLUDE_DATES.join(', ')}`);
  console.log(`Target: ${ADMIN_URL}\n`);

  // ── Step 1: Login ──
  let curTab = JSON.parse(bh(`import json; t = current_tab(); print(json.dumps(t))`));
  console.log(`Current tab: ${curTab.title || '(no title)'}`);

  console.log('Opening admin tab...');
  bh(`new_tab(${JSON.stringify(ADMIN_URL)})`);

  // ── Step 2: Wait for admin menu (user completes login manually) ──
  const pollLogin = tmpdir() + '/magento-exclude-poll-' + process.pid + '.py';
  writeFileSync(pollLogin, `import json, time, sys

for i in range(180):
    time.sleep(1)
    try:
        has_admin = js('!!document.querySelector(".admin__menu")')
    except:
        has_admin = False
    if has_admin:
        print("ADMIN_MENU_DETECTED")
        break
    try:
        info = page_info()
        url = info.get("url", "")[:80]
        title = info.get("title", "")
        print(f"[{i}s] {title or url}")
    except:
        print(f"[{i}s] waiting...")
else:
    print("TIMEOUT")
    sys.exit(1)
`);

  execSync(`browser-harness -c "exec(open('${pollLogin}').read())"`, { stdio: 'inherit', timeout: 600000 });
  try { unlinkSync(pollLogin); } catch {}

  console.log('\nLogged in! Navigating to Rentals → Settings...\n');

  // ── Step 3: Navigate to Rentals → Settings ──
  const settingsUrl = BASE_URL + '/admin/system_config/edit/section/rental_settings/';
  bh(`new_tab(${JSON.stringify(settingsUrl)})`);
  console.log(`Opened settings at ${settingsUrl}`);

  // Wait for the settings page to load
  const pollSettings = tmpdir() + '/magento-exclude-settings-' + process.pid + '.py';
  writeFileSync(pollSettings, `import json, time, sys

for i in range(60):
    time.sleep(1)
    try:
        has_form = js('!!document.getElementById("config-edit-form") || !!document.querySelector("form")')
    except:
        has_form = False
    if has_form:
        print("SETTINGS_LOADED")
        break
    try:
        info = page_info()
        print(f"[{i}s] {info.get('title', '')[:80]}")
    except:
        print(f"[{i}s] waiting...")
else:
    print("TIMEOUT")
    sys.exit(1)
`);

  execSync(`browser-harness -c "exec(open('${pollSettings}').read())"`, { stdio: 'inherit', timeout: 120000 });
  try { unlinkSync(pollSettings); } catch {}

  console.log('Settings loaded.\n');

  // ── Step 4: Get form key from cookies ──
  const rawCookies = bh(`
import json
cookies = cdp("Network.getAllCookies").get("cookies", [])
relevant = [c for c in cookies if 'pandz' in c.get("domain", "")]
print(json.dumps(relevant if relevant else cookies))
  `);
  const cookies = JSON.parse(rawCookies);
  const formKey = cookies.find(c => c.name === 'form_key')?.value;
  if (!formKey) {
    console.log('No form_key cookie found. Will need to navigate manually.');
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`MANUAL STEPS:`);
    console.log(`1. Go to: ${settingsUrl}`);
    console.log(`2. Expand "General" section (or "Dates Exclusion")`);
    console.log(`3. Find "Excluded Dates" field`);
    console.log(`4. Add: ${EXCLUDE_DATES.join(', ')}`);
    console.log(`5. Click Save Config`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    process.exit(0);
  }

  // ── Step 5: Read current excluded dates ──
  const currentVal = JSON.parse(bh(`
import json
try:
    el = js('document.querySelector("[name=\\"groups[general][fields][excludedates][value][]\\"]")')
    if el is None:
        el = js('document.querySelector("input[id*=\\"excludedates\\"]")')
    val = el.get_attribute("value") if el else None
    print(json.dumps(val or ""))
except Exception as e:
    print(json.dumps(f"error: {e}"))
  `));

  console.log(`Current excluded dates: ${currentVal || '(empty)'}`);

  // ── Step 6: Add new dates ──
  const existing = currentVal ? currentVal.split(',').map(s => s.trim()).filter(Boolean) : [];
  const toAdd = EXCLUDE_DATES.filter(d => !existing.includes(d));

  if (toAdd.length === 0) {
    console.log('All dates already excluded. Nothing to do.');
    process.exit(0);
  }

  const merged = [...existing, ...toAdd].join(', ');
  console.log(`Setting excluded dates to: ${merged}`);

  bh(`
import json
dates = ${JSON.stringify(merged)}
el = js('document.querySelector("[name=\\"groups[general][fields][excludedates][value][]\\"]")')
if el is None:
    el = js('document.querySelector("input[id*=\\"excludedates\\"]")')
    if el is None:
        print("FIELD_NOT_FOUND")
    else:
        js(f'arguments[0].value = "{dates}"', el)
        print("SET_OK")
else:
    js(f'arguments[0].value = {json.dumps(merged)}', el)
    print("SET_OK")
  `);

  console.log('Excluded dates updated in the form.\n');

  // ── Step 7: Save ──
  console.log('Clicking Save Config...');
  bh(`
btn = js("document.querySelector('#save') || document.querySelector('button.save') || document.querySelector('[data-ui-id=\\"page-actions-toolbar-save-button\\"]')")
if btn:
    js("arguments[0].click()", btn)
    print("SAVE_CLICKED")
else:
    print("SAVE_BUTTON_NOT_FOUND")
  `);

  console.log('Waiting for save to complete...');
  const pollSave = tmpdir() + '/magento-exclude-save-' + process.pid + '.py';
  writeFileSync(pollSave, `import time, sys

for i in range(30):
    time.sleep(2)
    try:
        msg = js('document.querySelector(".message-success") ? document.querySelector(".message-success").textContent.trim() : ""')
    except:
        msg = ""
    if msg:
        print(f"SUCCESS: {msg}")
        break
    try:
        err = js('document.querySelector(".message-error") ? document.querySelector(".message-error").textContent.trim() : ""')
    except:
        err = ""
    if err:
        print(f"ERROR: {err}")
        sys.exit(1)
    print(f"[{i*2}s] waiting for save...")
else:
    print("TIMEOUT - check the admin tab manually")
`);

  execSync(`browser-harness -c "exec(open('${pollSave}').read())"`, { stdio: 'inherit', timeout: 120000 });
  try { unlinkSync(pollSave); } catch {}

  console.log('\nDone! Remember to flush config cache if changes are not visible.');

  // Export session
  const raw = bh(`
import json
cookies = cdp("Network.getAllCookies").get("cookies", [])
relevant = [c for c in cookies if 'pandz' in c.get("domain", "")]
print(json.dumps(relevant if relevant else cookies))
  `);
  const finalCookies = JSON.parse(raw);
  if (finalCookies.length) {
    const ss = {
      cookies: finalCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        expires: c.expires || -1, httpOnly: c.httpOnly || false, secure: c.secure || false,
        sameSite: (c.sameSite || 'None').charAt(0).toUpperCase() + (c.sameSite || 'None').slice(1).toLowerCase(),
      })),
      origins: [],
    };
    writeFileSync(SESSION_FILE, JSON.stringify(ss, null, 2));
    console.log(`Session saved to ${SESSION_FILE}`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
