// Shared data shapes. Game logic (src/game) only mutates these plain objects,
// so it runs headless in tests; rendering and DOM UI only read them.

export type Vec = { x: number; y: number };

export type TowerKind = "basic" | "rapid" | "heavy" | "frost";
export type SpecKind = "ricochet" | "laser" | "flame" | "cryo" | "cluster" | "nuke";
export type EnemyKind = "scout" | "brute" | "overlord" | "titan";
export type BaseKind = "outpost" | "fortress" | "reactor";
export type TargetMode = "first" | "strong" | "close";
export type PowerKind = "overclock" | "surge" | "strike" | "cryo" | "repair" | "shield";

// ready: before wave 1, between: countdown to next wave, wave: enemies incoming
export type Status = "ready" | "wave" | "between" | "won" | "lost";

export type Difficulty = "easy" | "medium" | "hard";

// online versus shop items (src/config/sends.ts)
export type SendKind = "swarm" | "brutes" | "elites" | "empower" | "overdrive" | "commander" | "boss";

// Online versus: endless waves, plus whatever the opponent has sent. hpMul and speedMul are
// the opponent's Empower and Overdrive boosts; pending are sent enemies waiting to spawn;
// bought counts this player's own purchases (prices rise); income is the extra coin bonus per
// wave those purchases earned; cleared counts waves completed.
export type Match = {
  hpMul: number;
  speedMul: number;
  pending: { kind: EnemyKind; boss: boolean; at: number }[];
  bought: Record<SendKind, number>;
  income: number;
  cleared: number;
};

export type LevelDef = {
  id: number;
  name: string;
  keyChange: string;
  // each route is a full waypoint list from the entrance to one base
  routes: Vec[][];
  routeBase: number[];
  bases: { kind: BaseKind; pos: Vec }[];
  rivers: Vec[][];
  startCoins: number;
  towers: TowerKind[];
  enemies: EnemyKind[];
  waves: number;
  boss: "overlord" | "titan" | null;
  // pads drawn on the level sheet; auto pads top the level up to padTarget
  pads: Vec[];
  padTarget: number;
  // "level": the level's own painted map; otherwise the concept painting used as the map
  mapArt: "level" | "grassland" | "cyber" | "world";
  // enemy health multiplier; painting modes' single short road gets weaker waves
  hpScale: number;
  // how enemies enter each route, and teleports: jumps[r] lists waypoint indices i where
  // enemies vanish into a portal at point i and step out of its twin at point i + 1
  entries: Entry[];
  jumps: number[][];
  // art theme of the map: which enemy skins and base art to use
  biome: Biome;
};

// swim: Aqua Realm enemies sink down from the open sea above onto the road
export type Entry = "tunnel" | "burrow" | "drop" | "swim";
export type Biome = "grassland" | "snow" | "desert" | "water" | "cyber";

// jumps: segment indices that are portal teleports (traversed as a short warp)
export type Route = { points: Vec[]; segLens: number[]; cum: number[]; length: number; baseIndex: number; jumps: Set<number>; entry: Entry };

// level 1-3 (src/config/bases.ts); cooldowns per weapon; shield = Cryo Shield charge left
export type Base = { kind: BaseKind; pos: Vec; hp: number; maxHp: number; startHp: number; flash: number; level: number; cooldowns: number[]; shield: number; shieldTimer: number };

export type Pad = { pos: Vec; towerId: number | null };

export type Tower = {
  id: number;
  kind: TowerKind;
  level: number;
  spec: SpecKind | null;
  padIndex: number;
  pos: Vec;
  angle: number;
  cooldown: number;
  hp: number;
  maxHp: number;
  mode: TargetMode;
  boostShots: number;
  spent: number;
  flash: number;
  recoil: number;
  firing: number;
  // seconds until a level 3 world turret's storm (Sandstorm, Ocean Storm, Snowstorm) is ready
  special: number;
};

export type Enemy = {
  id: number;
  kind: EnemyKind;
  boss: boolean;
  routeIndex: number;
  dist: number;
  pos: Vec;
  angle: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  reward: number;
  baseDamage: number;
  resist: TowerKind | null;
  slowTime: number;
  slowFactor: number;
  burnTime: number;
  burnDps: number;
  abilityTimer: number;
  enraged: boolean;
  walk: number;
  hitFlash: number;
  // seconds left of the entry animation (digging out, landing); untouchable meanwhile
  intro: number;
  // 0 = visible, 1 = inside a portal
  warp: number;
  // a creature's own arrival (src/config/bosses.ts) can be shot at; digging out of a
  // burrow, landing in a drop zone or a boss entrance cannot
  openIntro: boolean;
  // id of the turret this enemy is attacking (it stays until the turret falls), and seconds
  // spent attacking it
  attacking: number | null;
  attackTime: number;
  // seconds spent striking the base after reaching it (it deals its damage at the end)
  atBase: number;
  // Cyber Arena boss: 0 = car, rising to 1 while it transforms, 1 = robot
  morph: number;
  // game time of its last special ability (slam, bolt, vines), for the attack animation
  cast: number;
  // the Grassland anaconda rises out of the river here and slides up the bank onto the road
  // during its entrance (null: it comes out at its spot on the road)
  emergeFrom: Vec | null;
};

