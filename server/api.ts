import type { Wallets } from "@server/wallet";
import { buy, claim, login, profileOf } from "@server/wallet";

// The diamond wallet over HTTP: every call posts {name, pin} and gets the profile back.
//   POST /api/wallet  {name, pin}          the profile (creates the account on first use)
//   POST /api/claim   {name, pin, reward}  a campaign reward (see wallet.ts claim) + profile
//   POST /api/buy     {name, pin, item}    buy or equip a shop item + profile
// The dev page is served from another port, so answers allow any origin.

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };

function reply(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function field(body: unknown, name: string): string {
  if (typeof body !== "object" || body === null) return "";
  const v: unknown = Object.entries(body).find(([k]) => k === name)?.[1];
  return typeof v === "string" ? v.slice(0, 80) : "";
}

export async function handleApi(w: Wallets, req: Request, path: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: HEADERS });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Bad request" }, 400);
  }
  const name = field(body, "name");
  const account = login(w, name, field(body, "pin"));
  if (typeof account === "string") return reply({ error: account }, 400);
  if (path === "/api/wallet") return reply({ profile: profileOf(name, account) });
  if (path === "/api/claim") {
    const earned = claim(w, account, field(body, "reward"));
    return reply({ earned, profile: profileOf(name, account) });
  }
  if (path === "/api/buy") {
    const error = buy(w, account, field(body, "item"));
    return error ? reply({ error, profile: profileOf(name, account) }, 400) : reply({ profile: profileOf(name, account) });
  }
  return reply({ error: "Not found" }, 404);
}
