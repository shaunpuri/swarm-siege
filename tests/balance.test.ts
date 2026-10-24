import { describe, expect, test } from "bun:test";
import { LEVELS, levelsFor } from "@/config/levels";
import type { MapMode } from "@/config/levels";
import { simulate } from "@/game/bot";

// Headless playthroughs of every level. Slow-ish (a few seconds), but they catch
// balance regressions: each level must be beatable by an average bot and must be
// lost when the player does nothing.

describe("balance", () => {
  for (const level of LEVELS) {
    test(`level ${level.id} is winnable by the bot`, () => {
      const r = simulate(level.id);
      console.log(`L${level.id} ${r.status} wave ${r.wave}/${level.waves} base ${r.baseHp}/${r.maxBaseHp} towers ${r.towers} ${r.seconds}s`);
      expect(r.status).toBe("won");
    }, 30000);

    test(`level ${level.id} is lost with no defence`, () => {
      const r = simulate(level.id, { build: false });
      expect(r.status).toBe("lost");
    }, 30000);
  }
});

// the painting modes and the five campaign worlds (every world level that is traced so far)
const PAINTING_MODES: MapMode[] = ["grassland", "cyber", "world-grassland", "world-snow", "world-desert", "world-water", "world-cyber"];

for (const mode of PAINTING_MODES) {
  describe(`balance, ${mode} painting mode`, () => {
    for (const level of levelsFor(mode)) {
      test(`${mode} level ${level.id} is winnable by the bot`, () => {
        const r = simulate(level.id, { build: true, mode });
        console.log(`${mode}${level.id} ${r.status} wave ${r.wave}/${level.waves} base ${r.baseHp}/${r.maxBaseHp}`);
        expect(r.status).toBe("won");
      }, 30000);
    }
  });
}

// Winning should take skill: a button-masher that only builds turrets (no repairs, upgrades,
// powers or vine cutting) must lose most levels after the first, across all map modes (Medium
// was made friendlier on request, so "most" is 70%).
describe("skill matters", () => {
  test("the build-only bot loses most levels from level 2 on", () => {
    const modes: MapMode[] = ["maps", "grassland", "cyber", "world-grassland", "world-snow", "world-desert", "world-water", "world-cyber"];
    const runs = modes.flatMap((mode) => levelsFor(mode).filter((l) => l.id >= 2).map((l) => simulate(l.id, { build: true, mode, lazy: true })));
    const lost = runs.filter((r) => r.status === "lost").length;
    console.log(`build-only bot lost ${lost}/${runs.length}`);
    expect(lost / runs.length).toBeGreaterThanOrEqual(0.7);
  }, 300000);
});
