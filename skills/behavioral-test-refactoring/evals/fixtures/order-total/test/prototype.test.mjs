import { test } from "node:test";
import assert from "node:assert/strict";

test("prototype discount probe", () => {
  const discount = (amount) => amount / 2;
  assert.equal(discount(20), 10);
});
