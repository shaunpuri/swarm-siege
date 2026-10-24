# Swarm Siege

A tower defense game built for the Syntax Error hackathon, with **online 1 vs 1** and a swarm
that **learns from every wave**. Five worlds (Grassland, Cold World, Desert, Aqua Realm, Cyber
Arena), ten levels each, every map hand painted and alive, every creature, turret and base cut
straight from its own concept sheet.

## The hooks

**The swarm adapts.** After each wave the swarm checks which turret family did the most damage.
If one family did 45% or more, the next wave grows armour against it (50% less damage) and an
"EVOLUTION REPORT" tells you why. Spamming one tower stops working; you have to keep changing
your defence. Armoured enemies wear a dashed ring in the colour of the turret they resist.

**Tower defense, multiplayer.** Make a room, share its 5 letter code (or invite link), and
your friend joins from any phone or laptop. Both players defend the same random map against
the same endless waves, which grow stronger and faster every round. Spend coins to send your
rival enemy packs, permanent HP and speed boosts, a Commander, or the world's final boss. Most
waves cleared wins; on a tie, whoever survived longer. Split view (V) shows your rival's
screen live beside yours.

## Features

- **Campaign in the style of Kingdom Rush**: title, world select (each world opens when the
  last is cleared), a level map per world on a winding trail, a briefing for every level with
  its enemies, Easy / Medium / Hard, stars and difficulty gems, and 18 achievement badges.
- **50 maps**: 10 layouts painted in 5 worlds, with tunnels, burrows (enemies dig out), sky
  drop zones, portals that teleport the swarm across the map, forks, and two-base maps.
- **Living worlds**: water ripples and waterfalls, swaying trees, snowfall with wind gusts,
  sandstorms and dust devils, neon rain, bubbles, fish and jellyfish under the sea.
- **Each world's own creatures**, each moving its own way: spiders scuttle, the harrier
  flies, the anaconda slithers, yetis stomp, the snowman hops, the mummy shambles, wraiths
  hover, sharks swim. They arrive their own way too: digging up, swooping down, rising from
  the river, forming out of snow or sand, fading out of camouflage.
- **Boss entrances**: the Mummy King bursts out of his pyramid in a sandstorm, the Elderwood
  Colossus wakes from an ancient stump, the Ice Dragon dives from the sky, Damyaan rises from a
  whirlpool, the Transformer Overlord races in as a car and transforms into a giant robot.
- **Enemies fight back**: they attack turrets beside the road, one at a time per turret.
  Repair, upgrade and time your powers, or lose your defence.
- **Turrets that turn and punch** like a Clash of Clans cannon, showing the side that faces
  their target, with abilities at level 3 and six coin-bought powers.
- **3D look**: sprites are lit with the map's sun, cast silhouette shadows and walk on a
  procedural bone rig.
- **Plays on phones**: touch controls, fullscreen landscape, split view stacks upright.

## Controls

| Input | Action |
| --- | --- |
| Click pad / turret / base | Build / upgrade, ability, repair, sell, targeting / upgrade base |
| Click a vine | Cut it |
| Q W E R T Y | Powers |
| 1 2 3 | Build on the selected pad |
| U, H, X, M | Upgrade, repair, sell, change targeting of the selected turret |
| N or Enter | Start / call next wave (early calls pay a bonus) |
| F | Game speed (campaign) |
| V | Split view: watch your rival (versus) |
| Space | Pause (campaign) |

Links: `?all=1` unlocks everything, `?autoplay=1` lets the built-in bot play, `?level=10&wave=12`
jumps to a boss wave, `?room=CODE` opens a versus invite.

## Run

```bash
bun install
bun run dev        # game on http://localhost:5173, versus rooms on :5174
bun run test       # logic tests, room server tests, headless playthroughs of every level
bun run typecheck
bun run art        # re-cut every sprite from art/source
bun run build      # static build in dist/
bun run server     # production: serves dist/ and the /ws rooms on one port
```

## Code map

- `src/game` the simulation (no DOM): waves, enemies, melee, towers, projectiles, vines,
  powers, the adaptive swarm (`adapt.ts`), versus rules (`match.ts`) and the balance bots
- `src/config` levels, worlds, towers, enemies, difficulty, sends, bosses
- `src/net` the versus protocol and client; `server/` the WebSocket room server
- `src/three` the three.js scene: map shader, lit sprites, bone rig, gaits, boss set pieces
- `src/render` the 2D overlay: weather, sea life, effects, boss entrances, the rival view
- `src/ui` HUD, campaign screens, briefing, lobby, versus panels, layout
- `scripts/` sprite cutting from the concept sheets, road tracing, ChatGPT map generation
