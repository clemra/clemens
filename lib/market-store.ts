import fs from "fs";
import path from "path";

export interface User {
  username: string;
  tokens: number;
  yesShares: number;
  noShares: number;
}

export interface Trade {
  id: string;
  username: string;
  outcome: "yes" | "no";
  shares: number;
  cost: number;
  timestamp: string;
}

export interface Market {
  question: string;
  yesShares: number;
  noShares: number;
  resolved: boolean;
  resolution: "yes" | "no" | null;
}

export interface MarketStore {
  market: Market;
  users: Record<string, User>;
  trades: Trade[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "market.json");

const DEFAULT_STORE: MarketStore = {
  market: {
    question: "Will Langfuse V4 be released today?",
    yesShares: 100,
    noShares: 100,
    resolved: false,
    resolution: null,
  },
  users: {},
  trades: [],
};

export function readStore(): MarketStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return structuredClone(DEFAULT_STORE);
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as MarketStore;
  } catch {
    return structuredClone(DEFAULT_STORE);
  }
}

export function writeStore(data: MarketStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}
