import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];

// Look for search/filter on the customer grid page
const info = await p.evaluate(() => {
  const gridSection = document.querySelector('#sales_order_create_customer_grid_table')?.parentElement?.parentElement;
  const html = gridSection?.innerHTML?.substring(0, 3000) || document.body.innerHTML.substring(0, 3000);
  
  // Look for any input that could be a search
  const allInputs = [...document.querySelectorAll('#sales_order_create_customer_grid_table input, .admin__grid-control input, input[type=text]')]
    .filter(i => i.offsetParent !== null)
    .map(i => ({
      placeholder: i.placeholder,
      id: i.id,
      name: i.name,
      class: i.className?.substring(0, 60),
    }));
  
  // Check for pagination
  const pager = document.querySelector('.admin__data-grid-pager, .pager, .pages');
  
  // Check for a search button like in Orders grid
  const buttons = [...document.querySelectorAll('button')]
    .filter(b => b.offsetParent !== null && b.innerText.trim().length > 0)
    .map(b => b.innerText?.trim());
  
  return { html: html?.substring(0, 2000), inputs: allInputs, buttons, pager: !!pager };
});
console.log('SECTION HTML:', info.html);
console.log('VISIBLE INPUTS:', JSON.stringify(info.inputs));
console.log('BUTTONS:', JSON.stringify(info.buttons));
console.log('PAGER:', info.pager);
