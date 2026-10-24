// Turns a unit's views (front, left, back, right, cut from the concept sheets) into a
// textured 3D model with the Tripo API (multiview to model, or image to model when a sheet
// only has one view), saves the full model in art/models and a web-ready copy (512px webp
// textures, simplified, meshopt) in src/assets/models. The key is read from .tripo-key.
// Run with: bun scripts/tripo.ts <name> <front.png> [<left.png> <back.png> <right.png>]
// (pass "" for a view the sheet does not have)

import { mkdirSync } from "node:fs";

const ROOT = `${import.meta.dir}/..`;
const API = "https://openapi.tripo3d.ai/v3";
const KEY = (await Bun.file(`${ROOT}/.tripo-key`).text()).trim();
const OUT = `${ROOT}/art/models`;

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function call(path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, ...(init.headers ?? {}) } });
  const body: unknown = await res.json();
  if (!isRecord(body) || body["code"] !== 0 || !isRecord(body["data"])) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body["data"];
}

async function upload(path: string): Promise<string> {
  const form = new FormData();
  form.append("file", Bun.file(path));
  const data = await call("/files", { method: "POST", body: form });
  const token = data["file_token"];
  if (typeof token !== "string") throw new Error(`no file token for ${path}`);
  return token;
}

async function waitFor(taskId: string): Promise<Json> {
  for (;;) {
    const task = await call(`/tasks/${taskId}`);
    const status = task["status"];
    if (status === "success") return task;
    if (status === "failed" || status === "cancelled") throw new Error(`task ${taskId} ${String(status)}: ${String(task["error_message"] ?? "")}`);
    process.stdout.write(`\r${taskId} ${String(status)} ${String(task["progress"] ?? 0)}%   `);
    await Bun.sleep(5000);
  }
}

const [name, front, left, back, right] = process.argv.slice(2);
if (!name || !front) throw new Error("usage: bun scripts/tripo.ts <name> <front> [<left> <back> <right>]");

mkdirSync(OUT, { recursive: true });
// a web game: a light mesh with full PBR textures that follow the art's colours
const common = { model: "v3.1-20260211", texture: true, pbr: true, texture_quality: "detailed", texture_alignment: "original_image", face_limit: 30000, compress: "geometry" };
async function submit(): Promise<Json> {
  // any views given beyond the front (empty arguments are views the sheet does not have)
  const views: [string, string][] = [["front", front ?? ""], ["left", left ?? ""], ["back", back ?? ""], ["right", right ?? ""]];
  const given = views.filter(([, path]) => path !== "");
  if (given.length >= 2) {
    const inputs = await Promise.all(given.map(async ([view, path]) => ({ [view]: { file_token: await upload(path) } })));
    return call("/generation/multiview-to-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs, ...common }) });
  }
  const input = await upload(front ?? "");
  return call("/generation/image-to-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, ...common }) });
}
// the task id is kept next to the model, so a run that dies after paying can pick its finished
// task up again instead of generating (and paying for) a new one
const taskFile = `${OUT}/${name}.task`;
async function taskOf(): Promise<string> {
  const saved = Bun.file(taskFile);
  if (await saved.exists()) return (await saved.text()).trim();
  const created = await submit();
  const id = created["task_id"];
  if (typeof id !== "string") throw new Error("no task id");
  await Bun.write(taskFile, id);
  return id;
}
const taskId = await taskOf();
const task = await waitFor(taskId);
const output = task["output"];
const url = isRecord(output) ? (output["pbr_model_url"] ?? output["model_url"]) : undefined;
if (typeof url !== "string") throw new Error(`no model url: ${JSON.stringify(output)}`);
// downloads sometimes stall: give each try two minutes, and try again
async function download(from: string, to: string): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(from, { signal: AbortSignal.timeout(120000) });
      await Bun.write(to, await res.arrayBuffer());
      return;
    } catch (err) {
      console.log(`\ndownload try ${attempt} failed: ${String(err)}`);
    }
  }
  throw new Error(`could not download ${to}`);
}
if (!(await Bun.file(`${OUT}/${name}.glb`).exists())) await download(url, `${OUT}/${name}.glb`);
const preview = isRecord(output) ? output["rendered_image_url"] : undefined;
if (typeof preview === "string") await download(preview, `${OUT}/${name}.webp`);
// the web copy: textures cut from 4096px to 512px webp, mesh simplified, meshopt compressed
// one optimize at a time (flock): several at once run the machine out of memory
const slim = Bun.spawnSync(["flock", "/tmp/swarm-siege-optimize.lock", "bunx", "@gltf-transform/cli@4.2.1", "optimize", `${OUT}/${name}.glb`, `${ROOT}/src/assets/models/${name}.glb`, "--texture-compress", "webp", "--texture-size", "512", "--simplify", "true", "--simplify-ratio", "0.35", "--compress", "meshopt"], { stdout: "pipe", stderr: "pipe" });
if (slim.exitCode !== 0) throw new Error(`optimize failed: ${slim.stderr.toString()}`);
console.log(`\n${name}: saved, ${String(task["credits_consumed"])} credits`);
