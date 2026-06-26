#!/usr/bin/env node
/**
 * Magento SalesIgniter — Set Excluded Dates via REST API
 *
 * Authenticates via the Google 2FA API endpoint, then updates
 * the SalesIgniter excluded dates config.
 *
 * Requires admin role with Magento_Backend::store permission
 * (or Magento_Config::config).
 *
 * Usage:
 *   OTP=<code> node scripts/magento-api-exclude-dates.mjs
 *   OTP=<code> EXCLUDE_DATES=15-07-2026,16-07-2026 node scripts/magento-api-exclude-dates.mjs
 *
 * Config via env:
 *   MAGENTO_BASE_URL   default: https://test.pandz.in
 *   ADMIN_USERNAME     default: kapilt
 *   ADMIN_PASSWORD     default: 3OCArt&rpi4%j
 *   OTP                required (Google Authenticator code)
 *   EXCLUDE_DATES      default: 15-07-2026,16-07-2026
 *   SCOPE              scope: "calendar" (default), "turnover", "both"
 */

const BASE    = process.env.MAGENTO_BASE_URL || 'https://test.pandz.in';
const API     = BASE + '/rest/V1';
const USER    = process.env.ADMIN_USERNAME  || 'kapilt';
const PASS    = process.env.ADMIN_PASSWORD  || '3OCArt&rpi4%j';
const OTP     = process.env.OTP;
const DATES   = (process.env.EXCLUDE_DATES || '15-07-2026,16-07-2026');
const SCOPE   = process.env.SCOPE || 'calendar';

if (!OTP) {
  console.error('OTP required. Usage: OTP=<code> node scripts/magento-api-exclude-dates.mjs');
  process.exit(1);
}

async function apiCall(url, options = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: resp.status, data };
}

(async () => {
  // ── Step 1: Authenticate with 2FA ──
  console.log('Authenticating with 2FA...');
  const { status: authStatus, data: authData } = await apiCall(
    API + '/tfa/provider/google/authenticate',
    {
      method: 'POST',
      body: JSON.stringify({
        otp: OTP,
        username: USER,
        password: PASS,
      }),
    }
  );

  if (authStatus !== 200) {
    console.error('Auth failed:', authData);
    process.exit(1);
  }

  const token = authData;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  console.log('Authenticated. Token expires in 1 hour.\n');

  // ── Step 2: Read current excluded dates ──
  console.log('Reading current excluded dates config...');
  const { status: readStatus, data: readData } = await apiCall(
    API + '/config/rental_settings/general/excludedates',
    { headers }
  );

  if (readStatus === 200) {
    console.log(`Current value: ${JSON.stringify(readData)}`);
  } else if (readStatus === 401 || readStatus === 403) {
    console.log(`Config read failed (${readStatus}): ${readData?.message || readData}`);
    console.log('May need permissions update from Mayuresh.\n');
  } else {
    console.log(`Config read status: ${readStatus} — ${JSON.stringify(readData).slice(0, 200)}`);
  }

  // ── Step 3: Set new excluded dates ──
  const newValue = DATES;

  console.log(`\nSetting excluded dates to: "${newValue}"`);
  console.log(`Exclude scope: ${SCOPE}`);

  const { status: writeStatus, data: writeData } = await apiCall(
    API + '/config/rental_settings/general/excludedates',
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: newValue }),
    }
  );

  if (writeStatus === 200) {
    console.log('✅ Excluded dates updated successfully!');

    // ── Step 4: Also set scope if API supports it ──
    if (SCOPE !== 'calendar') {
      const { status: scopeStatus } = await apiCall(
        API + '/config/rental_settings/general/excludescope',
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: SCOPE }),
        }
      );
      if (scopeStatus === 200) {
        console.log(`✅ Exclude scope set to "${SCOPE}"`);
      } else {
        console.log(`Note: scope update returned ${scopeStatus} (may not exist in v1.2.194 — default is calendar only)`);
      }
    } else {
      console.log('Scope is "calendar" (default in v1.2.194 — no action needed)');
    }

    console.log('\n⚠️  Remember:');
    console.log('   1. Flush config cache:');
    console.log(`      curl -X POST "${API}/config/rental_settings/" -H "Authorization: Bearer ${token}"`);
    console.log('   2. Or flush via Admin → System → Cache Management');
  } else {
    console.error(`\n❌ Write failed (${writeStatus}):`, writeData);
    console.error(`Message: ${writeData?.message || JSON.stringify(writeData)}`);
    console.error('\nThis likely means permissions are still restricted.');
    console.error('The browser-automation script (magento-exclude-dates.mjs) can be used instead.');
  }

  console.log('\nDone.');
})();