export type ProjectileKind =
  | "bullet"
  | "frost"
  | "ricochet"
  | "shell"
  | "cluster"
  | "bomblet"
  | "nuke"
  | "bolt";

export type Projectile = {
  id: number;
  kind: ProjectileKind;
  pos: Vec;
  start: Vec;
  target: Vec;
  // enemy id for tower shots, tower id for enemy bolts
  targetId: number | null;
  speed: number;
  damage: number;
  splash: number;
  bounces: number;
  family: TowerKind | null;
  // damage kept on each ricochet bounce
  falloff: number;
  // the firing turret's upgrade level, 0..2 (its shots match that level's design)
  design: number;
  hitIds: number[];
  age: number;
  flight: number;
  color: string;
};

export type VineTarget = { kind: "tower"; id: number } | { kind: "base"; index: number };

export type Vine = {
  id: number;
  origin: Vec;
  to: Vec;
  target: VineTarget;
  growth: number;
  hp: number;
  maxHp: number;
  life: number;
  tick: number;
  sway: number;
};

// A level 3 world turret's storm (src/game/storms.ts): it gathers at the turret for a moment,
// then sweeps over the target area hitting the enemies in it one by one, thinning with every
// hit, until its hits or its time run out. The Ocean Storm also slows what it catches.
export type StormKind = "sandstorm" | "ocean" | "snowstorm";
export type Storm = { id: number; kind: StormKind; from: Vec; pos: Vec; radius: number; age: number; life: number; hits: number; maxHits: number; tick: number; damage: number; family: TowerKind };

export type Beam = { from: Vec; to: Vec; life: number; maxLife: number; color: string; width: number };

export type Strike = { pos: Vec; timer: number };

export type ParticleKind = "spark" | "smoke" | "ring" | "flame" | "debris" | "poison";

export type Particle = {
  kind: ParticleKind;
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

export type FloatText = { pos: Vec; text: string; life: number; color: string; size: number };

// a finished enemy, for death animations drawn by the overlay (life runs 0 -> 1)
export type Death = { pos: Vec; size: number; life: number; boss: boolean };

export type Spawn = { at: number; kind: EnemyKind; boss: boolean; route: number };

export type WaveSummary = { kind: EnemyKind; boss: boolean; count: number };

export type WavePlan = { spawns: Spawn[]; summary: WaveSummary[] };

export type Sfx =
  | "shoot"
  | "rapid"
  | "boom"
  | "bigboom"
  | "laser"
  | "flame"
  | "kill"
  | "coin"
  | "build"
  | "upgrade"
  | "sell"
  | "hurt"
  | "towerDown"
  | "evolve"
  | "boss"
  | "vine"
  | "slash"
  | "power"
  | "win"
  | "lose"
  | "wave";

export type GameEvent =
  | { type: "evolve"; family: TowerKind; share: number }
  | { type: "boss"; kind: EnemyKind }
  | { type: "bossDown"; kind: EnemyKind; reward: number }
  | { type: "waveStart"; wave: number }
  | { type: "waveClear"; wave: number; bonus: number }
  | { type: "towerLost"; kind: TowerKind }
  | { type: "baseLost"; index: number }
  | { type: "won" }
  | { type: "lost" };

export type Game = {
  level: LevelDef;
  routes: Route[];
  bases: Base[];
  pads: Pad[];
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  vines: Vine[];
  storms: Storm[];
  beams: Beam[];
  strikes: Strike[];
  particles: Particle[];
  texts: FloatText[];
  deaths: Death[];
  coins: number;
  // number of waves started so far (1-based once the first wave starts)
  wave: number;
  plan: WavePlan | null;
  spawnIndex: number;
  waveTime: number;
  countdown: number;
  status: Status;
  time: number;
  seed: number;
  nextId: number;
  shake: number;
  power: { overclock: number; cryo: number; shield: number };
  cooldowns: Record<PowerKind, number>;
  adapt: { damage: Record<TowerKind, number>; resist: TowerKind | null };
  events: GameEvent[];
  sfx: Sfx[];
  kills: number;
  leaks: number;
  difficulty: Difficulty;
  // online versus state, null in the campaign
  match: Match | null;
  // for badges: waves called early, and the most turrets standing at once
  earlyCalls: number;
  peakTowers: number;
};

// animated spots on a painting, in painting pixels: a hologram globe that turns and a sign
// whose lettering flares at intervals
export type MapFeatures = { globe?: { x: number; y: number; rx: number; ry: number }; sign?: { x0: number; y0: number; x1: number; y1: number } };
