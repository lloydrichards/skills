export const quote = ({ nights, tier, coupon }) => {
  if (!Number.isInteger(nights) || nights < 1) {
    throw new Error("nights must be a positive integer")
  }
  if (tier !== "standard" && tier !== "premium") {
    throw new Error("tier must be standard or premium")
  }
  if (coupon !== undefined && coupon !== "SAVE10" && coupon !== "SAVE20") {
    throw new Error("coupon is invalid")
  }

  const nightlyRate = tier === "premium" ? 180 : 100
  const discount = coupon === "SAVE20" && tier === "premium"
    ? 0.2
    : coupon === "SAVE10"
      ? 0.1
      : 0

  return nights * nightlyRate * (1 - discount)
}
