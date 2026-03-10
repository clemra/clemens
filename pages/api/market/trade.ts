import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/market-store";
import { costToBuy, yesPrice } from "../../../lib/lmsr";
import { randomUUID } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, outcome, shares } = req.body as {
    username?: string;
    outcome?: string;
    shares?: number;
  };

  if (!username || !outcome || !shares) {
    return res.status(400).json({ error: "username, outcome, and shares are required" });
  }
  if (outcome !== "yes" && outcome !== "no") {
    return res.status(400).json({ error: "outcome must be 'yes' or 'no'" });
  }
  const numShares = Number(shares);
  if (!Number.isFinite(numShares) || numShares <= 0) {
    return res.status(400).json({ error: "shares must be a positive number" });
  }

  const store = readStore();

  if (store.market.resolved) {
    return res.status(400).json({ error: "Market is already resolved" });
  }

  const user = store.users[username];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const cost = costToBuy(outcome, numShares, store.market.yesShares, store.market.noShares);

  if (cost > user.tokens) {
    return res.status(400).json({
      error: `Insufficient tokens. Trade costs ${cost.toFixed(2)} tokens but you have ${user.tokens.toFixed(2)}.`,
    });
  }

  // Apply trade
  user.tokens -= cost;
  if (outcome === "yes") {
    store.market.yesShares += numShares;
    user.yesShares += numShares;
  } else {
    store.market.noShares += numShares;
    user.noShares += numShares;
  }

  store.trades.push({
    id: randomUUID(),
    username,
    outcome,
    shares: numShares,
    cost: Math.round(cost * 100) / 100,
    timestamp: new Date().toISOString(),
  });

  writeStore(store);

  const newYesPrice = yesPrice(store.market.yesShares, store.market.noShares);

  return res.status(200).json({
    user: store.users[username],
    yesPrice: newYesPrice,
    noPrice: 1 - newYesPrice,
  });
}
