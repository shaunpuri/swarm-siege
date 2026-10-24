# Drives the ChatGPT tab in the user's Chrome to paint the level maps: 10 layouts x 5 biomes.
# Run inside browser-harness: BU_NAME=gptmaps browser-harness < scripts/gpt-maps.py
# (Python because browser-harness executes Python snippets with its helpers preloaded.)
# Each layout starts a new chat, paints the Grassland version, then asks ChatGPT to repaint
# that exact map in the other biomes, so every biome of a level shares one layout.
# Resumable: maps already on disk are skipped.

import base64, os, time

OUT = "/home/shaun/code/swarm-siege/art/source/chatgpt"

STYLE = (
    "Top-down isometric tower defense game map, wide 16:9 landscape, extremely detailed painted mobile-game art "
    "like Kingdom Rush. The road is a grey-brown paved road with a dashed yellow center line, glowing neon-blue "
    "edges and wooden fences. Build pads are round glowing blue discs with segmented orange-gold rims, each on its "
    "own flat clearing beside the road, clearly separate from the road. Every road ends at an EMPTY base platform: "
    "a large flat glowing hexagonal metal pad (about three times the size of a build pad) with NOTHING built on it. "
    "No text, no labels, no UI, no arrows, no people, no enemies. Clean readable layout."
)

BIOMES = {
    "grassland": "GRASSLAND biome: lush green meadows, dense pine and oak forests, mossy rocks and cliffs, turquoise rivers with waterfalls, wooden bridges with lanterns, deer and flowers, warm afternoon sunlight",
    "snow": "SNOW biome: deep snow, frosted pine forests, icy blue frozen rivers with ice floes and frozen waterfalls, snow-capped rocks, bridges dusted with snow, warm glowing lanterns, the road cleared of snow",
    "desert": "DESERT biome: golden sand dunes, red sandstone canyons and mesas, palm oases with turquoise water, cacti, ancient sandstone ruins, the rivers become turquoise oasis streams, warm lanterns, hot sunlight",
    "water": "AQUA REALM underwater kingdom biome, exactly like the second image: the whole map is deep under the sea, so there are NO rivers, NO waterfalls and NO surface water anywhere; where the first image has rivers, paint deep sea-floor trenches with coral, kelp and glowing sea plants instead. Colourful coral reefs, swaying kelp, ancient stone ruins and arches, a Water Princess palace, jellyfish, fish, rising bubbles, treasure chests, light rays from above; the road is a pale stone path with glowing blue edges, bridges are carved stone bridges over the trenches",
    "cyber": "CYBER ARENA biome, exactly like the second image: a neon cyberpunk city at night with metal plating, rooftops, skyscrapers, purple and pink neon signs and hologram billboards. There is NO water anywhere: NO rivers, NO waterfalls, NO canals; where the first image has rivers, paint deep dark purple chasms with glowing neon edges between city blocks, and the bridges are metal and glass bridges over the chasms",
}

# the user's own world designs, uploaded as the style to copy for each biome repaint
STYLE_REF = {
    "snow": "/home/shaun/code/swarm-siege/art/source/styles/snow.png",
    "desert": "/home/shaun/code/swarm-siege/art/source/styles/desert.png",
    "water": "/home/shaun/code/swarm-siege/art/source/styles/water.png",
    "cyber": "/home/shaun/code/swarm-siege/art/source/styles/cyber.jpg",
}

BURROW = "an UNDERGROUND BURROW (a dark round crater hole with cracked, upturned earth and rocks where enemies dig out of the ground)"
DROP = "a SKY DROP ZONE (a large glowing circular landing pad with yellow-black hazard stripes and blinking beacon lights on its rim, where enemies land from the sky)"
PORTAL = "a glowing swirling blue-purple TELEPORT PORTAL ring standing upright on the road"

