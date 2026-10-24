import type { WalletProfile } from "@/net/account";
import { SHOP } from "@/config/shop";
import { GEM, gems } from "@/ui/arena";
import { button, h, show } from "@/ui/dom";

// The diamond shop: avatar frames and titles to collect and show off (no power for sale).
// Owned items equip or unequip with one click.

export function showShop(el: HTMLElement, wallet: WalletProfile | null, error: string, opts: { onBuy: (id: string) => void; onBack: () => void }): void {
  el.innerHTML = "";
  el.className = "screen camp profile";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "PROFILE", opts.onBack));
  bar.appendChild(h("div", "camp-title", "SHOP"));
  const wealth = h("div", "camp-stars");
  wealth.innerHTML = wallet ? gems(wallet.diamonds) : "";
  bar.appendChild(wealth);
  el.appendChild(bar);
  const box = h("div", "pbadges");
  box.style.marginTop = "84px";
  for (const kind of ["frame", "title"] as const) {
    box.appendChild(h("h3", "", kind === "frame" ? "AVATAR FRAMES" : "TITLES"));
    const grid = h("div", "pbadge-grid");
    for (const item of SHOP.filter((i) => i.kind === kind)) {
      const owned = wallet?.owned.includes(item.id) ?? false;
      const on = wallet?.frame === item.id || wallet?.title === item.id;
      const card = h("div", `pbadge shop-item on ${on ? "equipped" : ""}`);
      card.style.setProperty("--c", item.color);
      const look = kind === "frame" ? `<span class="avatar avatar-lg" style="box-shadow:0 0 0 4px ${item.color},0 0 18px ${item.color}">${(wallet?.name ?? "?").slice(0, 1).toUpperCase()}</span>` : `<em class="ptitle big" style="color:${item.color}">${item.name}</em>`;
      card.innerHTML = `${look}<b>${item.name}</b>`;
      const label = on ? "EQUIPPED" : owned ? "EQUIP" : `${GEM}${item.price}`;
      const afford = owned || (wallet?.diamonds ?? 0) >= item.price;
      card.appendChild(button(`small buy ${afford ? "" : "disabled"}`, label, () => afford && opts.onBuy(item.id)));
      grid.appendChild(card);
    }
    box.appendChild(grid);
  }
  el.appendChild(box);
  if (error) el.appendChild(h("div", "vs-error", error));
  if (!wallet) el.appendChild(h("div", "vs-note", "Sign in to your diamond wallet in Arena Stakes to use the shop."));
  show(el, true);
}
