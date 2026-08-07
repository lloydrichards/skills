import assert from "node:assert/strict"
import test from "node:test"
import { RunStore } from "../src/run-store.js"

test("retains completed runs for replay", () => {
  const store = new RunStore()
  store.start("run-1")
  store.append("run-1", { type: "text", value: "hello" })
  store.complete("run-1")

  assert.deepEqual(store.get("run-1"), {
    id: "run-1",
    status: "complete",
    events: [{ type: "text", value: "hello" }]
  })
})
