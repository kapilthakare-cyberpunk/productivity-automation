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

ws.on("open", async () => {
  try {
    // Step 1: Navigate to orders page
    console.log("Step 1: Navigate to orders page...");
    await send("Page.navigate", { url: "https://primesandzooms.com/notoms/sales/order/" });
    await sleep(8000);
    
    const title = await evalJs("document.title");
    console.log("  Title:", title);
    
    // Step 2: Click Create New Order
    console.log("Step 2: Click Create New Order...");
    await evalJs(`
      var btn = document.querySelector('button[title="Create New Order"]');
      if (btn) btn.click();
    `);
    
    // Wait for navigation
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const url = await evalJs("window.location.href");
      if (url.includes("order_create")) {
        console.log("  Navigated to order creation!");
        break;
      }
      if (i % 3 === 0) console.log("  Waiting... (" + (i+1) + "s)");
    }
    
    const pageUrl = await evalJs("window.location.href");
    console.log("  URL:", pageUrl.substring(0, 120));
    
    if (!pageUrl.includes("order_create")) {
      console.log("  ERROR: Did not navigate to order creation");
      ws.close();
      return;
    }
    
    // Step 3: Select Pune store
    console.log("Step 3: Select Pune store...");
    await evalJs(`
      var store = document.querySelector('#store_1');
      if (store) store.click();
    `);
    await sleep(6000);
    
    const afterStore = await evalJs(`
      JSON.stringify({
        hasCustomerGrid: !!document.querySelector('#sales_order_create_customer_grid'),
        hasAddProducts: !!document.querySelector('#add_products'),
        hasOrderGrid: !!document.querySelector('#order-items_grid')
      })
    `);
    console.log("  After store:", afterStore);
    
    // Step 4: Select customer
    console.log("Step 4: Select customer...");
    
    // Check if customer grid is visible
    const hasCustGrid = await evalJs(`!!document.querySelector('#sales_order_create_customer_grid')`);
    if (!hasCustGrid) {
      console.log("  Customer grid not visible, waiting more...");
      await sleep(5000);
    }
    
    // Filter by email
    await evalJs(`
      var input = document.querySelector('#sales_order_create_customer_grid_filter_email');
      if (input) {
        input.value = 'kapil.thakare@primesandzooms.com';
        input.dispatchEvent(new Event('input', {bubbles: true}));
      }
    `);
    await sleep(2000);
    
    // Click search
    await evalJs(`
      var btn = document.querySelector('#sales_order_create_customer_grid button.action-secondary');
      if (btn) btn.click();
    `);
    await sleep(3000);
    
    // Select customer row
    const custResult = await evalJs(`
      (function() {
        var rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
        for (var i = 0; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          for (var j = 0; j < cells.length; j++) {
            if (cells[j].textContent.includes('16010') || cells[j].textContent.includes('kapil.thakare')) {
              sales_order_create_customer_gridJsObject.trOnClick(rows[i]);
              return 'selected row ' + i;
            }
          }
        }
        return 'not found - rows: ' + rows.length;
      })()
    `);
    console.log("  Customer:", custResult);
    await sleep(5000);
    
    // Verify order form
    const orderReady = await evalJs(`
      JSON.stringify({
        hasOrderGrid: !!document.querySelector('#order-items_grid'),
        hasAddProducts: !!document.querySelector('#add_products'),
        hasStoreSelector: !!document.querySelector('#order-store-selector'),
        url: window.location.href.substring(0, 80)
      })
    `);
    console.log("  Order form:", orderReady);
    
    // Check cart
    const cart = await evalJs(`
      (function() {
        var rows = document.querySelectorAll('#order-items_grid tbody tr');
        var items = [];
        for (var i = 0; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length > 2) {
            items.push(cells[1].textContent.trim() + ' qty:' + (cells[2].querySelector('input')?.value || cells[2].textContent.trim()));
          }
        }
        return JSON.stringify({rowCount: rows.length, items: items});
      })()
    `);
    console.log("  Cart:", cart);
    
    console.log("\n=== SETUP PHASE COMPLETE ===");
    console.log("Next: Add all 17 products via batch script");
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    ws.close();
  }
});
