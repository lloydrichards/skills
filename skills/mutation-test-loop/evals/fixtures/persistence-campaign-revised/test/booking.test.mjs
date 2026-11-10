import assert from "node:assert/strict"
import test from "node:test"
import { quote } from "../src/booking.mjs"

test("rejects a zero-night booking", () => {
  assert.throws(() => quote({ nights: 0, tier: "standard" }), /positive integer/)
})

test("rejects an unknown tier", () => {
  assert.throws(() => quote({ nights: 1, tier: "economy" }), /tier must be/)
})

test("rejects an unknown coupon", () => {
  assert.throws(() => quote({ nights: 1, tier: "standard", coupon: "FREE" }), /coupon is invalid/)
})

test("prices a standard booking without a discount", () => {
  assert.equal(quote({ nights: 2, tier: "standard" }), 200)
})

test("applies SAVE10 to a standard booking", () => {
  assert.equal(quote({ nights: 2, tier: "standard", coupon: "SAVE10" }), 180)
})

test("applies SAVE20 only to a premium booking", () => {
  assert.equal(quote({ nights: 2, tier: "premium", coupon: "SAVE20" }), 288)
})
