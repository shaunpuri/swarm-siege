// The diamond shop: collection and show-off items only, never power (a 1 vs 1 must stay fair).
// Avatar frames ring your avatar on the profile and in rooms; titles show under your name.

export type ShopItem = { id: string; kind: "frame" | "title"; name: string; price: number; color: string };

export const SHOP: ShopItem[] = [
  { id: "frame-gold", kind: "frame", name: "Gold Frame", price: 150, color: "#facc15" },
  { id: "frame-ice", kind: "frame", name: "Ice Frame", price: 250, color: "#7dd3fc" },
  { id: "frame-flame", kind: "frame", name: "Flame Frame", price: 400, color: "#f97316" },
  { id: "frame-neon", kind: "frame", name: "Neon Frame", price: 600, color: "#e879f9" },
  { id: "title-defender", kind: "title", name: "Defender", price: 100, color: "#4ade80" },
  { id: "title-slayer", kind: "title", name: "Swarm Slayer", price: 300, color: "#f87171" },
  { id: "title-roller", kind: "title", name: "High Roller", price: 500, color: "#facc15" },
  { id: "title-legend", kind: "title", name: "Arena Legend", price: 1000, color: "#22d3ee" },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP.find((i) => i.id === id);
}

// How many diamonds the campaign pays: the first clear of a level, and every new star on it
export const CLEAR_DIAMONDS = 30;
export const STAR_DIAMONDS = 10;
export const BADGE_DIAMONDS = 25;
export const DAILY_DIAMONDS = 20;
// a new account starts with enough to bet
export const START_DIAMONDS = 200;
