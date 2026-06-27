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
    // Check current state
    console.log("Checking current page state...");
    const state = await evalJs(`
      JSON.stringify({
        url: window.location.href.substring(0, 100),
        hasOrderGrid: !!document.querySelector('#order-items_grid'),
        hasAddProducts: !!document.querySelector('#add_products'),
        hasStoreSelector: !!document.querySelector('#order-store-selector'),
        hasCustomerGrid: !!document.querySelector('#sales_order_create_customer_grid'),
        hasCustomerFields: !!document.querySelector('[name="order[entity_id]"]') || !!document.querySelector('input[name="entity_id"]'),
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500)
      })
    `);
    console.log("State:", state);
    
    // If we need to re-select store
    if (state.includes('"hasStoreSelector":true')) {
      console.log("Store selector visible, selecting Pune...");
      await evalJs(`
        var store = document.querySelector('#store_1');
        if (store) store.click();
      `);
      await sleep(6000);
      
      // Re-check
      const state2 = await evalJs(`
        JSON.stringify({
          hasCustomerGrid: !!document.querySelector('#sales_order_create_customer_grid'),
          hasAddProducts: !!document.querySelector('#add_products'),
          hasOrderGrid: !!document.querySelector('#order-items_grid')
        })
      `);
      console.log("After store select:", state2);
    }
    
    // Check if customer grid is visible and select customer
    const hasCustGrid = await evalJs(`!!document.querySelector('#sales_order_create_customer_grid')`);
    if (hasCustGrid) {
      console.log("Customer grid visible, selecting customer...");
      
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
      
      // Select customer
      const custResult = await evalJs(`
        (function() {
          var rows = document.querySelectorAll('#sales_order_create_customer_grid_table tbody tr');
          for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            for (var j = 0; j < cells.length; j++) {
              if (cells[j].textContent.includes('16010') || cells[j].textContent.includes('kapil.thakare')) {
                sales_order_create_customer_gridJsObject.trOnClick(rows[i]);
                return 'selected';
              }
            }
          }
          return 'not found - rows: ' + rows.length;
        })()
      `);
      console.log("Customer:", custResult);
      await sleep(5000);
    }
    
    // Final state check
    const finalState = await evalJs(`
      JSON.stringify({
        url: window.location.href.substring(0, 100),
        hasOrderGrid: !!document.querySelector('#order-items_grid'),
        hasAddProducts: !!document.querySelector('#add_products'),
        hasStoreSelector: !!document.querySelector('#order-store-selector')
      })
    `);
    console.log("Final state:", finalState);
    
    // Check if Add Products button exists
    if (finalState.includes('"hasAddProducts":true')) {
      console.log("Add Products button found! Ready to add products.");
    } else if (finalState.includes('"hasOrderGrid":true')) {
      console.log("Order grid found! Ready to add products.");
    } else {
      console.log("Order form not ready. Page may have redirected.");
    }
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    ws.close();
  }
});
