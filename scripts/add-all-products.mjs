#!/usr/bin/env node
/**
 * Add all 17 products to the Magento order via CDP
 * Connects to Chrome DevTools Protocol on port 9222
 */

import WebSocket from 'ws';

const TAB_ID = '3279E3C461B82646EA914D0A13C35D72';
const WS_URL = `ws://127.0.0.1:9222/devtools/page/${TAB_ID}`;

const PRODUCTS = [
  { sku: 'SFX3', qty: 3, customPrice: 2440.67 },
  { sku: 'SFE2470F282', qty: 2, customPrice: 1525.50 },
  { sku: 'SFE1635F282', qty: 1, customPrice: 1525.00 },
  { sku: 'SFE50F12', qty: 2, customPrice: 1220.50 },
  { sku: 'SFE70200F282', qty: 2, customPrice: 1525.50 },
  { sku: 'LLBM150', qty: 1, customPrice: 381.00 },
  { sku: '82VND15', qty: 3, customPrice: 381.33 },
  { sku: 'DJIRS4P', qty: 1, customPrice: 2136.00 },
  { sku: 'CMATTDT', qty: 3, customPrice: 915.33 },
  { sku: 'HLMR4K', qty: 1, customPrice: 686.00 },
  { sku: 'BMATMP', qty: 1, customPrice: 763.00 },
  { sku: 'APNP300C', qty: 3, customPrice: 1525.33 },
  { sku: 'APLS600D', qty: 1, customPrice: 1678.00 },
  { sku: 'GF400BI', qty: 2, customPrice: 1068.00 },
  { sku: 'UHDMI30FT', qty: 2, customPrice: 38.00 },
  { sku: 'UHDMI15FT', qty: 2, customPrice: 38.00 },
  { sku: 'SFE85F18', qty: 1, customPrice: 458.00 },
];

let ws;
let msgId = 1;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgIdCurrent = msgId++;
    const timeout = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 60000);
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === msgIdCurrent) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        if (msg.error) {
          reject(new Error(JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: msgIdCurrent, method, params }));
  });
}

async function evalExpr(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function addProduct(sku, qty, customPrice) {
  console.log(`\n--- Adding ${sku} (qty: ${qty}, price: ${customPrice}) ---`);
  
  // Step 1: Click "Add Products" to open the product grid
  await evalExpr(`
    (async () => {
      const addBtn = document.querySelector('#add_products');
      if (addBtn) addBtn.click();
      await new Promise(r => setTimeout(r, 2000));
      return 'ok';
    })()
  `);
  
  // Step 2: Search for the SKU
  await evalExpr(`
    (async () => {
      const skuInput = document.querySelector('#sales_order_create_search_grid_filter_sku');
      if (!skuInput) return 'no sku input';
      skuInput.value = '${sku}';
      skuInput.dispatchEvent(new Event('input', { bubbles: true }));
      skuInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      const searchBtn = document.querySelector('#sales_order_create_search_grid button.action-secondary');
      if (!searchBtn) return 'no search btn';
      searchBtn.click();
      await new Promise(r => setTimeout(r, 3000));
      return 'searched';
    })()
  `);
  
  // Step 3: Find and click the row
  const addResult = await evalExpr(`
    (async () => {
      const rows = document.querySelectorAll('#sales_order_create_search_grid_table tbody tr');
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        for (const cell of cells) {
          if (cell.textContent.trim() === '${sku}') {
            sales_order_create_search_gridJsObject.trOnClick(row);
            await new Promise(r => setTimeout(r, 3000));
            return 'added';
          }
        }
      }
      return 'not found';
    })()
  `);
  
  if (addResult === 'not found') {
    console.log(`  WARNING: SKU ${sku} not found in grid`);
    return false;
  }
  
  // Step 4: Find the item and set qty + custom price
  await sleep(2000);
  
  const configResult = await evalExpr(`
    (async () => {
      // Find the most recently added item (last row in order items)
      const rows = document.querySelectorAll('#order-items_grid tbody tr');
      if (rows.length === 0) return 'no items in cart';
      
      const lastRow = rows[rows.length - 1];
      const inputs = lastRow.querySelectorAll('input');
      
      let qtyInput, priceInput, customPriceCheckbox;
      for (const input of inputs) {
        if (input.name && input.name.includes('[qty]')) qtyInput = input;
        if (input.id && input.id.includes('custom_price')) priceInput = input;
        if (input.id && input.id.includes('use_custom_price')) customPriceCheckbox = input;
      }
      
      if (!qtyInput) return 'qty input not found';
      
      // Set quantity
      qtyInput.value = '${qty}';
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Enable custom price if checkbox exists
      if (customPriceCheckbox && !customPriceCheckbox.checked) {
        customPriceCheckbox.click();
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Set custom price
      if (priceInput) {
        priceInput.value = '${customPrice}';
        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // Click Apply
      const applyBtns = lastRow.querySelectorAll('button');
      for (const btn of applyBtns) {
        if (btn.textContent.trim() === 'Apply') {
          btn.click();
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
      
      return JSON.stringify({success: true, qty: qtyInput.value, price: priceInput?.value});
    })()
  `);
  
  console.log(`  Result: ${configResult}`);
  return true;
}

async function main() {
  ws = new WebSocket(WS_URL);
  
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  
  console.log('Connected to Chrome DevTools Protocol');
  
  // Skip SFX3 since it's already added
  const productsToAdd = PRODUCTS.slice(1); // Skip first product (SFX3)
  
  let successCount = 1; // SFX3 already added
  let failCount = 0;
  
  for (const product of productsToAdd) {
    try {
      const success = await addProduct(product.sku, product.qty, product.customPrice);
      if (success) {
        successCount++;
        console.log(`  ✓ ${product.sku} added successfully (${successCount}/${PRODUCTS.length})`);
      } else {
        failCount++;
        console.log(`  ✗ ${product.sku} failed (${failCount} failures)`);
      }
    } catch (err) {
      failCount++;
      console.log(`  ✗ ${product.sku} error: ${err.message}`);
    }
    
    // Wait between products
    await sleep(1000);
  }
  
  console.log(`\n=== DONE ===`);
  console.log(`Added: ${successCount}/${PRODUCTS.length}`);
  console.log(`Failed: ${failCount}`);
  
  // Check final cart state
  const finalState = await evalExpr(`
    JSON.stringify({
      totalProducts: document.querySelector('#order-items_grid')?.textContent?.match(/Total (\\d+) product/)?.[1],
      subtotal: document.querySelector('#order-items_grid')?.textContent?.match(/Subtotal[^₹]*₹([\\d,.]+)/)?.[1]
    })
  `);
  console.log('Cart state:', finalState);
  
  ws.close();
}

main().catch(console.error);
