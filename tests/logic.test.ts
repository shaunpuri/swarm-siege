import { describe, expect, test } from "bun:test";
import { LEVELS, levelById } from "@/config/levels";
import { JUMP_LEN, buildRoute, dist, distToPolyline, pointAt, smoothLegs, smoothPath } from "@/game/geometry";
import { placePads } from "@/game/pads";
import { planWave } from "@/game/waves";
import { createGame } from "@/game/state";
import { buildTower, repairCost, repairTower, sellTower, specializeTower, upgradeTower } from "@/game/towers";
import { damageBase, damageEnemy, damageTower } from "@/game/combat";
import type { Entry } from "@/types";
import { upgradeBase } from "@/game/bases";
import { evolve, topFamily } from "@/game/adapt";
import { usePower } from "@/game/powers";
import { STEP, startWave, step } from "@/game/loop";
import { spawnEnemy } from "@/game/enemies";
import { updateMelee } from "@/game/melee";
import { castVines, slashVineAt, vineTip } from "@/game/vines";

describe("geometry", () => {
  test("pointAt walks the polyline", () => {
    const r = buildRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], 0);
    expect(r.length).toBe(150);
    expect(pointAt(r, 50).pos).toEqual({ x: 50, y: 0 });
    expect(pointAt(r, 125).pos).toEqual({ x: 100, y: 25 });
    expect(pointAt(r, 999).pos).toEqual({ x: 100, y: 50 });
  });
});

describe("levels", () => {
  test("ten levels with the design sheet economy", () => {
    expect(LEVELS.map((l) => l.startCoins)).toEqual([200, 300, 450, 600, 800, 1200, 900, 1000, 1100, 1500]);
    expect(LEVELS.map((l) => l.waves)).toEqual([6, 6, 6, 6, 6, 12, 8, 8, 10, 12]);
    for (const l of LEVELS) {
      expect(l.routes.length).toBe(l.routeBase.length);
      for (const [i, route] of l.routes.entries()) {
        const end = route[route.length - 1];
        const base = l.bases[l.routeBase[i] ?? -1];
        expect(end && base && dist(end, base.pos)).toBeLessThan(1);
      }
    }
  });

  test("painted pads stay exactly where drawn and extra pads fill toward the target", () => {
    for (const l of LEVELS) {
      const paths = l.routes.map((r) => smoothPath(r));
      const pads = placePads(l, paths);
      expect(pads.length).toBeLessThanOrEqual(l.padTarget);
      expect(pads.length).toBeGreaterThanOrEqual(Math.min(l.padTarget, l.pads.length + 3));
      expect(pads.slice(0, l.pads.length)).toEqual(l.pads);
      for (const p of pads.slice(l.pads.length)) {
        for (const r of paths) expect(distToPolyline(p, r)).toBeGreaterThanOrEqual(80);
        for (const q of pads) if (q !== p) expect(dist(p, q)).toBeGreaterThanOrEqual(140);
      }
    }
  });

  test("smoothed roads still start at the entrance and end at their base", () => {
    for (const l of LEVELS) {
      const game = createGame(l);
      for (const route of game.routes) {
        const end = route.points[route.points.length - 1];
        const base = game.bases[route.baseIndex];
        expect(end && base && dist(end, base.pos)).toBeLessThan(1);
        expect(route.length).toBeGreaterThan(400);
      }
    }
  });
});

describe("waves follow the escalation brief", () => {
  test("wave 1 is scouts only, wave 2 adds exactly one brute", () => {
    const l = levelById(2);
    expect(planWave(l, 0).summary).toEqual([{ kind: "scout", boss: false, count: expect.any(Number) }]);
    const w2 = planWave(l, 1).summary;
    expect(w2.find((s) => s.kind === "brute")?.count).toBe(1);
  });

  test("final wave of level 10 has every type plus the Titan boss", () => {
    const l = levelById(10);
    const kinds = planWave(l, l.waves - 1).summary.map((s) => `${s.kind}${s.boss ? "!" : ""}`);
    expect(kinds).toEqual(expect.arrayContaining(["scout", "brute", "overlord", "titan!"]));
  });

  test("level 6 ends with an Overlord boss, level 7 has no boss", () => {
    const l6 = levelById(6);
    expect(planWave(l6, l6.waves - 1).summary.some((s) => s.boss && s.kind === "overlord")).toBe(true);
    const l7 = levelById(7);
    expect(planWave(l7, l7.waves - 1).summary.some((s) => s.boss)).toBe(false);
  });
});

