import type { NextApiRequest, NextApiResponse } from "next";
import { readStore, writeStore } from "../../../lib/market-store";

const INITIAL_TOKENS = 1000;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username required" });
    }
    const store = readStore();
    const user = store.users[username];
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json(user);
  }

  if (req.method === "POST") {
    const { username } = req.body as { username?: string };
    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "username required" });
    }
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!clean) {
      return res.status(400).json({ error: "Username may only contain letters, numbers, _ and -" });
    }
    const store = readStore();
    if (store.users[clean]) {
      return res.status(409).json({ error: "Username already taken" });
    }
    store.users[clean] = {
      username: clean,
      tokens: INITIAL_TOKENS,
      yesShares: 0,
      noShares: 0,
    };
    writeStore(store);
    return res.status(201).json(store.users[clean]);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
