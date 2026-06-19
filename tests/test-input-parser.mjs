import { validateInput } from '../scripts/magento-place-order.mjs';

let failed = false;

try {
  const result = validateInput({
    customer: 'John Doe',
    products: [
      {
        sku: 'RENTAL-CAM-001',
        rentalStart: '2026-06-21',
        rentalEnd: '2026-06-25',
      },
    ],
  });
  console.assert(
    result.customer === 'John Doe' &&
      result.products.length === 1 &&
      result.products[0].sku === 'RENTAL-CAM-001' &&
      result.products[0].qty === 1,
    'FAIL: valid input produced unexpected output',
  );
  console.log('PASS: valid input accepted');
} catch (err) {
  console.error('FAIL: valid input threw unexpectedly:', err.message);
  failed = true;
}

try {
  validateInput({});
  console.error('FAIL: empty object should have thrown');
  failed = true;
} catch (err) {
  console.assert(
    err.message && typeof err.message === 'string',
    'FAIL: expected descriptive error message',
  );
  console.log('PASS: invalid input rejected');
}

if (failed) {
  process.exit(1);
}
