const WebSocket = require("ws");

const TAB_ID = "3279E3C461B82646EA914D0A13C35D72";
const WS_URL = "ws://127.0.0.1:9222/devtools/page/" + TAB_ID;

const ws = new WebSocket(WS_URL);
let msgId = 1;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timeout = setTimeout(() => reject(new Error("Timeout " + method)), 30000);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.removeListener("message", handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expr) {
  const result = await send("Runtime.evaluate", {
    expression: expr,
    awaitPromise: false,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error("JS error: " + result.exceptionDetails.exception?.description);
  }
  return result.result?.value;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const PRODUCTS = [
  { sku: "SFX3", qty: 3, customPrice: 2440.67 },
  { sku: "SFE2470F282", qty: 2, customPrice: 1525.50 },
  { sku: "SFE1635F282", qty: 1, customPrice: 1525.00 },
  { sku: "SFE50F12", qty: 2, customPrice: 1220.50 },
  { sku: "SFE70200F282", qty: 2, customPrice: 1525.50 },
  { sku: "LLBM150", qty: 1, customPrice: 381.00 },
  { sku: "82VND15", qty: 3, customPrice: 381.33 },
  { sku: "DJIRS4P", qty: 1, customPrice: 2136.00 },
  { sku: "CMATTDT", qty: 3, customPrice: 915.33 },
  { sku: "HLMR4K", qty: 1, customPrice: 686.00 },
  { sku: "BMATMP", qty: 1, customPrice: 763.00 },
  { sku: "APNP300C", qty: 3, customPrice: 1525.33 },
  { sku: "APLS600D", qty: 1, customPrice: 1678.00 },
  { sku: "GF400BI", qty: 2, customPrice: 1068.00 },
  { sku: "UHDMI30FT", qty: 2, customPrice: 38.00 },
  { sku: "UHDMI15FT", qty: 2, customPrice: 38.00 },
  { sku: "SFE85F18", qty: 1, customPrice: 458.00 }
];

ws.on("open", async () => {
  try {
    // Verify we're on order creation page
    const url = await evalJs("window.location.href");
    if (!url.includes("order_create")) {
      console.log("ERROR: Not on order creation page:", url);
      ws.close();
      return;
    }
    console.log("On order creation page:", url.substring(0, 80));
    
    // Check if Add Products button is visible
    const hasAddBtn = await evalJs(`!!document.querySelector('#add_products')`);
    if (!hasAddBtn) {
      console.log("ERROR: Add Products button not found");
      ws.close();
      return;
    }
    
    // Click Add Products to show the product grid
    console.log("Opening product grid...");
    await evalJs(`document.querySelector('#add_products').click()`);
    await sleep(3000);
    
    // Verify product grid is visible
    const hasProdGrid = await evalJs(`!!document.querySelector('#sales_order_create_search_grid')`);
    console.log("Product grid visible:", hasProdGrid);
    
    if (!hasProdGrid) {
      console.log("ERROR: Product grid not visible after clicking Add Products");
      ws.close();
      return;
    }
    
    // Now add products one by one
    let addedCount = 0;
    
    for (let i = 0; i < PRODUCTS.length; i++) {
      const product = PRODUCTS[i];
      console.log(`\n[${i+1}/${PRODUCTS.length}] Adding ${product.sku} (qty: ${product.qty})...`);
      
      // Clear SKU filter and search
      await evalJs(`
        var skuInput = document.querySelector('#sales_order_create_search_grid_filter_sku');
        if (skuInput) {
          skuInput.value = '${product.sku}';
          skuInput.dispatchEvent(new Event('input', {bubbles: true}));
        }
      `);
      await sleep(1000);
      
      // Click search button
      await evalJs(`
        var searchBtn = document.querySelector('#sales_order_create_search_grid button.action-secondary');
        if (searchBtn) searchBtn.click();
      `);
      await sleep(2000);
      
      // Check if product found and select checkbox
      const selected = await evalJs(`
        (function() {
          var rows = document.querySelectorAll('#sales_order_create_search_grid_table tbody tr');
          if (rows.length === 0) return 'no rows found';
          
          // Find the SKU cell and check the checkbox
          for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            for (var j = 0; j < cells.length; j++) {
              if (cells[j].textContent.trim() === '${product.sku}') {
                // Check the checkbox
                var checkbox = rows[i].querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.checked) {
                  checkbox.click();
                }
                return 'selected';
              }
            }
          }
          return 'SKU not found in ' + rows.length + ' rows';
        })()
      `);
      console.log(`  Checkbox: ${selected}`);
      
      if (selected === 'selected') {
        // Click "Add Selected Product(s) to Order" button
        await evalJs(`
          var addBtn = document.querySelector('#sales_order_create_search_grid .action-default.scalable.action-add.action-secondary');
          if (addBtn) addBtn.click();
        `);
        await sleep(3000);
        
        // Verify product was added to order items
        const orderItem = await evalJs(`
          (function() {
            var rows = document.querySelectorAll('#order-items_grid tbody tr');
            for (var i = 0; i < rows.length; i++) {
              if (rows[i].textContent.includes('${product.sku}')) {
                return 'found in order';
              }
            }
            return 'not in order yet';
          })()
        `);
        console.log(`  Order item: ${orderItem}`);
        
        if (orderItem === 'found in order') {
          addedCount++;
        }
      }
      
      // Small delay between products
      await sleep(1000);
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Added: ${addedCount}/${PRODUCTS.length} products`);
    
    // Final cart check
    const cartCount = await evalJs(`
      document.querySelectorAll('#order-items_grid tbody tr').length
    `);
    console.log(`Cart items: ${cartCount}`);
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    ws.close();
  }
});