describe("towers", () => {
  test("build, upgrade, specialise, damage, repair, sell", () => {
    const game = createGame(levelById(5));
    game.coins = 5000;
    const t = buildTower(game, 0, "basic");
    expect(t).not.toBeNull();
    if (!t) return;
    expect(buildTower(game, 0, "rapid")).toBeNull();
    expect(specializeTower(game, t, "ricochet")).toBe(false);
    expect(upgradeTower(game, t)).toBe(true);
    expect(upgradeTower(game, t)).toBe(true);
    expect(upgradeTower(game, t)).toBe(false);
    expect(specializeTower(game, t, "flame")).toBe(false);
    expect(specializeTower(game, t, "ricochet")).toBe(true);
    damageTower(game, t, 100);
    expect(repairCost(t)).toBeGreaterThan(0);
    const before = game.coins;
    expect(repairTower(game, t)).toBe(true);
    expect(t.hp).toBe(t.maxHp);
    expect(game.coins).toBeLessThan(before);
    sellTower(game, t);
    expect(game.towers.length).toBe(0);
    expect(game.pads[0]?.towerId).toBeNull();
  });

  test("locked tower types cannot be built", () => {
    const game = createGame(levelById(1));
    expect(buildTower(game, 0, "heavy")).toBeNull();
  });

  test("a destroyed turret frees its pad", () => {
    const game = createGame(levelById(1));
    const t = buildTower(game, 0, "basic");
    if (!t) throw new Error("build failed");
    damageTower(game, t, 9999);
    expect(game.towers.length).toBe(0);
    expect(game.pads[0]?.towerId).toBeNull();
  });
});

describe("adaptive swarm", () => {
  test("dominant family becomes the next wave's resistance", () => {
    expect(topFamily({ basic: 10, rapid: 80, heavy: 10, frost: 0 })).toEqual({ family: "rapid", share: 0.8 });
    const game = createGame(levelById(3));
    game.adapt.damage = { basic: 10, rapid: 80, heavy: 10, frost: 0 };
    evolve(game);
    expect(game.adapt.resist).toBe("rapid");
    const e = spawnEnemy(game, { at: 0, kind: "scout", boss: false, route: 0 });
    expect(e.resist).toBe("rapid");
  });

  test("balanced damage does not trigger evolution, level 1 never evolves", () => {
    const game = createGame(levelById(3));
    game.adapt.damage = { basic: 40, rapid: 35, heavy: 25, frost: 0 };
    evolve(game);
    expect(game.adapt.resist).toBeNull();
    const intro = createGame(levelById(1));
    intro.adapt.damage = { basic: 100, rapid: 0, heavy: 0, frost: 0 };
    evolve(intro);
    expect(intro.adapt.resist).toBeNull();
  });
});

describe("powers and vines", () => {
  test("powers cost coins and go on cooldown", () => {
    const game = createGame(levelById(5));
    game.coins = 1000;
    expect(usePower(game, "overclock", null)).toBe(true);
    expect(game.power.overclock).toBeGreaterThan(0);
    expect(usePower(game, "overclock", null)).toBe(false);
    expect(usePower(game, "strike", null)).toBe(false);
    expect(usePower(game, "strike", { x: 300, y: 300 })).toBe(true);
  });

  test("titan vines poison a turret and can be cut", () => {
    const game = createGame(levelById(10));
    game.coins = 5000;
    const t = buildTower(game, 0, "heavy");
    if (!t) throw new Error("build failed");
    const titan = spawnEnemy(game, { at: 0, kind: "titan", boss: true, route: 2 });
    titan.pos = { x: t.pos.x + 100, y: t.pos.y };
    castVines(game, titan);
    const vine = game.vines.find((v) => v.target.kind === "tower");
    expect(vine).toBeDefined();
    if (!vine) return;
    for (let i = 0; i < 120; i++) step(game, STEP);
    expect(t.hp).toBeLessThan(t.maxHp);
    const hit = slashVineAt(game, vineTip(vine));
    expect(hit).toBe(true);
    slashVineAt(game, vineTip(vine));
    step(game, STEP);
    expect(game.vines.some((v) => v.id === vine.id)).toBe(false);
  });

  test("waves run to completion and the first wave can be won", () => {
    const game = createGame(levelById(1));
    buildTower(game, 0, "basic");
    buildTower(game, 1, "basic");
    startWave(game);
    let guard = 0;
    while (game.status === "wave" && guard < 60 * 120) {
      step(game, STEP);
      guard += 1;
    }
    expect(game.status).toBe("between");
    expect(game.coins).toBeGreaterThan(60);
  });
});

