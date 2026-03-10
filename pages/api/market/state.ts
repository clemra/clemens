import type { NextApiRequest, NextApiResponse } from "next";
import { readStore } from "../../../lib/market-store";
import { yesPrice } from "../../../lib/lmsr";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const store = readStore();
  const { market, trades } = store;
  const yp = yesPrice(market.yesShares, market.noShares);

  res.status(200).json({
    question: market.question,
    yesShares: market.yesShares,
    noShares: market.noShares,
    yesPrice: yp,
    noPrice: 1 - yp,
    resolved: market.resolved,
    resolution: market.resolution,
    trades: trades.slice(-20).reverse(),
  });
}
