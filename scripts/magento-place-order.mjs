import { readFileSync } from 'fs';

export const CONFIG = {
  MAGENTO_BASE_URL: process.env.MAGENTO_BASE_URL || 'https://primesandzooms.com/notoms',
  MAGENTO_ADMIN_USERNAME: process.env.MAGENTO_ADMIN_USERNAME || 'kapilt',
  MAGENTO_ADMIN_PASSWORD: process.env.MAGENTO_ADMIN_PASSWORD || '',
  get ADMIN_URL() {
    return `${this.MAGENTO_BASE_URL}/admin/dashboard/`;
  },
};

export function parseInput() {
  const dataIndex = process.argv.indexOf('--data');
  if (dataIndex !== -1 && process.argv[dataIndex + 1]) {
    return JSON.parse(process.argv[dataIndex + 1]);
  }

  if (!process.stdin.isTTY) {
    const input = readFileSync(process.stdin.fd, 'utf-8').trim();
    if (input) {
      return JSON.parse(input);
    }
  }

  throw new Error('No input provided. Use --data <json> or pipe JSON via stdin.');
}

export function validateInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Input must be a non-null object.');
  }

  if (!data.customer || typeof data.customer !== 'string') {
    throw new Error('Missing required field: customer (string).');
  }

  if (!Array.isArray(data.products) || data.products.length === 0) {
    throw new Error('Missing required field: products (non-empty array).');
  }

  const { products } = data;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    if (!product.sku || typeof product.sku !== 'string') {
      throw new Error(`Products[${i}] missing required field: sku (string).`);
    }

    if (!product.rentalStart || typeof product.rentalStart !== 'string') {
      throw new Error(`Products[${i}] missing required field: rentalStart (string).`);
    }

    if (!product.rentalEnd || typeof product.rentalEnd !== 'string') {
      throw new Error(`Products[${i}] missing required field: rentalEnd (string).`);
    }
  }

  return {
    customer: data.customer,
    products: data.products.map((p) => ({
      sku: p.sku,
      rentalStart: p.rentalStart,
      rentalEnd: p.rentalEnd,
      qty: p.qty ?? 1,
      customPrice: p.customPrice ?? null,
      rent: p.rent ?? null,
    })),
    customerEmail: data.customerEmail ?? null,
    paymentMethod: data.paymentMethod ?? 'Pay by Credit',
    shippingMethod: data.shippingMethod ?? 'Self Pickup',
    shippingOption: data.shippingOption ?? 'In-Store Pickup',
    comment: data.comment ?? 'Order Placed by Kapil Thakare using Admin Panel',
  };
}

async function main() {
  console.log('Script scaffold ready');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
