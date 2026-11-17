import { test } from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/order.mjs";

test("totals multiple items", () => {
  assert.equal(
    total([
      { price: 3, quantity: 2 },
      { price: 5, quantity: 1 },
    ]),
    11,
  );
});

test("computes the expected reduction", () => {
  const items = [
    { price: 3, quantity: 2 },
    { price: 5, quantity: 1 },
  ];
  assert.equal(
    total(items),
    items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );
});

test("empty orders cost zero", () => {
  assert.equal(total([]), 0);
});

// Incident ORD-17: a negative quantity previously reduced the amount charged.
test("rejects negative quantities", () => {
  assert.throws(() => total([{ price: 3, quantity: -1 }]), RangeError);
});
