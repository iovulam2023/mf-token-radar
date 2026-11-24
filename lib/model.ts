// Token Radar model "radar-2": one sealed snapshot in, one ranked board out.
//
// Everything below is computed from the snapshot's own ten fields at run time. No protocol name is
// special-cased, no figure is hand-kept, and the same code scores every row, so re-running the
// program on a future snapshot re-fits the model to that snapshot.
//
// Implied token value (what a launch could be worth, before asking how likely it is):
//   The token-bearing protocols in the snapshot are the peers. For each peer, ratio = mcap / TVL.
//   A least-squares fit of log10(ratio) on log10(TVL) over the peers gives a size curve: bigger
//   protocols trade at smaller multiples of TVL. Each category then gets an offset, the mean
//   residual of its peers, shrunk toward zero by its peer count (shrink 8) and clamped to
//   +/-0.5 in log10. A pre-token protocol's multiple is read off that curve at its own TVL, with
//   its category's offset, clamped to [0.01, 1.5], and nudged by seven-day momentum:
//     multiple  = clamp(10^(A + B * (log10(TVL) - X0) + offset_category), 0.01, 1.5)
//     growth    = 1 + 0.4 * clamp(change_7d, -50, 100) / 100        (no report: 1)
//     implied_token_value = round(TVL * multiple * growth)
//
// Airdrop likelihood (the chance this protocol is a launch worth farming), a 0..0.97 blend of:
//   readiness  0.30  how long it has run with no token: ramps up over the first 6 months, full at
//                    four years, then eases to a 0.6 floor by eight years (never launches happen)
//   scale      0.25  log10 TVL between $5M (0) and $5B (1): launches need something to distribute
//   propensity 0.20  the share of the protocol's category that already records a token in this
//                    snapshot, shrunk toward the snapshot-wide share (shrink 10)
//   momentum   0.15  clamp(0.5 + change_7d / 60, 0.1, 1); no report scores 0.5
//   spread     0.10  chains: 0.25 for one chain, +0.15 per extra chain, 1.0 at six or more
//   likelihood = 0.03 + 0.94 * blend, capped at 0.97
//
// The board ranks by expected value, and board.json's implied_value_usd IS that expected value:
//   implied_value_usd = round(implied_token_value * likelihood)
// The unweighted implied token value and the likelihood travel with each row, so a reader can
// re-rank by either. An indicative per-farmer figure assumes a launch sets aside 5% of the implied
// token value for its community and that qualifying wallets scale with TVL ($2,000 of TVL per
// wallet, clamped to 2,500..250,000 wallets):
//   ev_per_farmer = round(implied_token_value * 0.05 * likelihood / wallets)
//
// The board is the watchlist plus the early radar. The watchlist's own definition is the standard
// for what counts as a launch candidate at all: no token on record, and not a wrapped, staked or
// bridged product of a token that already trades (WBTC is Bitcoin, not a future launch). The
// snapshot carries no parent-protocol field, so above the floor the house's list is the only safe
// word: a protocol up there that the list leaves out was left out for a reason the file does not
// show. Below the floor, the radar applies the same candidate rules the snapshot's fields do
// carry (category and name) and ranks every candidate it finds: 178 rows on this snapshot, the
// watchlist's 40 and 138 early rows. Live-token protocols are set aside at the market's values.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted peer curve and the model's fixed weights, as the dashboard states them. */
export interface ModelInfo {
  version: string;
  peer_count: number;
  center_tvl_usd: number;
  ratio_at_center: number;
  slope: number;
  growth_weight: number;
  community_share: number;
  global_propensity: number;
  categories: CategoryInfo[];
}

/** One category's fitted offset and token propensity, from the snapshot's peers. */
export interface CategoryInfo {
  category: string;
  peers: number;
  offset: number;
  propensity: number;
  pre_token: number;
}

export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 30;

const GROWTH_WEIGHT = 0.4;
const GROWTH_FLOOR = -50;
const GROWTH_CAP = 100;
const MULT_MIN = 0.01;
const MULT_MAX = 1.5;
const OFFSET_CLAMP = 0.5;
const OFFSET_SHRINK = 8;
const PROPENSITY_SHRINK = 10;
const COMMUNITY_SHARE = 0.05;

