import type { ServerWebSocket } from "bun";
import type { Conn } from "@server/rooms";
import type { ArenaConn } from "@server/arena";
import { createLobby, handle, leave } from "@server/rooms";
import { createArena, handleArena, leaveArena, tickArena } from "@server/arena";
import { handleApi } from "@server/api";
import { openWallets } from "@server/wallet";
import { parseClientMsg } from "@/net/protocol";
import { parseArenaClient } from "@/net/arenaproto";

// The game server: versus rooms on the WebSocket /ws, Arena Stakes rooms on /arena, and the
// diamond wallet API under /api (server/api.ts). During development it runs beside the game's
// dev server (bun run dev starts both, game on 5173, server on 5174). In production it also
// serves the built game from dist/, so one process and one port is the whole site.
// Run with: bun server/main.ts

const port = Number(process.env["PORT"] ?? 5174);
const dist = `${import.meta.dir}/../dist`;
const lobby = createLobby();
const wallets = await openWallets(process.env["WALLETS"] ?? `${import.meta.dir}/../data/wallets.json`);
const arena = createArena(wallets);
setInterval(() => tickArena(arena), 250);
let nextId = 1;

type Data = { kind: "versus" | "arena"; conn: Conn; aconn: ArenaConn };

Bun.serve<Data>({
  port,
  async fetch(req, server) {
    const path = new URL(req.url).pathname;
    if (path === "/ws" || path === "/arena") {
      const id = nextId++;
      const ok = server.upgrade(req, { data: { kind: path === "/ws" ? "versus" : "arena", conn: { id, send: () => undefined }, aconn: { id, send: () => undefined } } });
      return ok ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (path.startsWith("/api/")) return handleApi(wallets, req, path);
    const file = Bun.file(`${dist}${path === "/" ? "/index.html" : path}`);
    if (path.includes("..") || !(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
  websocket: {
    open(ws: ServerWebSocket<Data>) {
      ws.data.conn.send = (msg) => ws.send(JSON.stringify(msg));
      ws.data.aconn.send = (msg) => ws.send(JSON.stringify(msg));
    },
    message(ws: ServerWebSocket<Data>, raw) {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      if (ws.data.kind === "arena") {
        const msg = parseArenaClient(text);
        if (msg) handleArena(arena, ws.data.aconn, msg);
        return;
      }
      const msg = parseClientMsg(text);
      if (msg) handle(lobby, ws.data.conn, msg);
    },
    close(ws: ServerWebSocket<Data>) {
      if (ws.data.kind === "arena") leaveArena(arena, ws.data.aconn);
      else leave(lobby, ws.data.conn);
    },
  },
});

console.log(`Swarm Siege server on http://localhost:${port} (rooms /ws, arena /arena, wallet /api)`);
