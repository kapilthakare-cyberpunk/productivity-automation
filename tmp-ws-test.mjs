const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('Connected');
  const ctxs = browser.contexts();
  console.log('Contexts:', ctxs.length);
  for (const ctx of ctxs) {
    console.log('Pages:', ctx.pages().length);
    for (const p of ctx.pages()) {
      console.log('  -', p.url().substring(0, 100));
    }
  }
})().catch(e => {
  console.error('Error:', e.message);
});