/** One row of board.json: the ranked board's row. implied_value_usd is the expected value. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_token_value_usd: number;
  likelihood: number;
  ev_per_farmer_usd: number;
  model: {
    peer_multiple: number;
    growth_multiplier: number;
    category_offset: number;
    readiness: number;
    scale: number;
    propensity: number;
    momentum: number;
    spread: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_token_value_usd: number;
  likelihood: number;
  ev_per_farmer_usd: number;
  peer_multiple: number;
  growth_multiplier: number;
  readiness: number;
  scale: number;
  propensity: number;
  momentum: number;
  spread: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the fitted model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelInfo;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Categories that are products of another protocol's token, per the watchlist's own definition. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped or staked product may begin with, per the watchlist's definition. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * A launch candidate by the rules the snapshot's fields can carry: pre-token, not a product
 * category, no whole word wrapped/staked/staking in the name, no exchange prefix, not versioned.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isRankable(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** A peer for the value curve: a token whose market cap and TVL are both actually recorded. */
function isPeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

interface Fit {
  center: number;
  intercept: number;
  slope: number;
  offsets: Map<string, number>;
  propensity: Map<string, number>;
  globalPropensity: number;
  peerCount: number;
  categories: CategoryInfo[];
}

/** Fit the peer curve, the category offsets and the category propensities from the snapshot. */
function fitModel(snapshot: Snapshot): Fit {
  const peers = snapshot.protocols.filter(isPeer);
  const xs = peers.map((p) => Math.log10(p.tvl_usd));
  const ys = peers.map((p) => Math.log10((p.mcap_usd as number) / p.tvl_usd));
  const center = xs.reduce((a, b) => a + b, 0) / xs.length;
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - center) * (ys[i]! - yMean);
    den += (xs[i]! - center) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean;

  const residuals = new Map<string, number[]>();
  peers.forEach((p, i) => {
    const r = ys[i]! - (intercept + slope * (xs[i]! - center));
    const key = p.category ?? 'Uncategorised';
    const list = residuals.get(key) ?? [];
    list.push(r);
    residuals.set(key, list);
  });
  const offsets = new Map<string, number>();
  for (const [cat, list] of residuals) {
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    offsets.set(cat, clamp((list.length * mean) / (list.length + OFFSET_SHRINK), -OFFSET_CLAMP, OFFSET_CLAMP));
  }

  const totals = new Map<string, number>();
  const tokenised = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    totals.set(key, (totals.get(key) ?? 0) + 1);
    if (p.gecko_id !== null || p.symbol !== null) tokenised.set(key, (tokenised.get(key) ?? 0) + 1);
  }
  const totalAll = snapshot.protocols.length;
  const tokenAll = snapshot.protocols.filter((p) => p.gecko_id !== null || p.symbol !== null).length;
  const globalPropensity = totalAll > 0 ? tokenAll / totalAll : 0;
  const propensity = new Map<string, number>();
  for (const [cat, n] of totals) {
    propensity.set(cat, ((tokenised.get(cat) ?? 0) + PROPENSITY_SHRINK * globalPropensity) / (n + PROPENSITY_SHRINK));
  }

  const watch = new Set(snapshot.watchlist);
  const preToken = new Map<string, number>();
  for (const p of snapshot.protocols) if (watch.has(p.slug) || (isLaunchCandidate(p) && p.tvl_usd < snapshot.floor_usd)) {
    const key = p.category ?? 'Uncategorised';
    preToken.set(key, (preToken.get(key) ?? 0) + 1);
  }
  const categories: CategoryInfo[] = [...totals.keys()]
    .map((cat) => ({
      category: cat,
      peers: residuals.get(cat)?.length ?? 0,
      offset: round4(offsets.get(cat) ?? 0),
      propensity: round4(propensity.get(cat) ?? globalPropensity),
      pre_token: preToken.get(cat) ?? 0,
    }))
    .filter((c) => c.pre_token > 0)
    .sort((a, b) => b.pre_token - a.pre_token || (a.category < b.category ? -1 : 1));

  return { center, intercept, slope, offsets, propensity, globalPropensity, peerCount: peers.length, categories };
}

/** The five likelihood parts of one protocol, each 0..1, under the fitted model. */
function likelihoodParts(p: SnapshotProtocol, age: number | null, fit: Fit): { readiness: number; scale: number; propensity: number; momentum: number; spread: number } {
  let readiness: number;
  if (age === null) readiness = 0.45;
  else if (age < 180) readiness = (age / 180) * 0.5;
  else if (age <= 1460) readiness = 0.5 + ((age - 180) / 1280) * 0.5;
  else readiness = Math.max(0.6, 1 - ((age - 1460) / 2920) * 0.4);
  const scale = clamp((Math.log10(Math.max(p.tvl_usd, 1)) - Math.log10(5_000_000)) / (Math.log10(5_000_000_000) - Math.log10(5_000_000)), 0, 1);
  const propensity = fit.propensity.get(p.category ?? 'Uncategorised') ?? fit.globalPropensity;
  const momentum = p.change_7d === null ? 0.5 : clamp(0.5 + p.change_7d / 60, 0.1, 1);
  const spread = clamp(0.25 + 0.15 * Math.max(0, p.chains.length - 1), 0.25, 1);
  return { readiness, scale, propensity, momentum, spread };
}

