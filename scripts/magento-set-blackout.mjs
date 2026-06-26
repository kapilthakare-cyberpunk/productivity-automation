#!/usr/bin/env node
/**
 * Magento SalesIgniter — Set Blackout Dates per Store (Browser Automation)
 *
 * Opens Chrome via browser-harness for manual login (captcha + 2FA).
 * Auto-discovers Pune & Mumbai store IDs, posts excluded dates to the
 * admin config save endpoint for each store.
 *
 * Usage:
 *   node scripts/magento-set-blackout.mjs
 *
 * Config via env:
 *   MAGENTO_BASE_URL   default: https://test.pandz.in/notoms
 *   EXCLUDE_DATES      default: 15-07-2026,16-07-2026
 *   STORE_PUNE_ID      override Pune store view ID (skip auto-detect)
 *   STORE_MUMBAI_ID    override Mumbai store view ID (skip auto-detect)
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

const BASE_URL = process.env.MAGENTO_BASE_URL || 'https://test.pandz.in/notoms';
const ADMIN_DASHBOARD = BASE_URL + '/admin/dashboard/';
const EXCLUDE_DATES = (process.env.EXCLUDE_DATES || '15-07-2026,16-07-2026').split(',');

function bh(code) {
  return execSync(
    `browser-harness -c ${JSON.stringify(code)}`,
    { stdio: 'pipe', timeout: 30000 }
  ).toString().trim();
}

function bhFile(scriptContent, label, opts = {}) {
  const { inherit, timeout } = opts;
  const f = tmpdir() + `/magento-${label}-${process.pid}.py`;
  writeFileSync(f, scriptContent);
  const r = execSync(
    `browser-harness -c "exec(open('${f}').read())"`,
    { stdio: inherit ? 'inherit' : 'pipe', timeout: (timeout || 30) * 1000 + 5000 }
  );
  try { unlinkSync(f); } catch {}
  return r ? r.toString().trim() : '';
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

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Magento SalesIgniter — Blackout Date Config   ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
  console.log(`Dates: ${EXCLUDE_DATES.join(', ')}`);
  console.log(`Admin: ${ADMIN_DASHBOARD}\n`);

  // ── Step 1: Manual Login ──
  const curTab = JSON.parse(bh(`import json; t = current_tab(); print(json.dumps(t))`));
  console.log(`Current tab: ${curTab.title || '(no title)'}`);
  bh(`new_tab(${JSON.stringify(ADMIN_DASHBOARD)})`);
  console.log('Admin opened in new tab. Complete captcha + 2FA login in Chrome.\n');

  bhFile(`
import json, time, sys
for i in range(300):
    time.sleep(1)
    try:
        if js('!!document.querySelector(".admin__menu")'):
            print("LOGGED_IN")
            break
    except:
        pass
    try:
        info = page_info()
        print(f"[{i}s] {info.get('title','')[:60] or info.get('url','')[:60]}")
    except:
        print(f"[{i}s] waiting...")
else:
    print("TIMEOUT")
    sys.exit(1)
`, 'login', { inherit: true, timeout: 300 });
  console.log('✅ Logged in.\n');

  // ── Step 2: Extract form_key ──
  const formKey = JSON.parse(bhFile(`
import json
try:
    key = js('document.querySelector("input[name=form_key]")?.value')
    print(json.dumps(key or ""))
except:
    print('""')
`, 'fk'));

  if (!formKey) {
    console.error('Could not find form_key. Aborting.');
    process.exit(1);
  }
  console.log(`form_key: ${formKey}\n`);

  // ── Step 3: Discover Stores ──
  const PUNE_ID = process.env.STORE_PUNE_ID;
  const MUMBAI_ID = process.env.STORE_MUMBAI_ID;

  if (PUNE_ID && MUMBAI_ID) {
    console.log(`Using env vars: Pune ID=${PUNE_ID}, Mumbai ID=${MUMBAI_ID}\n`);
    await configureStores({ pune: PUNE_ID, mumbai: MUMBAI_ID }, formKey);
  } else {
    console.log('Discovering store structure...\n');

    // Extract admin secret key from current URL
    const secretKey = JSON.parse(bhFile(`
import json
try:
    info = page_info()
    url = info.get("url", "")
    key = url.split("/key/")[1].split("/")[0] if "/key/" in url else ""
    print(json.dumps(key))
except:
    print('""')
`, 'adminkey'));
    const STORE_URL = BASE_URL + '/admin/system_store/index/' + (secretKey ? `key/${secretKey}/` : '');
    console.log(`Navigating to: ${STORE_URL.slice(0, 100)}...`);

    // Navigate via new_tab (which switches context and waits for initial load)
    bh(`new_tab(${JSON.stringify(STORE_URL)})`);

    bhFile(`
import json, time, sys
for i in range(60):
    time.sleep(1)
    try:
        rows = js('document.querySelectorAll("table#storeGrid_table tbody tr")')
        if rows and len(list(rows)) > 0:
            print("STORES_LOADED")
            break
    except:
        pass
    info = page_info()
    title = (info.get('title','') or '')[:40]
    url = (info.get('url','') or '')[:80]
    print(f"[{i}s] {title or url}")
else:
    print("TIMEOUT")
    sys.exit(1)
`, 'stores', { inherit: true, timeout: 90 });

    const storeData = JSON.parse(bhFile(`
import json
try:
    rows = js('''
        Array.from(document.querySelectorAll("table#storeGrid_table tbody tr")).map(tr => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 4) return null;
            const name = tds[1]?.textContent?.trim() || "";
            const type = tds[2]?.textContent?.trim() || "";
            const link = tds[1]?.querySelector("a")?.href || "";
            const id = link.match(/store\\/(\\d+)/)?.[1] || "";
            return { name, type, id };
        }).filter(Boolean)
    ''')
    print(json.dumps(list(rows) if rows else []))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`, 'store-list'));

    if (!Array.isArray(storeData) || storeData.length === 0) {
      console.log('Could not auto-detect store structure.');
      console.log(`Received: ${JSON.stringify(storeData)}`);
      console.log('\nCheck the Stores tab in Chrome and re-run with:');
      console.log('  STORE_PUNE_ID=<id> STORE_MUMBAI_ID=<id> node scripts/magento-set-blackout.mjs\n');
      process.exit(1);
    }

    console.log('\nStore structure:');
    for (const s of storeData) {
      console.log(`  ${s.type.padEnd(18)} ${s.name.padEnd(25)} ID: ${s.id || '-'}`);
    }

    const storeViews = storeData.filter(s => s.type === 'Store View');
    const puneView = storeViews.find(s => s.name.toLowerCase().includes('pune'));
    const mumbaiView = storeViews.find(s => s.name.toLowerCase().includes('mumbai'));

    if (puneView && mumbaiView) {
      console.log(`\n📍 Detected: Pune (ID ${puneView.id}), Mumbai (ID ${mumbaiView.id})`);
      await configureStores({ pune: puneView.id, mumbai: mumbaiView.id }, formKey);
    } else {
      console.log('\n⚠️  Could not auto-detect Pune/Mumbai store views.');
      console.log(`Found: ${storeViews.map(s => s.name).join(', ') || 'none'}`);
      console.log('Re-run with:');
      console.log('  STORE_PUNE_ID=<id> STORE_MUMBAI_ID=<id> node scripts/magento-set-blackout.mjs\n');
      process.exit(1);
    }
  }

  // ── Step 4: Configure Each Store ──
  async function configureStores(stores, fKey) {
    for (const [name, storeId] of Object.entries(stores)) {
      console.log(`\n─────────────────────────────────────────────────`);
      console.log(`Configuring ${name.charAt(0).toUpperCase() + name.slice(1)} store (ID: ${storeId})...`);

      const dateLines = EXCLUDE_DATES
        .map(d => `fd.append("groups[general][fields][excludedates][value][]", ${JSON.stringify(d)});`)
        .join('\n            ');

      const result = JSON.parse(bhFile(`
import json
try:
    result = js('''
(async () => {
    const fd = new FormData();
    fd.append("form_key", "${fKey}");
            ${dateLines}
    fd.append("groups[general][fields][excludedates][inherit]", "0");
    try {
        const resp = await fetch("${BASE_URL}/admin/system_config/save/section/rental_settings/?store=${storeId}", {
            method: "POST",
            body: fd,
            credentials: "include",
        });
        if (resp.redirected && !resp.url.includes("section/rental_settings")) {
            return JSON.stringify({ok: true, redirected: resp.url.slice(-60)});
        }
        const text = await resp.text();
        const hasSuccess = text.includes("message-success") || text.includes("saved");
        return JSON.stringify({ok: hasSuccess, snippet: text.slice(0, 200).replace(/<[^>]+>/g, " ").trim()});
    } catch(e) {
        return JSON.stringify({ok: false, error: e.message});
    }
})()
''')
    print(result)
except Exception as e:
    print(json.dumps({"ok": false, "error": str(e)}))
`, `config-${name}`));

      if (result.ok) {
        console.log(`✅ ${name.charAt(0).toUpperCase() + name.slice(1)} — blackout dates saved!`);
        if (result.redirected) console.log(`   Redirect: ...${result.redirected}`);
      } else {
        console.log(`❌ ${name.charAt(0).toUpperCase() + name.slice(1)} — failed`);
        console.log(`   Error: ${result.error || result.snippet}`);
        console.log('   Check the Chrome tab that was opened.');
      }
    }

    console.log(`\n─────────────────────────────────────────────────`);
    console.log(`\n✅ Done! Blackout dates set:`);
    console.log(`   Dates: ${EXCLUDE_DATES.join(', ')}`);
    console.log(`   Pune store ID: ${stores.pune}`);
    console.log(`   Mumbai store ID: ${stores.mumbai}`);
    console.log(`\n⚠️  Flush config cache if changes not visible on frontend:`);
    console.log(`   Admin → System → Cache Management → Flush Config Cache`);
    console.log(`\nDone.`);
  }
})().catch(e => { console.error(`\nFatal: ${e.message}`); process.exit(1); });
