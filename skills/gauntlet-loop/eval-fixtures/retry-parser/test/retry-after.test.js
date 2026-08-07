import assert from "node:assert/strict"
import test from "node:test"
import { parseRetryAfter } from "../src/retry-after.js"

test("returns milliseconds for numeric seconds", () => {
  assert.equal(parseRetryAfter("2.5", 0), 2_500)
})