/** One protocol fully scored: the fitted multiple, the implied token value, the likelihood, the expected value. */
function score(p: SnapshotProtocol, asOf: string, fit: Fit): Omit<BoardRow, 'rank' | 'farm_steps'> {
  const age = ageDays(asOf, p.listed_at);
  const offset = fit.offsets.get(p.category ?? 'Uncategorised') ?? 0;
  const rawMultiple = 10 ** (fit.intercept + fit.slope * (Math.log10(Math.max(p.tvl_usd, 1)) - fit.center) + offset);
  const multiple = round4(clamp(rawMultiple, MULT_MIN, MULT_MAX));
  const growthPct = p.change_7d === null ? 0 : clamp(p.change_7d, GROWTH_FLOOR, GROWTH_CAP);
  const growth = round4(1 + (growthPct / 100) * GROWTH_WEIGHT);
  const impliedToken = Math.max(1, Math.round(p.tvl_usd * multiple * growth));
  const parts = likelihoodParts(p, age, fit);
  const blend = 0.3 * parts.readiness + 0.25 * parts.scale + 0.2 * parts.propensity + 0.15 * parts.momentum + 0.1 * parts.spread;
  const likelihood = round4(clamp(0.03 + 0.94 * blend, 0.03, 0.97));
  const expected = Math.max(1, Math.round(impliedToken * likelihood));
  const wallets = clamp(Math.round(p.tvl_usd / 2000), 2500, 250_000);
  const evPerFarmer = Math.round((impliedToken * COMMUNITY_SHARE * likelihood) / wallets);
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: expected,
    implied_token_value_usd: impliedToken,
    likelihood,
    ev_per_farmer_usd: evPerFarmer,
    model: {
      peer_multiple: multiple,
      growth_multiplier: growth,
      category_offset: round4(offset),
      readiness: round4(parts.readiness),
      scale: round4(parts.scale),
      propensity: round4(parts.propensity),
      momentum: round4(parts.momentum),
      spread: round4(parts.spread),
    },
  };
}

