import { describe, expect, test } from "bun:test";
import type { Biome, Enemy, EnemyKind, Game, TowerKind } from "@/types";
import { LEVELS, levelsFor } from "@/config/levels";
import { TOWERS } from "@/config/towers";
import { usePower } from "@/game/powers";
import { damageBase, damageEnemy } from "@/game/combat";
import { buySend, createMatch, receiveSend, sendKinds } from "@/game/match";
import { createGame } from "@/game/state";
import { buildTower, specializeTower, upgradeTower } from "@/game/towers";
import { spawnEnemy } from "@/game/enemies";
import { step, startWave } from "@/game/loop";
import { upgradeBase } from "@/game/bases";
import { RIVER_SPOTS } from "@/config/riverspots";
import { STORM_GATHER } from "@/game/storms";
import { pointAt } from "@/game/geometry";
import { AI_NAME, connectAi } from "@/net/airival";

// Every mechanic, in every world, driven head to head in a real game: each turret type at each
// level fires and hurts, the level 3 storms, ricochets and roots work, every enemy fights
// turrets and the base, every enemy ability and every boss (entrance, transformation, special)
// fires, the base weapons shoot, and nothing ever leaves a shot hanging.

const BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];
const DT = 1 / 60;

function worldGame(biome: Biome, id = 10): Game {
  const level = levelsFor(`world-${biome}`).find((l) => l.id === id);
  if (!level) throw new Error(`no ${biome} level ${id}`);
  const game = createGame(level);
  game.coins = 1e6;
  game.status = "wave";
  return game;
}

function run(game: Game, seconds: number): void {
  for (let i = 0; i < seconds / DT; i++) step(game, DT);
}

