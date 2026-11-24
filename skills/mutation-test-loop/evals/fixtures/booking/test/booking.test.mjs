import { expect, test } from "vitest"
import { quote } from "../src/booking.mjs"

test("rejects a zero-night booking", () => {
  expect(() => quote({ nights: 0, tier: "standard" })).toThrow(/positive integer/)
})

test("rejects an unknown tier", () => {
  expect(() => quote({ nights: 1, tier: "economy" })).toThrow(/tier must be/)
})

test("rejects an unknown coupon", () => {
  expect(() => quote({ nights: 1, tier: "standard", coupon: "FREE" })).toThrow(/coupon is invalid/)
})

test("prices a standard booking without a discount", () => {
  expect(quote({ nights: 2, tier: "standard" })).toBe(200)
})

test("prices a premium booking", () => {
  expect(quote({ nights: 1, tier: "premium" })).toBeGreaterThan(0)
})

test("applies SAVE10 to a standard booking", () => {
  expect(quote({ nights: 2, tier: "standard", coupon: "SAVE10" })).toBe(180)
})

test("applies SAVE20 only to a premium booking", () => {
  expect(quote({ nights: 2, tier: "premium", coupon: "SAVE20" })).toBe(288)
})
