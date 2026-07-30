import { describe, expect, it } from 'vitest';
import { cartTotal, changeCart, filterCatalog } from './catalog.js';

describe('official commerce domain', () => {
  it('filters catalog and calculates cart totals', () => {
    const products = [{ id: '1', name: 'Camera', category: 'devices', price: 10, stock: 2 }];
    expect(filterCatalog(products, 'cam', 'devices')).toHaveLength(1);
    expect(cartTotal([{ productId: '1', quantity: 2, unitPrice: 10 }])).toBe(20);
  });
  it('adds, updates and removes cart lines', () => {
    const added = changeCart([], '1', 1, 10);
    expect(changeCart(added, '1', 2, 10)[0]?.quantity).toBe(2);
    expect(changeCart(added, '1', 0, 10)).toHaveLength(0);
  });
});
