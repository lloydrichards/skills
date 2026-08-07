import { describe, expect, it } from "vitest"

import { checkout, type ProviderCall } from "./PaymentGateway"

describe("PaymentGateway", () => {
  it("creates a checkout receipt", () => {
    const calls: Array<ProviderCall> = []

    const receipt = checkout(12, "USD", calls)

    expect(receipt).toMatchInlineSnapshot(`
      {
        "displayTotal": "USD 12.00",
        "id": "receipt-USD-12",
      }
    `)
  })

  it("sends the idempotency key before charging", () => {
    const calls: Array<ProviderCall> = []

    checkout(12, "USD", calls)

    expect(calls.map((call) => call.name)).toEqual(["idempotency", "charge"])
  })

  // Regression added in 2024 after a provider rounding incident. No issue or provider version was recorded.
  it("rounds provider amounts", () => {
    const calls: Array<ProviderCall> = []

    expect(checkout(12.6, "JPY", calls).displayTotal).toBe("JPY 13")
  })

  it("charges USD", () => {
    const calls: Array<ProviderCall> = []

    expect(checkout(12, "USD", calls).displayTotal).toBe("USD 12.00")
  })

  it("charges JPY", () => {
    const calls: Array<ProviderCall> = []

    expect(checkout(12, "JPY", calls).displayTotal).toBe("JPY 12")
  })
})
