export const parseRetryAfter = (value, nowMs) => {
  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return seconds * 1_000
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp - nowMs
}
