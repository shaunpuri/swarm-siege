// Minimal static server for the production build in dist/ (bun run preview).
// Any static host works too: the build is plain HTML, CSS and one JS file.

const root = `${import.meta.dir}/../dist`;
const port = Number(process.env["PORT"] ?? 8080);

Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(`${root}${path === "/" ? "/index.html" : path}`);
    if (path.includes("..") || !(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Swarm Siege build on http://localhost:${port}`);
