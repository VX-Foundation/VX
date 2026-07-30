export interface Product { id: string; name: string; category: string; price: number; stock: number; }
export interface CartLine { productId: string; quantity: number; unitPrice: number; }

export function filterCatalog(products: readonly Product[], search: string, category: string): readonly Product[] {
  const query = search.trim().toLowerCase();
  return products.filter((product) =>
    (category === 'all' || product.category === category) &&
    (!query || product.name.toLowerCase().includes(query))
  );
}

export function cartTotal(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
}

export function changeCart(lines: readonly CartLine[], productId: string, quantity: number, unitPrice: number): readonly CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.productId !== productId);
  const found = lines.some((line) => line.productId === productId);
  return found
    ? lines.map((line) => line.productId === productId ? { ...line, quantity, unitPrice } : line)
    : [...lines, { productId, quantity, unitPrice }];
}
