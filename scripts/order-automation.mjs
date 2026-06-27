#!/usr/bin/env node
/**
 * Complete Magento order automation: select customer → add products → set qty/prices
 * Connects to Chrome DevTools Protocol on port 9222
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';

const ORDER_DATA = JSON.parse(readFileSync(new URL('../order-73841.json', import.meta.url)));

const TAB_ID = '3279E3C461B82646EA914D0A13C35D72';
const WS_URL = `ws://127.0.0.1:9222/devtools/page/${TAB_ID}`;

let ws;
let msgId = 1;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timeout = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 60000);
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`JS Error: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Step 1: Select customer ──────────────────────────────────────────────────
async function selectCustomer() {
  console.log('\n═══ STEP 1: Select Customer ═══');

  // Check if customer already selected
  const alreadySelected = await evalJs(`
    !!document.querySelector('#order-form .order-customer-information table tbody tr')
  `);
  if (alreadySelected) {
    console.log('  Customer already selected, skipping.');
    return;
  }

  // Find and click "Get Customer Information" or similar button
  const clickedBtn = await evalJs(`
    (function() {
      // Try various selectors for customer selection trigger
      const btns = document.querySelectorAll('button, a');
      for (const btn of btns) {
        const txt = btn.textContent.toLowerCase();
        if (txt.includes('get customer') || txt.includes('find customer') || txt.includes('select customer')) {
          btn.click();
          return 'clicked: ' + btn.textContent.trim();
        }
      }
      // Try the customer information section toggle
      const infoHeader = document.querySelector('.order-customer-information .section-header');
      if (infoHeader) { infoHeader.click(); return 'clicked section header'; }
      return 'no button found';
    })()
  `);
  console.log('  Customer trigger:', clickedBtn);
  await sleep(2000);

  // Search for customer
  const searchResult = await evalJs(`
    (async () => {
      // Find customer search input - could be on the page or need to navigate
      const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
      for (const input of inputs) {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        if (name.includes('customer') || id.includes('customer') || name.includes('search')) {
          input.value = 'Kaps Test';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          // Find associated search button
          const form = input.closest('form');
          if (form) {
            const searchBtn = form.querySelector('button[type="submit"], .action-secondary, .action-search');
            if (searchBtn) { searchBtn.click(); return 'searched via form'; }
          }
          // Try pressing Enter
          input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          return 'enter pressed on: ' + (input.name || input.id);
        }
      }
      return 'no search input found - need navigation';
    })()
  `);
  console.log('  Search:', searchResult);
  await sleep(3000);

  // If no search input found, try the account/contacts path
  if (searchResult === 'no search input found - need navigation') {
    console.log('  Trying alternative customer selection path...');
    await evalJs(`
      (async () => {
        // Magento order create sometimes has a separate customer search page
        // Look for "Search" link in customer section
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent.trim().toLowerCase().includes('search')) {
            link.click();
            await new Promise(r => setTimeout(r, 2000));
            return;
          }
        }
        // Try direct URL navigation
        const baseUrl = location.origin + location.pathname;
        window.location.href = baseUrl;
      })()
    `);
    await sleep(3000);
  }

  // Select customer from results
  const selectResult = await evalJs(`
    (async () => {
      // Look for customer grid rows
      const rows = document.querySelectorAll('#customerGrid tbody tr, table.data-grid tbody tr, .admin__data-grid tbody tr');
      for (const row of rows) {
        const text = row.textContent.toLowerCase();
        if (text.includes('kaps test') || text.includes('kapil.thakare@primesandzooms.com')) {
          // Click the row to select
          row.click();
          // Or use Magento's grid JS object if available
          if (typeof sales_order_create_customer_gridJsObject !== 'undefined') {
            sales_order_create_customer_gridJsObject.trOnClick(row);
          }
          await new Promise(r => setTimeout(r, 2000));
          return 'selected: ' + row.textContent.trim().substring(0, 80);
        }
      }
      // Check if we're now on the order form with customer selected
      const customerInfo = document.querySelector('#order-form .order-customer-information');
      if (customerInfo && customerInfo.textContent.includes('Kaps Test')) {
        return 'already on order form with customer';
      }
      return 'no matching customer row found';
    })()
  `);
  console.log('  Select:', selectResult);
  await sleep(2000);

  // Verify
  const verified = await evalJs(`
    !!document.querySelector('#order-form .order-customer-information table tbody tr') ||
    document.body.textContent.includes('Kaps Test')
  `);
  if (!verified) {
    throw new Error('Customer selection failed - Kaps Test not confirmed on page');
  }
  console.log('  ✓ Customer Kaps Test selected');
}

// ── Step 2: Add product to cart ──────────────────────────────────────────────
async function addProduct(sku, qty, customPrice, attempt = 1) {
  console.log(`\n  → [${attempt}] Adding ${sku} (qty: ${qty}, price: ${customPrice})`);

  // Click "Add Products" button
  await evalJs(`
    (function() {
      const btn = document.querySelector('#add_products, [id*="add_products"]');
      if (btn) { btn.click(); return 'ok'; }
      // Try finding by text
      const allBtns = document.querySelectorAll('button');
      for (const b of allBtns) {
        if (b.textContent.toLowerCase().includes('add products')) {
          b.click();
          return 'clicked by text';
        }
      }
      return 'no add button';
    })()
  `);
  await sleep(2000);

  // Search by SKU
  const searchOk = await evalJs(`
    (async () => {
      const skuInput = document.querySelector('#sales_order_create_search_grid_filter_sku');
      if (!skuInput) return false;
      skuInput.value = '${sku}';
      skuInput.dispatchEvent(new Event('input', { bubbles: true }));
      skuInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      const searchBtn = skuInput.closest('.admin__data-grid-wrapper')
        ?.querySelector('button.action-secondary') 
        || document.querySelector('#sales_order_create_search_grid button.action-secondary');
      if (searchBtn) searchBtn.click();
      
      // Also try pressing Enter
      skuInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, bubbles: true }));
      
      await new Promise(r => setTimeout(r, 3000));
      return true;
    })()
  `);

  if (!searchOk) {
    if (attempt < 3) {
      console.log(`    No SKU input, retrying (attempt ${attempt + 1})...`);
      await sleep(2000);
      return addProduct(sku, qty, customPrice, attempt + 1);
    }
    console.log(`    ✗ FAILED: No SKU search input after ${attempt} attempts`);
    return false;
  }

  // Click the product row to add it
  const added = await evalJs(`
    (async () => {
      const rows = document.querySelectorAll('#sales_order_create_search_grid_table tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        for (const cell of cells) {
          if (cell.textContent.trim() === '${sku}') {
            if (typeof sales_order_create_search_gridJsObject !== 'undefined') {
              sales_order_create_search_gridJsObject.trOnClick(row);
            } else {
              row.querySelector('input[type="checkbox"]')?.click();
              // Click Add button
              const addBtns = document.querySelectorAll('button');
              for (const b of addBtns) {
                if (b.textContent.toLowerCase().includes('add') && !b.textContent.toLowerCase().includes('product')) {
                  b.click(); break;
                }
              }
            }
            await new Promise(r => setTimeout(r, 3000));
            return true;
          }
        }
      }
      return false;
    })()
  `);

  if (!added) {
    if (attempt < 3) {
      console.log(`    SKU not found in grid, retrying (attempt ${attempt + 1})...`);
      await sleep(2000);
      return addProduct(sku, qty, customPrice, attempt + 1);
    }
    console.log(`    ✗ FAILED: SKU ${sku} not found in grid`);
    return false;
  }

  // Set qty and custom price on the LAST row (most recently added)
  await sleep(1500);
  const configured = await evalJs(`
    (async () => {
      const rows = document.querySelectorAll('#order-items_grid tbody tr');
      if (rows.length === 0) return { error: 'no rows in cart' };
      
      // Last row = most recently added
      const row = rows[rows.length - 1];
      
      // Find qty input - Magento uses name like "items[<id>][qty]"
      const qtyInput = row.querySelector('input[name*="[qty]"]');
      if (!qtyInput) return { error: 'qty input not found', rowHTML: row.innerHTML.substring(0, 200) };
      
      // Find custom price input - may have id like "custom_price-<id>"
      const priceInput = row.querySelector('input[name*="[custom_price]"], input[id*="custom_price"]');
      
      // Find custom price checkbox
      const checkbox = row.querySelector('input[type="checkbox"][name*="use_custom_price"], input[id*="use_custom_price"]');
      
      // Set qty
      qtyInput.value = '${qty}';
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Enable custom price checkbox if needed
      if (checkbox && !checkbox.checked) {
        checkbox.click();
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Set custom price
      if (priceInput) {
        priceInput.value = '${customPrice}';
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Click Apply button for this row
      const applyBtns = row.querySelectorAll('button');
      for (const btn of applyBtns) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt === 'apply') {
          btn.click();
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
      
      return { success: true, qty: qtyInput.value, price: priceInput?.value };
    })()
  `);

  if (configured?.error) {
    console.log(`    Config error: ${configured.error}`);
    if (attempt < 3) {
      await sleep(2000);
      return addProduct(sku, qty, customPrice, attempt + 1);
    }
    return false;
  }

  console.log(`    ✓ ${sku} added & configured (qty: ${configured?.qty}, price: ${configured?.price})`);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  console.log('Connected to Chrome DevTools Protocol\n');

  // Step 1: Select customer
  await selectCustomer();

  // Step 2: Add all products
  console.log('\n═══ STEP 2: Add Products ═══');
  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (const product of ORDER_DATA.products) {
    try {
      const ok = await addProduct(product.sku, product.qty, product.customPrice);
      if (ok) {
        successCount++;
        console.log(`  ✓ ${product.sku} (${successCount}/${ORDER_DATA.products.length})`);
      } else {
        failCount++;
        failures.push(product.sku);
        console.log(`  ✗ ${product.sku}`);
      }
    } catch (err) {
      failCount++;
      failures.push(product.sku);
      console.log(`  ✗ ${product.sku} error: ${err.message}`);
    }
    await sleep(1500);
  }

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`Added: ${successCount}/${ORDER_DATA.products.length}`);
  if (failures.length > 0) {
    console.log(`Failed: ${failures.join(', ')}`);
  }

  // Final cart state
  const state = await evalJs(`
    JSON.stringify({
      cartItems: document.querySelectorAll('#order-items_grid tbody tr').length,
      pageText: document.querySelector('#order-items_grid')?.textContent?.substring(0, 200)
    })
  `);
  console.log('Cart state:', state);

  ws.close();
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  if (ws) ws.close();
  process.exit(1);
});
