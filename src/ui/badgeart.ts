import type { BadgeDef } from "@/badges";

// The badge emblems, drawn as SVG (100x100): a frame for the kind of badge and a glyph for
// what it rewards, in the badge's colour.
//   campaign skill badges   a shield: star (first victory), crossed swords (Medium), flame
//                           (Hard), gem (flawless), turret (minimalist), lightning (speed run)
//   world boss badges       a crest with laurels and a crown, the gem in the world's colour;
//                           the Hard legends burn with a ring of flames
//   versus badges           a round medal on a ribbon: a trophy, a wall
// Locked badges are drawn dark and grey.

type Frame = "shield" | "crest" | "medal";
type Glyph = "star" | "swords" | "flame" | "gem" | "turret" | "bolt" | "crown" | "trophy" | "wall";

const WORLD_GEM: Record<string, string> = { grassland: "#4ade80", snow: "#7dd3fc", desert: "#fbbf24", water: "#22d3ee", cyber: "#e879f9" };

const FRAMES: Record<Frame, string> = {
  shield: "M50 6 L88 18 L86 52 C84 74 68 88 50 96 C32 88 16 74 14 52 L12 18 Z",
  crest: "M50 4 L86 22 L86 66 L50 96 L14 66 L14 22 Z",
  medal: "M50 14 A38 38 0 1 1 49.9 14 Z",
};

const GLYPHS: Record<Glyph, string> = {
  star: '<path d="M50 24 L57 42 L76 43 L61 55 L66 74 L50 63 L34 74 L39 55 L24 43 L43 42 Z"/>',
  swords: '<path d="M30 28 L36 26 L66 60 L70 58 L72 64 L66 66 L64 70 L58 68 L60 64 L28 34 Z"/><path d="M70 28 L64 26 L34 60 L30 58 L28 64 L34 66 L36 70 L42 68 L40 64 L72 34 Z"/>',
  flame: '<path d="M50 22 C56 36 70 42 68 60 C67 72 58 78 50 78 C40 78 32 70 33 58 C34 48 42 46 42 36 C48 42 48 48 50 52 C54 44 54 32 50 22 Z"/>',
  gem: '<path d="M32 40 L42 28 L58 28 L68 40 L50 74 Z"/><path d="M32 40 L68 40 M42 28 L46 40 L50 74 M58 28 L54 40 L50 74" stroke="rgba(0,0,0,0.35)" stroke-width="2" fill="none"/>',
  turret: '<path d="M36 74 L64 74 L60 50 L40 50 Z"/><rect x="38" y="40" width="24" height="12" rx="3"/><rect x="56" y="36" width="20" height="7" rx="3"/>',
  bolt: '<path d="M56 20 L34 54 L48 54 L42 80 L68 42 L53 42 Z"/>',
  crown: '<path d="M28 64 L26 34 L40 46 L50 28 L60 46 L74 34 L72 64 Z"/><rect x="28" y="66" width="44" height="7" rx="2"/>',
  trophy: '<path d="M36 26 L64 26 L62 46 C61 54 56 58 50 58 C44 58 39 54 38 46 Z"/><path d="M36 30 C26 30 26 44 38 46 M64 30 C74 30 74 44 62 46" stroke="currentColor" stroke-width="4" fill="none"/><rect x="46" y="58" width="8" height="10"/><rect x="38" y="68" width="24" height="6" rx="2"/>',
  wall: '<rect x="28" y="30" width="20" height="10"/><rect x="52" y="30" width="20" height="10"/><rect x="28" y="44" width="10" height="10"/><rect x="42" y="44" width="16" height="10"/><rect x="62" y="44" width="10" height="10"/><rect x="28" y="58" width="20" height="10"/><rect x="52" y="58" width="20" height="10"/>',
};

function look(b: BadgeDef): { frame: Frame; glyph: Glyph; gem: string | null; burning: boolean } {
  if (b.id.startsWith("boss-")) return { frame: "crest", glyph: "crown", gem: WORLD_GEM[b.id.slice(5)] ?? null, burning: false };
  if (b.id.startsWith("hard-") && b.id !== "hard-win") return { frame: "crest", glyph: "crown", gem: WORLD_GEM[b.id.slice(5)] ?? null, burning: true };
  if (b.id === "vs-win") return { frame: "medal", glyph: "trophy", gem: null, burning: false };
  if (b.id === "vs-iron") return { frame: "medal", glyph: "wall", gem: null, burning: false };
  const glyph: Record<string, Glyph> = { "first-win": "star", "medium-win": "swords", "hard-win": "flame", flawless: "gem", minimalist: "turret", speedrun: "bolt" };
  return { frame: "shield", glyph: glyph[b.id] ?? "star", gem: null, burning: false };
}

// a ring of flames round a Hard legend's crest
function flames(color: string): string {
  let out = "";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = 50 + Math.cos(a) * 46;
    const y = 52 + Math.sin(a) * 46;
    const r = (a * 180) / Math.PI + 90;
    out += `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(0)})" d="M0 -9 C4 -3 5 2 0 6 C-5 2 -4 -3 0 -9 Z" fill="${color}"/>`;
  }
  return out;
}

export function badgeSvg(b: BadgeDef, earned: boolean, size = 64): string {
  const { frame, glyph, gem, burning } = look(b);
  const id = `g-${b.id}-${earned ? 1 : 0}`;
  const c = earned ? b.color : "#475569";
  const dark = earned ? "#0f172a" : "#1e293b";
  const ink = earned ? "#ffffff" : "#64748b";
  const ribbon =
    frame === "medal"
      ? `<path d="M34 6 L46 30 L38 34 L26 10 Z M66 6 L54 30 L62 34 L74 10 Z" fill="${earned ? "#1d4ed8" : "#334155"}"/>`
      : "";
  const laurels =
    frame === "crest"
      ? `<path d="M10 78 C2 60 4 40 14 26 M90 78 C98 60 96 40 86 26" stroke="${earned ? "#facc15" : "#475569"}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : "";
  const crownGem = gem && glyph === "crown" ? `<circle cx="50" cy="56" r="6" fill="${earned ? gem : "#475569"}" stroke="#0f172a" stroke-width="1.5"/>` : "";
  return `<svg class="badge-svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
${burning ? flames(earned ? "#f97316" : "#334155") : ""}${ribbon}${laurels}
<path d="${FRAMES[frame]}" fill="url(#${id})" stroke="${earned ? "#fef9c3" : "#334155"}" stroke-width="3"/>
<path d="${FRAMES[frame]}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1" transform="translate(50 52) scale(0.84) translate(-50 -52)"/>
<g fill="${ink}" color="${ink}">${GLYPHS[glyph]}</g>${crownGem}
</svg>`;
}
