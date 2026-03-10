// Logarithmic Market Scoring Rule (LMSR) utilities
// b = liquidity parameter. Higher b = less price movement per trade.
const B = 100;

/**
 * Returns the current probability of YES (0–1).
 */
export function yesPrice(yesShares: number, noShares: number): number {
  const ey = Math.exp(yesShares / B);
  const en = Math.exp(noShares / B);
  return ey / (ey + en);
}

/**
 * Cost in tokens to buy `delta` shares of `outcome`.
 * Positive delta = buying, negative = selling.
 * Returns token cost (positive = user pays, negative = user receives).
 */
export function costToBuy(
  outcome: "yes" | "no",
  delta: number,
  yesShares: number,
  noShares: number
): number {
  const newYes = outcome === "yes" ? yesShares + delta : yesShares;
  const newNo = outcome === "no" ? noShares + delta : noShares;
  const before = B * Math.log(Math.exp(yesShares / B) + Math.exp(noShares / B));
  const after = B * Math.log(Math.exp(newYes / B) + Math.exp(newNo / B));
  return after - before;
}

/**
 * Returns the new YES probability after buying `delta` shares of `outcome`.
 */
export function priceAfterTrade(
  outcome: "yes" | "no",
  delta: number,
  yesShares: number,
  noShares: number
): number {
  const newYes = outcome === "yes" ? yesShares + delta : yesShares;
  const newNo = outcome === "no" ? noShares + delta : noShares;
  return yesPrice(newYes, newNo);
}