describe("base upgrades", () => {
  test("levels 2 and 3 cost coins, add HP, defences and the cryo shield", () => {
    const game = createGame(levelById(5));
    const base = game.bases[0];
    if (!base) throw new Error("no base");
    game.coins = 100;
    expect(upgradeBase(game, base)).toBe(false);
    game.coins = 1000;
    const hp = base.maxHp;
    expect(upgradeBase(game, base)).toBe(true);
    expect(base.level).toBe(2);
    expect(base.maxHp).toBeGreaterThan(hp);
    expect(game.coins).toBe(750);
    expect(upgradeBase(game, base)).toBe(true);
    expect(base.level).toBe(3);
    expect(base.shield).toBeGreaterThan(0);
    expect(upgradeBase(game, base)).toBe(false);
  });

  test("an upgraded base shoots enemies in range and the shield soaks a leak", () => {
    const game = createGame(levelById(1));
    const base = game.bases[0];
    if (!base) throw new Error("no base");
    game.coins = 1000;
    upgradeBase(game, base);
    upgradeBase(game, base);
    const e = spawnEnemy(game, { at: 0, kind: "scout", boss: false, route: 0 });
    e.pos = { x: base.pos.x - 60, y: base.pos.y };
    e.dist = (game.routes[0]?.length ?? 0) - 60;
    const before = e.hp;
    for (let i = 0; i < 120; i++) step(game, STEP);
    expect(e.hp).toBeLessThan(before);
    const hp = base.hp;
    damageBase(game, 0, 2);
    expect(base.hp).toBe(hp);
  });
});

describe("burrows, drop zones and portals", () => {
  test("portal hops are short warps that hide the enemy and keep the route ends", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 500, y: 300 }, { x: 600, y: 300 }];
    const legs = smoothLegs(pts, [1]);
    const route = buildRoute(legs.points, 0, legs.jumps, "tunnel");
    expect(legs.jumps.size).toBe(1);
    expect(route.length).toBeLessThan(260);
    const mid = pointAt(route, 100 + JUMP_LEN / 2);
    expect(mid.warp).toBeGreaterThan(0.9);
    expect(pointAt(route, 50).warp).toBe(0);
  });

  test("enemies landing from the sky cannot be hit until they touch down", () => {
    const entries: Entry[] = ["drop"];
    const level = { ...levelById(1), entries };
    const game = createGame(level);
    const e = spawnEnemy(game, { at: 0, kind: "scout", boss: false, route: 0 });
    expect(e.intro).toBeGreaterThan(0);
    damageEnemy(game, e, 10, "basic");
    expect(e.hp).toBe(e.maxHp);
    for (let i = 0; i < 90; i++) step(game, STEP);
    expect(e.intro).toBe(0);
    damageEnemy(game, e, 1, "basic");
    expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe("melee", () => {
  test("on early levels one enemy attacks a turret, and keeps at it until the turret falls", () => {
    const game = createGame(levelById(1));
    const tower = buildTower(game, 0, "basic");
    expect(tower).not.toBeNull();
    if (!tower) return;
    const a = spawnEnemy(game, { kind: "brute", route: 0, boss: false, at: 0 });
    const b = spawnEnemy(game, { kind: "brute", route: 0, boss: false, at: 0 });
    for (const e of [a, b]) {
      e.intro = 0;
      e.pos = { x: tower.pos.x + 30, y: tower.pos.y };
    }
    expect(updateMelee(game, a, STEP)).toBe(true);
    expect(updateMelee(game, b, STEP)).toBe(false);
    // it does not give up: still attacking long after a few strikes, until the turret is gone
    let steps = 0;
    while (game.towers.includes(tower) && steps < 20000) {
      expect(updateMelee(game, a, STEP)).toBe(true);
      steps += 1;
    }
    expect(game.towers.includes(tower)).toBe(false);
    expect(updateMelee(game, a, STEP)).toBe(false);
    expect(a.attacking).toBeNull();
  });

  test("on later levels more enemies can attack one turret at once", () => {
    const game = createGame(levelById(9));
    const tower = buildTower(game, 0, "basic");
    if (!tower) return;
    const crowd = [0, 1, 2, 3].map(() => spawnEnemy(game, { kind: "brute", route: 0, boss: false, at: 0 }));
    for (const e of crowd) {
      e.intro = 0;
      e.pos = { x: tower.pos.x + 30, y: tower.pos.y };
    }
    expect(crowd.map((e) => updateMelee(game, e, STEP))).toEqual([true, true, true, false]);
  });
});