LAYOUTS = [
    "One road from a stone tunnel ENTRANCE in the top-left corner makes two gentle S-curves, crosses a river on a wooden bridge and ends at the base platform in the bottom-right corner. 6 build pads.",
    "One long road from a stone tunnel ENTRANCE at the left edge (upper third) snakes in wide zig-zags across the whole map (right, down, left, down, right) and ends at the base platform at the right edge (lower third). A river with a waterfall crosses the road twice under bridges. 7 build pads.",
    f"A main road from a stone tunnel ENTRANCE at the top-left winds to the base platform at the bottom-right. In the lower-left area there is {BURROW}; a short second road leads from it up to join the main road at its middle. 7 build pads.",
    "A road from a stone tunnel ENTRANCE at the top-left goes to the center of the map where it FORKS into two branches: one goes down to a base platform in the bottom-left corner, the other goes right to a base platform in the bottom-right corner. 8 build pads.",
    f"A main road from a stone tunnel ENTRANCE at the middle of the left edge winds to the base platform at the middle of the right edge. At the top-center there is {DROP}; a short road leads from it down to join the main road. 8 build pads.",
    f"A road from a stone tunnel ENTRANCE at the top-left goes down and ends at {PORTAL} in the left-middle area. A matching second portal ring stands in the upper-right area, where the road continues and winds down to the base platform in the bottom-right corner. 8 build pads, some between the two portals.",
    f"Two entrances: a stone tunnel at the top-left and {BURROW} at the bottom-left. Their two roads merge in the center into one road that continues to the base platform at the middle of the right edge. 8 build pads.",
    f"The road from a stone tunnel ENTRANCE at the top-left makes a big loop around a central lake with an island, crossing two bridges, then goes to the base platform at the bottom-right. {DROP[0].upper() + DROP[1:]} sits at the top-right with a short road joining the loop. 9 build pads.",
    f"A road from a stone tunnel ENTRANCE at the top-left winds to the base platform at the bottom-right. Enemies entering {PORTAL} in the left-middle reappear at a matching portal ring in the top-right and continue. Also {BURROW} in the bottom-center with a short road joining the main road. 9 build pads.",
    f"The most complex map: a stone tunnel ENTRANCE at the top-left, {BURROW} at the bottom-left and {DROP} at the top-center. Their roads merge, then split to TWO base platforms, one at the middle of the right edge and one at the bottom-right corner. One pair of portal rings creates a shortcut. 10 build pads.",
]

REPAINT_UPLOAD = (
    "The FIRST image is a tower defense map layout. The SECOND image shows the art style and design to copy. Repaint the FIRST image EXACTLY: identical camera angle, identical road shapes and routes, identical "
    "positions of every build pad, base platform, tunnel, burrow, drop zone, portal and bridge. Paint it in the exact art style, colours, materials and design details of the SECOND image, as a {biome}. "
    "Keep the base platforms empty. One single image, same 16:9 framing, no collage, no text, no labels, no UI."
)

REPAINT = (
    "Repaint EXACTLY the same map: identical camera angle, identical road shapes and routes, identical positions of every "
    "build pad, base platform, tunnel, burrow, drop zone, portal and bridge. Only change the setting to a {biome}. "
    "Same extremely detailed painted art quality. No text, no labels, no UI."
)


exec(open("/home/shaun/code/swarm-siege/scripts/gpt-common.py").read())


# every map gets a fresh chat: the Grassland version is painted from text, the other biomes
# repaint that exact picture (uploaded), so all five share one layout without old images or
# earlier repaints in the conversation confusing ChatGPT
os.makedirs(OUT, exist_ok=True)
tab()
order = ["grassland", "snow", "desert", "water", "cyber"]
for i, layout in enumerate(LAYOUTS, start=1):
    paths = {b: f"{OUT}/{b}-{i}.png" for b in order}
    for b in order:
        if os.path.exists(paths[b]):
            continue
        open_chat("https://chatgpt.com/")
        if b == "grassland":
            log(f"layout {i} grassland: new chat")
            generate(f"{STYLE}\n\nSetting: {BIOMES['grassland']}.\n\nLevel {i} layout: {layout}", paths[b])
        else:
            log(f"layout {i} {b}: new chat with the grassland map")
            upload([paths["grassland"], STYLE_REF[b]])
            generate(REPAINT_UPLOAD.format(biome=BIOMES[b]), paths[b])
log("all maps done")
