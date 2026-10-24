import { MAP_MODES, levelsFor } from "@/config/levels";
import { BADGES } from "@/badges";
import { BADGE_DIAMONDS, CLEAR_DIAMONDS, DAILY_DIAMONDS, STAR_DIAMONDS, START_DIAMONDS, shopItem } from "@/config/shop";

// Diamond accounts, kept on the server so balances cannot be edited in a browser. An account
// is a player name plus a 4 digit PIN (no email, no password: a game wallet, not a bank). The
// first use of a name creates it. Saved to a JSON file after every change.

export type Account = { pin: string; diamonds: number; stars: Record<string, number>; badges: string[]; daily: string; owned: string[]; frame: string; title: string };
export type Wallets = { accounts: Map<string, Account>; file: string };
export type Profile = { name: string; diamonds: number; owned: string[]; frame: string; title: string };

function isAccount(v: unknown): v is Account {
  if (typeof v !== "object" || v === null) return false;
  const a: { [k: string]: unknown } = { ...v };
  return typeof a["pin"] === "string" && typeof a["diamonds"] === "number" && typeof a["stars"] === "object" && Array.isArray(a["badges"]) && typeof a["daily"] === "string" && Array.isArray(a["owned"]) && typeof a["frame"] === "string" && typeof a["title"] === "string";
}

export async function openWallets(file: string): Promise<Wallets> {
  const accounts = new Map<string, Account>();
  const f = Bun.file(file);
  if (await f.exists()) {
    const data: unknown = await f.json();
    if (typeof data === "object" && data !== null) for (const [k, v] of Object.entries(data)) if (isAccount(v)) accounts.set(k, v);
  }
  return { accounts, file };
}

function save(w: Wallets): void {
  void Bun.write(w.file, JSON.stringify(Object.fromEntries(w.accounts)));
}

export function cleanName(name: string): string {
  return name.replace(/[^\w .-]/g, "").trim().slice(0, 16);
}

const key = (name: string): string => cleanName(name).toLowerCase();

// the account for this name and PIN (created on first use), or an error
export function login(w: Wallets, name: string, pin: string): Account | string {
  if (!cleanName(name)) return "Enter a name";
  if (!/^\d{4}$/.test(pin)) return "PIN must be 4 digits";
  const found = w.accounts.get(key(name));
  if (found) return found.pin === pin ? found : "Wrong PIN for that name";
  const fresh: Account = { pin, diamonds: START_DIAMONDS, stars: {}, badges: [], daily: "", owned: [], frame: "", title: "" };
  w.accounts.set(key(name), fresh);
  save(w);
  return fresh;
}

export function profileOf(name: string, a: Account): Profile {
  return { name: cleanName(name), diamonds: a.diamonds, owned: a.owned, frame: a.frame, title: a.title };
}

export function addDiamonds(w: Wallets, a: Account, delta: number): void {
  a.diamonds = Math.max(0, Math.round(a.diamonds + delta));
  save(w);
}

// a campaign reward: "level:<mode>:<id>:<stars>", "badge:<id>" or "daily:<yyyy-mm-dd>"; each
// pays once (a level pays again only for stars it had not earned before). Returns the payout.
// only rewards that exist can be claimed: a real campaign level, a real badge, and the daily
// gift for the server's own date (whatever date the page sends)
function realLevel(mode: string, id: string): boolean {
  const found = MAP_MODES.find((m) => m === mode);
  return found !== undefined && found.startsWith("world-") && levelsFor(found).some((l) => String(l.id) === id);
}

export function claim(w: Wallets, a: Account, reward: string, today = new Date().toISOString().slice(0, 10)): number {
  const [kind, ...rest] = reward.split(":");
  let pay = 0;
  if (kind === "level" && rest.length === 3 && realLevel(rest[0] ?? "", rest[1] ?? "")) {
    const levelKey = `${rest[0]}:${rest[1]}`;
    const stars = Math.max(0, Math.min(3, Number(rest[2]) || 0));
    const had = a.stars[levelKey];
    if (had === undefined) pay = CLEAR_DIAMONDS + STAR_DIAMONDS * stars;
    else if (stars > had) pay = STAR_DIAMONDS * (stars - had);
    if (had === undefined || stars > had) a.stars[levelKey] = stars;
  } else if (kind === "badge" && rest[0] && BADGES.some((b) => b.id === rest[0]) && !a.badges.includes(rest[0])) {
    a.badges.push(rest[0]);
    pay = BADGE_DIAMONDS;
  } else if (kind === "daily" && a.daily !== today) {
    a.daily = today;
    pay = DAILY_DIAMONDS;
  }
  if (pay > 0) addDiamonds(w, a, pay);
  return pay;
}

// buy a shop item, or equip one already owned
export function buy(w: Wallets, a: Account, id: string): string | null {
  const item = shopItem(id);
  if (!item) return "No such item";
  if (!a.owned.includes(id)) {
    if (a.diamonds < item.price) return "Not enough diamonds";
    a.diamonds -= item.price;
    a.owned.push(id);
  }
  if (item.kind === "frame") a.frame = a.frame === id ? "" : id;
  else a.title = a.title === id ? "" : id;
  save(w);
  return null;
}
