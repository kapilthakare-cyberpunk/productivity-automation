import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages()[0];

// Click "Create New Customer"
await p.click('button:has-text("Create New Customer")');
await p.waitForTimeout(3000);
console.log('URL:', p.url());

// Check the form fields
const formInfo = await p.evaluate(() => {
  const inputs = [...document.querySelectorAll('input:not([type=hidden]), select')]
    .filter(i => i.offsetParent !== null)
    .map(i => ({
      id: i.id,
      name: i.name,
      placeholder: i.placeholder,
      type: i.type || i.tagName,
      label: i.closest('.admin__field')?.querySelector('label')?.innerText?.trim() || '',
      value: i.value,
    }));
  return inputs;
});
console.log('Form fields:', JSON.stringify(formInfo, null, 2));
