# July 15-16 Blockout — Automation Plan

## Business Rule
- **July 15 (holiday) + July 16**: Blocked from customer self-service booking on calendar
- **Still chargeable**: If these dates fall within an existing rental period, they are billed (price NOT excluded)
- **Admin override**: Customers must call to book — bookings team places via admin panel
- **Rental flow example**: 1-day rental for July 15 → Pickup July 14 (4-7pm), Return July 16 (9:30am-12pm)
- **Per-store config**: Pune and Mumbai may have different blackout dates

## SalesIgniter Config Paths

| Setting | Config Path | Scope |
|---------|------------|-------|
| Excluded Dates | `rental_settings/general/excludedates` | Global + Per-store |
| Exclude Scope | `rental_settings/general/excludescope` | v1.4+ only |
| Days of Week | `rental_settings/general/excludedays` | Global + Per-store |
| Per-product flag | `sirent_global_exclude_dates` | 1 = use global config |

## Excluded Dates Scope (v1.2.194)
In version 1.2.194, excluded dates apply to **Calendar only by default** — they block the frontend calendar but still charge if the dates fall within a rental period. This is exactly what we need so no scope change is required.

## v1.4+ Enhancement
Since v1.4, excluded dates can be explicitly scoped:
- **Calendar only** ✅ blocks frontend, admin can override
- **Turnover only**
- **Both calendar + turnover**

## REST API Learnings

### Auth endpoints tested
| Endpoint | Method | Status |
|----------|--------|--------|
| `/rest/V1/tfa/provider/google/authenticate` | POST | ✅ Works — returns JWT |
| `/rest/V1/config/{path}` | GET | ❌ Route does not exist |
| `/rest/V1/store/storeViews` | GET | ❌ Needs `Magento_Backend::store` |
| `/rest/V1/store/storeConfigs` | GET | ❌ Needs `Magento_Backend::store` |
| `/rest/V1/categories` | GET | ✅ Works (admin JWT) |
| `/rest/V1/products` | GET | ❌ Times out or restricted |

### Token status (as of 25 Jun 2026)
| Token | Stores | Products | Config |
|-------|--------|----------|--------|
| **Admin JWT** (via 2FA) | ❌ Missing `Magento_Backend::store` | ❌ Restricted | ❌ No route |
| **Integration key** (`hiiqn4ynscfboukumrfdqsl8yvpiipmf`) | ❌ Missing `Magento_Backend::store` | ❌ Restricted | ❌ No route |

### API auth flow
```bash
# Step 1: Get JWT via 2FA
TOKEN=$(curl -s -X POST "https://test.pandz.in/rest/V1/tfa/provider/google/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"otp":"<code>","username":"kapilt","password":"3OCArt&rpi4%j"}' | tr -d '"')

# Step 2: Use token
curl -H "Authorization: Bearer $TOKEN" "https://test.pandz.in/rest/V1/..."
```

## Admin Config Save Endpoint (No API needed)
Magento saves config via form POST — works with a logged-in admin session:

```
POST /notoms/admin/system_config/save/section/rental_settings/?store=<store_id>
Content-Type: multipart/form-data

form_key=<form_key>
groups[general][fields][excludedates][value][]=15-07-2026
groups[general][fields][excludedates][value][]=16-07-2026
groups[general][fields][excludedates][inherit]=0
```

This requires a valid admin session cookie + form_key (both available from browser-harness).

## Store IDs
Discovered via browser visiting `Admin → Stores → All Stores` and extracting IDs from the table.

## Available Scripts

### `scripts/magento-set-blackout.mjs` (Browser Automation — USE THIS)
- Opens Chrome via browser-harness, you handle captcha + 2FA login manually
- Auto-discovers store IDs from admin
- Posts to config save endpoint for each store (Pune, Mumbai)
- Usage: `node scripts/magento-set-blackout.mjs`
- Env: `MAGENTO_BASE_URL`, `EXCLUDE_DATES`

### `scripts/magento-api-exclude-dates.mjs` (REST API — blocked)
- Auth via 2FA endpoint
- Needs `Magento_Backend::store` permission
- Usage: `OTP=123456 node scripts/magento-api-exclude-dates.mjs`

### `scripts/magento-exclude-dates.mjs` (Browser — single store fallback)
- Simpler version, single store only

## Database Reference
```sql
SELECT * FROM core_config_data WHERE path LIKE '%excludedate%';
SELECT * FROM core_config_data WHERE path LIKE '%rental_settings/general%' AND scope = 'stores';
```
