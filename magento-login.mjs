#!/usr/bin/env node
/**
 * Magento Admin Login Helper
 *
 * Uses browser-harness (your real Chrome) to navigate to admin, wait for
 * login + 2FA, then export the session as Playwright storage state.
 *
 * Usage:  node magento-login.mjs
 *         MAGENTO_PASSWORD=xxx node magento-login.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

const BASE_URL = process.env.MAGENTO_BASE_URL || 'https://primesandzooms.com/notoms';
const ADMIN_URL = BASE_URL + '/admin/dashboard/';
const PW = process.env.MAGENTO_PASSWORD || '';

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

  const curTab = JSON.parse(bh(`import json; t = current_tab(); print(json.dumps(t))`));
  console.log(`Current tab: ${curTab.title || '(no title)'}`);

  console.log(`Opening admin tab...`);
  bh(`new_tab(${JSON.stringify(ADMIN_URL)})`);
  console.log('Waiting for you to log in. Complete this in Chrome.\n');

  // Write poll script to temp file to avoid shell escaping issues
  const pollFile = tmpdir() + '/magento-login-poll-' + process.pid + '.py';
  writeFileSync(pollFile, `import json, time, sys

password = ${JSON.stringify(PW)}

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
        has_login = js('!!document.querySelector("#username")')
    except:
        has_login = False

    if has_login:
        if password:
            try:
                safe = json.dumps(password)
                js('document.querySelector("#login").focus()')
                js(f'document.querySelector("#login").value = {safe}')
                print(f"[{i}s] Password filled. Click Sign In + complete 2FA.")
            except Exception as e:
                print(f"[{i}s] Password fill error: {e}")
        else:
            print(f"[{i}s] Login form visible - sign in + complete 2FA")
    else:
        info = page_info()
        url = info.get("url", "")[:80]
        title = info.get("title", "")
        print(f"[{i}s] {title or url}")

else:
    print("TIMEOUT")
    sys.exit(1)
`);

  execSync(`browser-harness -c "exec(open('${pollFile}').read())"`, { stdio: 'inherit', timeout: 600000 });
  try { unlinkSync(pollFile); } catch {}

  console.log('\nExporting session...');
  const raw = bh(`
import json
cookies = cdp("Network.getAllCookies").get("cookies", [])
relevant = [c for c in cookies if 'primesandzooms' in c.get("domain", "")]
print(json.dumps(relevant if relevant else cookies))
  `);

  const cookies = JSON.parse(raw);
  if (!Array.isArray(cookies) || cookies.length === 0) {
    console.error('No cookies found. Session may not be valid.');
    process.exit(1);
  }

  const expiryMax = Math.max(...cookies.map(c => c.expires || 0), 0);
  const ss = {
    cookies: cookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
      expires: c.expires || -1, httpOnly: c.httpOnly || false, secure: c.secure || false,
      sameSite: (c.sameSite || 'None').charAt(0).toUpperCase() + (c.sameSite || 'None').slice(1).toLowerCase(),
    })),
    origins: [],
  };

  writeFileSync('./magento-session.json', JSON.stringify(ss, null, 2));
  console.log(`\nDone — ${ss.cookies.length} cookies saved to magento-session.json`);
  console.log(`Expiry: ${expiryMax ? new Date(expiryMax * 1000).toISOString() : 'session'}`);
})().catch(e => { console.error(e.message); process.exit(1); });
