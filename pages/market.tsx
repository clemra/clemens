import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarketState {
  question: string;
  yesShares: number;
  noShares: number;
  yesPrice: number;
  noPrice: number;
  resolved: boolean;
  resolution: "yes" | "no" | null;
  trades: Trade[];
}

interface Trade {
  id: string;
  username: string;
  outcome: "yes" | "no";
  shares: number;
  cost: number;
  timestamp: string;
}

interface User {
  username: string;
  tokens: number;
  yesShares: number;
  noShares: number;
}

// ─── LMSR cost preview (client-side mirror) ──────────────────────────────────

function lmsrCostPreview(
  outcome: "yes" | "no",
  delta: number,
  yesShares: number,
  noShares: number
): number {
  const B = 100;
  const newYes = outcome === "yes" ? yesShares + delta : yesShares;
  const newNo = outcome === "no" ? noShares + delta : noShares;
  const before = B * Math.log(Math.exp(yesShares / B) + Math.exp(noShares / B));
  const after = B * Math.log(Math.exp(newYes / B) + Math.exp(newNo / B));
  return after - before;
}

function priceAfter(
  outcome: "yes" | "no",
  delta: number,
  yesShares: number,
  noShares: number
): number {
  const B = 100;
  const newYes = outcome === "yes" ? yesShares + delta : yesShares;
  const newNo = outcome === "no" ? noShares + delta : noShares;
  const ey = Math.exp(newYes / B);
  const en = Math.exp(newNo / B);
  return ey / (ey + en);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(p: number) {
  return (p * 100).toFixed(1) + "%";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [market, setMarket] = useState<MarketState | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registering, setRegistering] = useState(false);

  const [outcome, setOutcome] = useState<"yes" | "no">("yes");
  const [sharesInput, setSharesInput] = useState("10");
  const [trading, setTrading] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [tradeSuccess, setTradeSuccess] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch market state ──
  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch("/api/market/state");
      if (res.ok) setMarket(await res.json());
    } catch {
      // silently ignore poll errors
    }
  }, []);

  // ── Fetch user ──
  const fetchUser = useCallback(async (name: string) => {
    const res = await fetch(`/api/market/user?username=${encodeURIComponent(name)}`);
    if (res.ok) setUser(await res.json());
  }, []);

  // ── On mount: restore username from localStorage ──
  useEffect(() => {
    const stored = localStorage.getItem("pm_username");
    if (stored) {
      setUsername(stored);
      fetchUser(stored);
    }
    fetchMarket();
  }, [fetchMarket, fetchUser]);

  // ── Poll every 5 seconds ──
  useEffect(() => {
    pollRef.current = setInterval(fetchMarket, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMarket]);

  // ── Also refresh user balance on poll when logged in ──
  useEffect(() => {
    if (!username) return;
    const id = setInterval(() => fetchUser(username), 5000);
    return () => clearInterval(id);
  }, [username, fetchUser]);

  // ── Register ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");
    setRegistering(true);
    try {
      const res = await fetch("/api/market/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data.error || "Registration failed");
      } else {
        localStorage.setItem("pm_username", data.username);
        setUsername(data.username);
        setUser(data);
      }
    } catch {
      setRegisterError("Network error");
    } finally {
      setRegistering(false);
    }
  };

  // ── Trade ──
  const handleTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setTradeError("");
    setTradeSuccess("");
    const shares = parseFloat(sharesInput);
    if (!Number.isFinite(shares) || shares <= 0) {
      setTradeError("Enter a valid number of shares");
      return;
    }
    setTrading(true);
    try {
      const res = await fetch("/api/market/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, outcome, shares }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeError(data.error || "Trade failed");
      } else {
        setUser(data.user);
        setTradeSuccess(
          `Bought ${shares} ${outcome.toUpperCase()} shares. New odds: ${pct(data.yesPrice)} YES`
        );
        fetchMarket();
      }
    } catch {
      setTradeError("Network error");
    } finally {
      setTrading(false);
    }
  };

  // ── Cost preview ──
  const shares = parseFloat(sharesInput);
  const validShares = Number.isFinite(shares) && shares > 0;
  const costPreview =
    market && validShares
      ? lmsrCostPreview(outcome, shares, market.yesShares, market.noShares)
      : null;
  const priceAfterPreview =
    market && validShares
      ? priceAfter(outcome, shares, market.yesShares, market.noShares)
      : null;

  const canAfford = costPreview !== null && user !== null && costPreview <= user.tokens;

  // ── Implied portfolio value ──
  const portfolioValue =
    market && user
      ? user.yesShares * market.yesPrice + user.noShares * market.noPrice
      : null;

  return (
    <>
      <Head>
        <title>Langfuse Prediction Market</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
        {/* ── Header ── */}
        <header className="border-b border-gray-800 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Langfuse Prediction Market
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Internal forecasting · Bet with fake tokens</p>
            </div>
            {user && (
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{user.username}</div>
                <div className="text-xs text-yellow-400">{user.tokens.toFixed(1)} tokens</div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {/* ── Onboarding ── */}
          {!username && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-1">Join the market</h2>
              <p className="text-xs text-gray-500 mb-4">
                Pick a username and get 1,000 tokens to start betting.
              </p>
              <form onSubmit={handleRegister} className="flex gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="your_username"
                  maxLength={30}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                  disabled={registering}
                />
                <button
                  type="submit"
                  disabled={registering || !usernameInput.trim()}
                  className="bg-white text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {registering ? "..." : "Join"}
                </button>
              </form>
              {registerError && (
                <p className="text-red-400 text-xs mt-2">{registerError}</p>
              )}
            </section>
          )}

          {/* ── Market Card ── */}
          {market && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Active Market</p>
                  <h2 className="text-base font-semibold text-white leading-snug">
                    {market.question}
                  </h2>
                </div>
                {market.resolved && (
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded ${
                      market.resolution === "yes"
                        ? "bg-green-900 text-green-300"
                        : "bg-red-900 text-red-300"
                    }`}
                  >
                    RESOLVED {market.resolution?.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Probability bar */}
              <div className="relative h-8 rounded-lg overflow-hidden flex mb-3">
                <div
                  className="bg-green-600 flex items-center justify-start pl-3 transition-all duration-500"
                  style={{ width: `${market.yesPrice * 100}%` }}
                >
                  <span className="text-xs font-bold text-white whitespace-nowrap">
                    YES {pct(market.yesPrice)}
                  </span>
                </div>
                <div
                  className="bg-red-700 flex items-center justify-end pr-3 transition-all duration-500"
                  style={{ width: `${market.noPrice * 100}%` }}
                >
                  <span className="text-xs font-bold text-white whitespace-nowrap">
                    {pct(market.noPrice)} NO
                  </span>
                </div>
              </div>

              {/* Big numbers */}
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-bold text-green-400">{pct(market.yesPrice)}</div>
                  <div className="text-xs text-gray-500">YES chance</div>
                </div>
                <div className="w-px bg-gray-800" />
                <div>
                  <div className="text-2xl font-bold text-red-400">{pct(market.noPrice)}</div>
                  <div className="text-xs text-gray-500">NO chance</div>
                </div>
              </div>
            </section>
          )}

          {/* ── Trade Panel ── */}
          {username && market && !market.resolved && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">Place a bet</h2>

              <form onSubmit={handleTrade} className="space-y-4">
                {/* YES / NO toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setOutcome("yes")}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      outcome === "yes"
                        ? "bg-green-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutcome("no")}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      outcome === "no"
                        ? "bg-red-700 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    NO
                  </button>
                </div>

                {/* Shares input */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Number of shares</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={sharesInput}
                    onChange={(e) => {
                      setSharesInput(e.target.value);
                      setTradeError("");
                      setTradeSuccess("");
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                  />
                </div>

                {/* Cost preview */}
                {costPreview !== null && priceAfterPreview !== null && (
                  <div className="bg-gray-800 rounded-lg px-4 py-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cost</span>
                      <span className={`font-semibold ${canAfford ? "text-white" : "text-red-400"}`}>
                        {costPreview.toFixed(2)} tokens
                        {!canAfford && user && (
                          <span className="text-gray-500 font-normal ml-1">
                            (you have {user.tokens.toFixed(1)})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">New YES odds</span>
                      <span className="text-white font-semibold">{pct(priceAfterPreview)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Each share pays</span>
                      <span className="text-gray-300">1 token if correct, 0 if wrong</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={trading || !canAfford || !validShares}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    outcome === "yes"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-700 hover:bg-red-600 text-white"
                  }`}
                >
                  {trading ? "Buying..." : `Buy ${sharesInput || "?"} ${outcome.toUpperCase()} shares`}
                </button>

                {tradeError && <p className="text-red-400 text-xs">{tradeError}</p>}
                {tradeSuccess && <p className="text-green-400 text-xs">{tradeSuccess}</p>}
              </form>
            </section>
          )}

          {/* ── Your Position ── */}
          {user && market && (user.yesShares > 0 || user.noShares > 0) && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">Your position</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">YES shares</div>
                  <div className="text-xl font-bold text-green-400">{user.yesShares.toFixed(1)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Worth ~{(user.yesShares * market.yesPrice).toFixed(1)} tokens
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">NO shares</div>
                  <div className="text-xl font-bold text-red-400">{user.noShares.toFixed(1)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Worth ~{(user.noShares * market.noPrice).toFixed(1)} tokens
                  </div>
                </div>
              </div>
              {portfolioValue !== null && (
                <p className="text-xs text-gray-500 mt-3">
                  Total position value at current odds:{" "}
                  <span className="text-gray-300 font-semibold">{portfolioValue.toFixed(1)} tokens</span>
                </p>
              )}
            </section>
          )}

          {/* ── Recent Trades ── */}
          {market && market.trades.length > 0 && (
            <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-3">Recent trades</h2>
              <ul className="space-y-2">
                {market.trades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      <span className="text-white font-semibold">{t.username}</span> bought{" "}
                      <span
                        className={
                          t.outcome === "yes" ? "text-green-400 font-semibold" : "text-red-400 font-semibold"
                        }
                      >
                        {t.shares} {t.outcome.toUpperCase()}
                      </span>{" "}
                      for {t.cost.toFixed(1)} tokens
                    </span>
                    <span className="text-gray-600 ml-4 shrink-0">{timeAgo(t.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── How it works ── */}
          <section className="border border-gray-800 rounded-xl p-5 text-xs text-gray-500 space-y-1.5">
            <p className="text-gray-400 font-semibold mb-2">How it works</p>
            <p>• Each user starts with <span className="text-gray-300">1,000 tokens</span>.</p>
            <p>• Buy YES or NO shares. More buyers → price moves.</p>
            <p>• Prices are set by <span className="text-gray-300">LMSR</span> — a proper market maker used by Polymarket and Metaculus.</p>
            <p>• If the market resolves YES, each YES share pays <span className="text-gray-300">1 token</span>. NO shares pay 0.</p>
            <p>• Tokens are play money — this is for fun and calibration only.</p>
          </section>

        </main>
      </div>
    </>
  );
}

// Bypass Nextra layout for this page — render it standalone
MarketPage.getLayout = (page: React.ReactElement) => page;