// how far along route 0 the road passes nearest to a point
function nearestDist(game: Game, near: { x: number; y: number }): number {
  const route = game.routes[0];
  if (!route) throw new Error("no route");
  let best = 0;
  let bestD = Infinity;
  for (let d = 0; d < route.length; d += 4) {
    const p = pointAt(route, d).pos;
    const dd = Math.hypot(p.x - near.x, p.y - near.y);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

// an enemy standing still on the road beside a point (it does not walk off, nothing spawns)
function dummy(game: Game, kind: EnemyKind, near: { x: number; y: number }, hp = 1e6): Enemy {
  const e = spawnEnemy(game, { at: 0, kind, boss: false, route: 0 });
  const route = game.routes[0];
  if (!route) throw new Error("no route");
  e.intro = 0;
  e.hp = hp;
  e.maxHp = hp;
  e.speed = 0;
  e.abilityTimer = 1e9;
  e.dist = nearestDist(game, near);
  e.pos = pointAt(route, e.dist).pos;
  e.emergeFrom = null;
  return e;
}

// the pad nearest route 0 (every turret there can reach the road)
function firstPad(game: Game): number {
  let best = 0;
  let bestD = Infinity;
  game.pads.forEach((pad, i) => {
    const route = game.routes[0];
    if (!route) return;
    const d = Math.hypot(pointAt(route, nearestDist(game, pad.pos)).pos.x - pad.pos.x, pointAt(route, nearestDist(game, pad.pos)).pos.y - pad.pos.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

describe("every turret, every level, every world", () => {
  for (const biome of BIOMES) {
    const kinds: TowerKind[] = worldGame(biome).level.towers;
    for (const kind of kinds) {
      for (const level of [1, 2, 3]) {
        test(`${biome} ${kind} L${level} fires and does damage`, () => {
          const game = worldGame(biome);
          const pad = firstPad(game);
          const tower = buildTower(game, pad, kind);
          expect(tower).not.toBeNull();
          if (!tower) return;
          for (let l = 1; l < level; l++) expect(upgradeTower(game, tower)).toBe(true);
          expect(tower.level).toBe(level);
          const e = dummy(game, "scout", tower.pos);
          run(game, 3);
          expect(e.hp).toBeLessThan(1e6);
          // nothing left hanging: every shot lands or expires
          game.enemies = [];
          run(game, 3);
          expect(game.projectiles.length).toBe(0);
        });
      }
    }
  }
});

describe("level 3 world specials", () => {
  for (const biome of ["desert", "water", "snow"] as const) {
    test(`${biome} level 3 turret casts its storm, which hits enemies one by one`, () => {
      const game = worldGame(biome);
      const tower = buildTower(game, firstPad(game), "frost");
      if (!tower) throw new Error("no tower");
      upgradeTower(game, tower);
      upgradeTower(game, tower);
      const a = dummy(game, "scout", tower.pos);
      const b = dummy(game, "scout", tower.pos);
      run(game, 0.5);
      expect(game.storms.length).toBe(1);
      const storm = game.storms[0];
      expect(storm?.kind).toBe(biome === "desert" ? "sandstorm" : biome === "water" ? "ocean" : "snowstorm");
      run(game, STORM_GATHER + 2);
      expect(storm?.hits ?? 0).toBeGreaterThan(2);
      expect(a.hp + b.hp).toBeLessThan(2e6);
      expect(tower.special).toBeGreaterThan(0);
    });
  }

  test("ocean storm slows what it catches", () => {
    const game = worldGame("water");
    const tower = buildTower(game, firstPad(game), "frost");
    if (!tower) throw new Error("no tower");
    upgradeTower(game, tower);
    upgradeTower(game, tower);
    const e = dummy(game, "scout", tower.pos);
    run(game, STORM_GATHER + 1);
    expect(e.slowTime).toBeGreaterThan(0);
    expect(e.slowFactor).toBeLessThan(1);
  });

  test("Worldroot Guardian roots hit up to four enemies at once", () => {
    const game = worldGame("grassland");
    const tower = buildTower(game, firstPad(game), "frost");
    if (!tower) throw new Error("no tower");
    upgradeTower(game, tower);
    upgradeTower(game, tower);
    const foes = [0, 1, 2, 3, 4].map(() => dummy(game, "scout", tower.pos));
    run(game, 0.6);
    expect(foes.filter((f) => f.hp < 1e6).length).toBeGreaterThanOrEqual(4);
  });

  for (const biome of ["snow", "water"] as const) {
    test(`${biome} level 3 shot ricochets to more enemies`, () => {
      const game = worldGame(biome);
      const tower = buildTower(game, firstPad(game), "basic");
      if (!tower) throw new Error("no tower");
      upgradeTower(game, tower);
      upgradeTower(game, tower);
      const foes = [0, 1, 2].map((i) => dummy(game, "scout", { x: tower.pos.x + i * 30, y: tower.pos.y }));
      run(game, 1.2);
      expect(foes.filter((f) => f.hp < 1e6).length).toBeGreaterThanOrEqual(2);
    });
  }
});

describe("enemies fight back", () => {
  for (const biome of BIOMES) {
    for (const kind of ["scout", "brute", "overlord"] as const) {
      test(`${biome} ${kind} attacks a turret beside the road`, () => {
        const game = worldGame(biome);
        const tower = buildTower(game, firstPad(game), "frost");
        if (!tower) throw new Error("no tower");
        tower.cooldown = 1e9;
        const hp = tower.hp;
        const e = dummy(game, kind, tower.pos);
        e.speed = 0;
        run(game, 3);
        expect(e.attacking === tower.id || tower.hp < hp).toBe(true);
        expect(tower.hp).toBeLessThan(hp);
      });
    }

    test(`${biome} enemies strike the base when they reach it`, () => {
      const game = worldGame(biome, 1);
      const base = game.bases[0];
      if (!base) throw new Error("no base");
      const before = base.hp;
      const e = spawnEnemy(game, { at: 0, kind: "scout", boss: false, route: 0 });
      e.intro = 0;
      const route = game.routes[0];
      if (!route) throw new Error("no route");
      e.dist = route.length - 2;
      run(game, 3);
      expect(base.hp).toBeLessThan(before);
    });

    for (const kind of ["brute", "overlord"] as const) {
      test(`${biome} ${kind} uses its special ability (the attack animation reads cast)`, () => {
        const game = worldGame(biome);
        const tower = buildTower(game, firstPad(game), "frost");
        if (!tower) throw new Error("no tower");
        tower.cooldown = 1e9;
        tower.hp = 1e9;
        tower.maxHp = 1e9;
        const e = spawnEnemy(game, { at: 0, kind, boss: false, route: 0 });
        e.intro = 0;
        e.emergeFrom = null;
        // beside the turret on the road, its ability ready
        e.abilityTimer = 0;
        e.hp = 1e9;
        e.dist = nearestDist(game, tower.pos);
        e.speed = 30;
        run(game, 6);
        expect(e.cast).toBeGreaterThan(0);
      });
    }
  }
});

describe("final bosses", () => {
  for (const biome of BIOMES) {
    test(`${biome} final boss enters, transforms, uses its special and takes damage`, () => {
      const game = worldGame(biome, 10);
      // a ring of maxed turrets
      game.pads.forEach((_, i) => {
        const t = buildTower(game, i, "frost");
        if (t) {
          upgradeTower(game, t);
          upgradeTower(game, t);
        }
      });
      game.status = "ready";
      game.wave = game.level.waves - 1;
      startWave(game);
      let sawBoss = false;
      let entered = false;
      let morphed = false;
      let cast = false;
      let hurt = false;
      const fighting = (): boolean => game.status === "wave";
      for (let i = 0; i < 400 / DT && fighting(); i++) {
        step(game, DT);
        const boss = game.enemies.find((e) => e.boss);
        if (!boss) continue;
        sawBoss = true;
        if (boss.intro <= 0) entered = true;
        if (boss.morph >= 1) morphed = true;
        if (boss.cast > 0) cast = true;
        if (boss.hp < boss.maxHp) hurt = true;
      }
      expect(sawBoss).toBe(true);
      expect(entered).toBe(true);
      expect(morphed).toBe(true);
      expect(cast).toBe(true);
      expect(hurt).toBe(true);
    }, 60000);
  }
});

describe("bases", () => {
  test("upgraded bases fire their weapons", () => {
    const game = worldGame("grassland", 1);
    const base = game.bases[0];
    if (!base) throw new Error("no base");
    upgradeBase(game, base);
    upgradeBase(game, base);
    expect(base.level).toBe(3);
    const e = dummy(game, "scout", { x: base.pos.x - 60, y: base.pos.y });
    run(game, 3);
    expect(e.hp).toBeLessThan(1e6);
  });
});

describe("the anaconda", () => {
  test("rises out of the river and slides onto the road on every Grassland level with water", () => {
    for (const level of levelsFor("world-grassland")) {
      const game = createGame(level);
      game.routes.forEach((route, r) => {
        const spot = RIVER_SPOTS[level.id]?.[r] ?? null;
        const e = spawnEnemy(game, { at: 0, kind: "overlord", boss: false, route: r });
        if (!spot) {
          expect(e.emergeFrom).toBeNull();
          return;
        }
        expect(e.emergeFrom).not.toBeNull();
        const start = { ...e.pos };
        for (let i = 0; i < 4 / DT && e.intro > 0; i++) step(game, DT);
        const road = pointAt(route, e.dist).pos;
        expect(Math.hypot(e.pos.x - road.x, e.pos.y - road.y)).toBeLessThan(40);
        expect(Math.hypot(start.x - road.x, start.y - road.y)).toBeGreaterThan(15);
        game.enemies = [];
      });
    }
  });
});

describe("power-ups", () => {
  test("every power works", () => {
    const game = worldGame("desert", 5);
    const tower = buildTower(game, firstPad(game), "basic");
    if (!tower) throw new Error("no tower");
    const e = dummy(game, "brute", tower.pos);
    // overclock: faster fire
    expect(usePower(game, "overclock", null)).toBe(true);
    expect(game.power.overclock).toBeGreaterThan(0);
    // surge: double-damage shots on every turret
    expect(usePower(game, "surge", null)).toBe(true);
    expect(tower.boostShots).toBeGreaterThan(0);
    // cryo field
    expect(usePower(game, "cryo", null)).toBe(true);
    expect(game.power.cryo).toBeGreaterThan(0);
    // repair drones heal
    tower.hp = 1;
    expect(usePower(game, "repair", null)).toBe(true);
    expect(tower.hp).toBeGreaterThan(1);
    // shield blocks base damage
    expect(usePower(game, "shield", null)).toBe(true);
    const base = game.bases[0];
    if (!base) throw new Error("no base");
    const hp = base.hp;
    damageBase(game, 0, 5);
    expect(base.hp).toBe(hp);
    // orbital strike lands after its delay and hurts
    const before = e.hp;
    expect(usePower(game, "strike", e.pos)).toBe(true);
    run(game, 1.5);
    expect(e.hp).toBeLessThan(before);
  });
});

describe("abilities (specialisations)", () => {
  for (const kind of ["basic", "rapid", "heavy"] as const) {
    test(`every ${kind} ability fires and hurts`, () => {
      for (const spec of TOWERS[kind].specs) {
        const level = levelsFor("grassland").find((l) => l.id === 10) ?? LEVELS[9];
        if (!level) throw new Error("no level");
        const game = createGame(level);
        game.coins = 1e6;
        game.status = "wave";
        const tower = buildTower(game, firstPad(game), kind);
        if (!tower) throw new Error(`no ${kind}`);
        upgradeTower(game, tower);
        upgradeTower(game, tower);
        expect(specializeTower(game, tower, spec)).toBe(true);
        const e = dummy(game, "brute", tower.pos);
        run(game, 3);
        expect(e.hp).toBeLessThan(1e6);
      }
    });
  }
});

describe("online versus sends", () => {
  test("every send can be bought and arrives on the rival's board", () => {
    const level = levelsFor("world-cyber").find((l) => l.id === 3);
    if (!level) throw new Error("no level");
    const me = createGame(level);
    const rival = createGame(level);
    me.match = createMatch();
    rival.match = createMatch();
    me.coins = 1e6;
    for (const kind of sendKinds()) {
      expect(buySend(me, kind)).toBe(true);
      receiveSend(rival, kind);
    }
    const m = rival.match;
    expect(m.pending.length + (m.hpMul > 1 ? 1 : 0) + (m.speedMul > 1 ? 1 : 0)).toBeGreaterThan(0);
  });
});

describe("play vs AI", () => {
  test("the AI rival plays its own board, sends enemies, and the match is judged", () => {
    let started = false;
    let incoming = 0;
    const session = connectAi("Tester", { onChange: () => {}, onStart: () => (started = true), onResult: () => {} });
    session.link.send({ t: "create", name: "Tester" });
    expect(session.names).toEqual(["Tester", AI_NAME]);
    session.link.send({ t: "start" });
    expect(started).toBe(true);
    // the AI plays for three minutes while we hold out with no defence, then we fall
    for (let i = 0; i < 180 * 60; i++) {
      session.link.tick(DT);
      incoming += session.incoming.length;
      session.incoming = [];
    }
    expect(session.opp).not.toBeNull();
    expect((session.opp?.towers.length ?? 0) > 0).toBe(true);
    expect((session.opp?.cleared ?? 0) > 0).toBe(true);
    expect(incoming).toBeGreaterThan(0);
    session.link.send({ t: "over", cleared: 0, time: 30 });
    expect(session.result?.winner).toBe(1);
  }, 60000);
});

describe("boss defeat finale", () => {
  for (const biome of BIOMES) {
    test(`${biome} final boss dies with the bright finale (bossDown event, boss death burst)`, () => {
      const game = worldGame(biome, 10);
      for (const base of game.bases) {
        base.hp = 1e9;
        base.maxHp = 1e9;
      }
      game.status = "ready";
      game.wave = game.level.waves - 1;
      startWave(game);
      let boss: Enemy | undefined;
      for (let i = 0; i < 120 / DT && !boss; i++) {
        step(game, DT);
        boss = game.enemies.find((e) => e.boss && e.intro <= 0);
      }
      if (!boss) throw new Error("no boss");
      game.events = [];
      damageEnemy(game, boss, boss.hp + 1, null);
      expect(game.events.some((e) => e.type === "bossDown")).toBe(true);
      const death = game.deaths.find((d) => d.boss);
      expect(death).toBeDefined();
      // a burst of light, not a smoke cloud that would hide the finale
      expect(game.particles.some((p) => p.kind === "smoke" && p.size > 20)).toBe(false);
    });
  }
});