/** The protocols the board ranks, strongest expected value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const fit = fitModel(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) if (isLaunchCandidate(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map((p) => score(p, snapshot.as_of, fit));
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return scored.map((s, i) => ({ ...s, rank: i + 1, farm_steps: farmSteps(index.get(s.slug)!, s.age_days) }));
}

// ---------------------------------------------------------------- farm plans

/** Chains where a small position costs little to run, judged by name as the snapshot writes it. */
const CHEAP_CHAINS = new Set(['Base', 'Arbitrum One', 'Optimism', 'Polygon', 'Solana', 'BSC', 'Avalanche', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Sonic', 'Berachain', 'Hyperliquid', 'Fantom', 'Gnosis', 'Celo', 'Moonbeam', 'Near', 'Sui', 'Aptos', 'Sei', 'Starknet', 'Fuel', 'Taiko', 'Plasma', 'Katana', 'Abstract', 'Ink', 'Unichain', 'World Chain', 'MegaETH']);

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The network-fee wording for a position opened on `chain`. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8-20 of mainnet gas, less at quiet times';
  if (CHEAP_CHAINS.has(chain)) return 'about $1-3 of network fees';
  return 'about $2-6 of network fees';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('dex')) return `Swap $${capital} of USDC for the chain's main asset in ${n} on ${chain}, then add the pair to its main liquidity pool.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral in ${n} on ${chain}, then borrow a small amount against it and repay once.`;
  if (c.includes('bridge') || c.includes('canonical')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then use the bridged funds in one app on the far side.`;
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${n} on ${chain} and hold the receipt token in the same wallet.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin in ${n} on ${chain} and open one small hedged trade, then close it flat.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a curated ${n} vault on ${chain} and keep the vault shares in the wallet.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into the ${n} basis vault on ${chain} and leave the position to accrue funding yield.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield asset ${n} offers on ${chain}, completing any identity check the venue itself requires first.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and make ${n}'s own apps your weekly route: one swap and one deposit each week.`;
  if (c.includes('privacy')) return `Deposit $${capital} of USDC into ${n}'s shielded pool on ${chain}, hold it there, then withdraw part of it a week later.`;
  if (c.includes('prediction')) return `Fund ${n} with $${capital} on ${chain} and place one small position in its most active market.`;
  if (c.includes('index')) return `Mint $${capital} of an index token in ${n} on ${chain} and hold it rather than trading the components yourself.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for a position you already hold and keep the policy to expiry.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into a ${n} yield vault on ${chain} and turn on compounding if the vault offers it.`;
  if (c.includes('launchpad')) return `Register the wallet with ${n} on ${chain} and take part in one live sale or allocation round with up to $${capital}.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open and visible.`;
}

/** The category's second, different qualifying action, so a plan is not one deposit repeated. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `In the second week, adjust the ${n} position once: add a little collateral or repay part of the borrow, so the account shows two kinds of use.`;
  if (c.includes('dex') || c.includes('yield')) return `In the second week, make one plain swap in ${n} on ${chain} separate from the liquidity position, so the wallet is a user and not only a deposit.`;
  if (c.includes('bridge') || c.includes('canonical')) return `In the second week, bridge a smaller amount back through ${n} and leave the rest working on ${chain}: a round trip reads as real use, not a one-way drop.`;
  if (c.includes('staking') || c.includes('restak')) return `In the second week, use the receipt token once: deposit it in a partner market ${n} lists, or vote with it if the protocol runs votes.`;
  return `In the second week, repeat ${n}'s core action with a smaller amount on ${chain}, so the wallet shows a pattern of use across two snapshots.`;
}

/** One step kept inside the gate's 20..600 characters whatever the inputs. */
function step(s: string): string {
  if (s.length > 600) return `${s.slice(0, 596)}...`;
  if (s.length < 20) return `${s} Hold the position and recheck weekly.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with its cost and its time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const multi = p.chains.length > 1 ? ` It also runs on ${p.chains[1]}, so the same wallet can repeat the position there later.` : '';
  return [
    step(`Start with a fresh wallet that holds only the funds for this farm, its seed phrase written offline, funded on ${chain}. Cost: ${gas} to fund and make the first transaction. Time: 10 minutes.`),
    step(`${actionFor(p, capital, chain)} Cost: $${capital} of capital plus ${gas}. Time: 15 minutes to set up.${multi}`),
    step(secondActionFor(p, chain) + ` Cost: about $2-5 of fees. Time: 10 minutes.`),
    step(`Keep the position open for at least ${hold} days and make one qualifying action every week, so the activity spans several weekly snapshots. Cost: the $${capital} stays in the position, plus about $2 a week of fees. Time: 10 minutes a week.`),
    step(`Each week, open ${p.name}'s own app and check its points, rewards or governance page for a snapshot or claim notice, and follow only links the app itself shows. Cost: nothing to check, and never pay a fee to claim an airdrop. Time: 5 minutes a week.`),
    step(`Keep a farm log with the wallet, the dates and every transaction hash, and review it monthly: exit or scale down if TVL falls by a third in a week, and follow the claim steps in the app if a token is announced. Cost: nothing but the log. Time: 5 minutes a month.`),
  ];
}

// ---------------------------------------------------------------- dashboard data

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const fit = fitModel(snapshot);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: {
      version: MODEL_VERSION,
      peer_count: fit.peerCount,
      center_tvl_usd: Math.round(10 ** fit.center),
      ratio_at_center: round4(10 ** fit.intercept),
      slope: round4(fit.slope),
      growth_weight: GROWTH_WEIGHT,
      community_share: COMMUNITY_SHARE,
      global_propensity: round4(fit.globalPropensity),
      categories: fit.categories,
    },
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      implied_token_value_usd: r.implied_token_value_usd,
      likelihood: r.likelihood,
      ev_per_farmer_usd: r.ev_per_farmer_usd,
      peer_multiple: r.model.peer_multiple,
      growth_multiplier: r.model.growth_multiplier,
      readiness: r.model.readiness,
      scale: r.model.scale,
      propensity: r.model.propensity,
      momentum: r.model.momentum,
      spread: r.model.spread,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_token_value_usd) || r.implied_token_value_usd <= 0) return `${r.slug} has implied token value ${r.implied_token_value_usd}`;
    if (!(r.likelihood > 0 && r.likelihood <= 1)) return `${r.slug} has likelihood ${r.likelihood}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
