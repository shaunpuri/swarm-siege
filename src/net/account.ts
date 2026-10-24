// The player's diamond account on the server (server/api.ts): name and 4 digit PIN, kept in
// this browser once signed in. Every call returns the fresh profile; a failed call (offline,
// wrong PIN) returns an error message instead.

export type WalletProfile = { name: string; diamonds: number; owned: string[]; frame: string; title: string };
export type Creds = { name: string; pin: string };

const KEY = "swarm-siege-account";

export function apiBase(): string {
  return location.port === "5173" ? `http://${location.hostname}:5174` : "";
}

export function loadCreds(): Creds | null {
  try {
    const [name, pin] = (localStorage.getItem(KEY) ?? "").split("\n");
    return name && pin ? { name, pin } : null;
  } catch {
    return null;
  }
}

export function saveCreds(c: Creds | null): void {
  try {
    if (c) localStorage.setItem(KEY, `${c.name}\n${c.pin}`);
    else localStorage.removeItem(KEY);
  } catch {
    // stays signed in for this visit only
  }
}

function isProfile(v: unknown): v is WalletProfile {
  if (typeof v !== "object" || v === null) return false;
  const p = Object.fromEntries(Object.entries(v));
  return typeof p["name"] === "string" && typeof p["diamonds"] === "number" && Array.isArray(p["owned"]) && typeof p["frame"] === "string" && typeof p["title"] === "string";
}

export type ApiResult = { profile: WalletProfile; earned: number } | { error: string };

export async function callApi(path: "wallet" | "claim" | "buy", creds: Creds, extra: Record<string, string> = {}): Promise<ApiResult> {
  try {
    const res = await fetch(`${apiBase()}/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...creds, ...extra }) });
    const body: unknown = await res.json();
    const data = typeof body === "object" && body !== null ? Object.fromEntries(Object.entries(body)) : {};
    const err = data["error"];
    if (typeof err === "string") return { error: err };
    const profile = data["profile"];
    const earned = data["earned"];
    if (!isProfile(profile)) return { error: "Bad answer from the server" };
    return { profile, earned: typeof earned === "number" ? earned : 0 };
  } catch {
    return { error: "Could not reach the server" };
  }
}
