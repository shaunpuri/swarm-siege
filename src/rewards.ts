import type { BadgeDef } from "@/badges";
import { callApi, loadCreds } from "@/net/account";

// Diamonds for playing the campaign, paid by the server wallet (server/wallet.ts claim): the
// first clear of a level and every new star on it, each new badge, and a daily gift. Only for
// a signed in player; the server makes sure each reward pays once. Calls back with the total
// earned so the end screen can show it.

export async function claimRewards(rewards: string[], onEarned: (diamonds: number) => void): Promise<void> {
  const creds = loadCreds();
  if (!creds) return;
  let total = 0;
  for (const reward of rewards) {
    const r = await callApi("claim", creds, { reward });
    if (!("error" in r)) total += r.earned;
  }
  if (total > 0) onEarned(total);
}

export function levelRewards(mode: string, levelId: number, stars: number, badges: BadgeDef[]): string[] {
  return [`level:${mode}:${levelId}:${stars}`, ...badges.map((b) => `badge:${b.id}`)];
}

export function dailyReward(): string {
  return `daily:${new Date().toISOString().slice(0, 10)}`;
}
