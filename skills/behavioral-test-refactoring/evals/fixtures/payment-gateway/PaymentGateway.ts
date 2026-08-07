export type Currency = "USD" | "JPY"

export interface Receipt {
  readonly displayTotal: string
  readonly id: string
}

export interface ProviderCall {
  readonly name: "idempotency" | "charge"
  readonly value: string
}

export const checkout = (
  amount: number,
  currency: Currency,
  calls: Array<ProviderCall>,
): Receipt => {
  calls.push({ name: "idempotency", value: `checkout-${currency}-${amount}` })
  calls.push({ name: "charge", value: `${currency}:${amount}` })

  return {
    displayTotal: currency === "JPY" ? `JPY ${Math.round(amount)}` : `USD ${amount.toFixed(2)}`,
    id: `receipt-${currency}-${amount}`,
  }
}
