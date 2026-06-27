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
    // Check customer state
    const custState = await evalJs(`
      JSON.stringify({
        hasCustGrid: !!document.querySelector("#sales_order_create_customer_grid"),
        custGridVisible: !!document.querySelector("#sales_order_create_customer_grid"),
        custFirstName: (document.querySelector('[name="order[billing][firstname]"]') || {}).value || "none",
        custEmail: (document.querySelector('[name="order[billing][email]"]') || {}).value || "none",
        custEntityId: (document.querySelector('[name="order[entity_id]"]') || {}).value || "none",
        orderBillingFirstName: (document.querySelector('[name="order[entity_id]"]') || {}).value || "none",
        addProductsBtn: !!document.querySelector("#add_products"),
        orderItemsGrid: !!document.querySelector("#order-items_grid"),
        searchGrid: !!document.querySelector("#sales_order_create_search_grid"),
        bodyText: document.body.innerText.substring(0, 300)
      })
    `);
    console.log("State:", custState);
    
    // The issue: search grid is visible but no order items grid means customer wasn't fully loaded
    // Let me check if customer needs to be re-selected
    const parsed = JSON.parse(custState);
    
    if (parsed.custFirstName === "none") {
      console.log("Customer not selected. Need to select customer first.");
      
      // Check if customer grid is visible (need to search)
      if (parsed.hasCustGrid) {
        console.log("Customer grid visible, filtering by email...");
        
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
        console.log("Customer:", custResult);
        await sleep(5000);
      }
    }
    
    // Re-check state
    const state2 = await evalJs(`
      JSON.stringify({
        custFirstName: (document.querySelector('[name="order[billing][firstname]"]') || {}).value || "none",
        custEmail: (document.querySelector('[name="order[billing][email]"]') || {}).value || "none",
        addProductsBtn: !!document.querySelector("#add_products"),
        orderItemsGrid: !!document.querySelector("#order-items_grid"),
        searchGrid: !!document.querySelector("#sales_order_create_search_grid"),
        addBtnVisible: !!(document.querySelector("#add_products") && document.querySelector("#add_products").offsetParent)
      })
    `);
    console.log("After re-select:", state2);
    
    const state2Parsed = JSON.parse(state2);
    
    if (state2Parsed.custFirstName !== "none" && state2Parsed.orderItemsGrid) {
      console.log("\nOrder form is ready! Can add products.");
      
      // Click Add Products button to show product grid
      if (state2Parsed.addProductsBtn) {
        console.log("Clicking Add Products button...");
        await evalJs(`document.querySelector("#add_products").click()`);
        await sleep(3000);
      }
      
      // Verify product grid is visible
      const prodGridVisible = await evalJs(`
        !!document.querySelector("#sales_order_create_search_grid") && document.querySelector("#sales_order_create_search_grid").offsetParent !== null
      `);
      console.log("Product grid visible:", prodGridVisible);
      
      if (prodGridVisible) {
        console.log("Ready to add products!");
      }
    } else {
      console.log("Order form still not ready. May need to start over.");
    }
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    ws.close();
  }
});
