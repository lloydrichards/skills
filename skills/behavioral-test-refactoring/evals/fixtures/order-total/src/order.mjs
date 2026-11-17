export function total(items) {
  if (items.some((item) => item.quantity < 0))
    throw new RangeError("negative quantity");
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
