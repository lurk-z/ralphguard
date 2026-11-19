// Component inventory for /test_components: size tier and the pages that use each component.
//
//   npm run inventory          (writes src/app/test_components/_inventory.json)
//
// Size = esbuild bundle of the file, minified + gzipped, with React, Next, lucide,
// next-auth, three.js, react-three and the class helpers (clsx, tailwind-merge, cva) left out (every page already loads them or
// they are listed separately in `libs`). Radix/vaul are counted inside, so a
// component that pulls a Radix package looks heavier than its own code.
// Tiers: light < 5 KB · medium 5–15 KB · heavy > 15 KB, or anything that uses a
// large library (three.js, react-three, recharts, gsap, xyflow).
// A component that pages only load on demand (next/dynamic) is not part of the
// first load, so it counts as light (`lazy: true`); its real size stays in `gzKB`.
// "Used by" follows imports from every app/**/page.tsx (and the root layout),
// ignoring /test_components itself.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(SRC, "app", "test_components", "_inventory.json");
const EXT = [".tsx", ".ts"];
const EXTERNAL = ["react", "react-dom", "react/jsx-runtime", "next", "next/*", "lucide-react", "next-auth", "next-auth/*", "three", "three/*", "@react-three/*", "sonner", "clsx", "tailwind-merge", "class-variance-authority"];
const BIG_LIBS = ["three", "@react-three/fiber", "@react-three/drei", "@react-three/postprocessing", "recharts", "gsap", "@xyflow/react", "reactflow"];
const LIGHT_KB = 5;
const HEAVY_KB = 15;

const rel = (p) => relative(SRC, p).split(sep).join("/");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : EXT.some((e) => p.endsWith(e)) ? [p] : [];
  });
const files = walk(SRC);
const IMPORT = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const c of [base, ...EXT.map((e) => base + e), ...EXT.map((e) => join(base, "index" + e))]) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

const graph = new Map(); // every import, static or dynamic
const staticGraph = new Map(); // only imports that load with the file (no `import()`, no `import type`)
const packages = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const deps = [];
  const staticDeps = [];
  const pkgs = new Set();
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    const r = resolve(spec, f);
    if (r) {
      deps.push(r);
      if (m[1] && !/^\s*(?:import|export)\s+type\s/.test(m[0])) staticDeps.push(r);
    }
    else if (!spec.startsWith(".") && !spec.startsWith("@/")) pkgs.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  }
  graph.set(f, deps);
  staticGraph.set(f, staticDeps);
  packages.set(f, pkgs);
}

function route(page) {
  const r = rel(page).replace(/^app\//, "").replace(/(^|\/)page\.tsx$/, "").replace(/\([^)]*\)\/?/g, "").replace(/\/$/, "");
  return "/" + r;
}
const entries = files
  .filter((f) => /[\\/]app[\\/]/.test(f) && /[\\/]page\.tsx$/.test(f) && !/test_components/.test(f))
  .map((f) => [f, route(f)]);
const rootLayout = join(SRC, "app", "layout.tsx");
entries.push([rootLayout, "ทุกหน้า (layout)"]);

const usedBy = new Map();
for (const [entry, name] of entries) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...(graph.get(f) ?? []));
  }
  for (const f of seen) {
    if (!usedBy.has(f)) usedBy.set(f, new Set());
    usedBy.get(f).add(name);
  }
}

// Files that load with their page (reachable through static imports only). Anything
// else that a page uses is loaded later, when it is opened (`next/dynamic`).
const loadsWithPage = new Set();
for (const [entry] of entries) {
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (loadsWithPage.has(f)) continue;
    loadsWithPage.add(f);
    stack.push(...(staticGraph.get(f) ?? []));
  }
}

// Big libraries reached by a component, through its own imports.
function bigLibs(file) {
  const seen = new Set();
  const out = new Set();
  const stack = [file];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const p of packages.get(f) ?? []) if (BIG_LIBS.includes(p)) out.add(p);
    stack.push(...(graph.get(f) ?? []));
  }
  return [...out];
}

const components = files.filter((f) => rel(f).startsWith("components/") || rel(f).startsWith("hooks/"));
const rows = [];
for (const f of components) {
  const src = readFileSync(f, "utf8");
  let gz = null;
  let raw = null;
  try {
    const r = await build({ entryPoints: [f], bundle: true, minify: true, write: false, format: "esm", jsx: "automatic", external: EXTERNAL, alias: { "@": SRC }, logLevel: "silent", loader: { ".tsx": "tsx", ".ts": "ts", ".png": "empty", ".css": "empty" } });
    const code = r.outputFiles[0].contents;
    raw = code.length;
    gz = gzipSync(code).length;
  } catch {}
  const libs = bigLibs(f);
  const kb = gz === null ? 0 : gz / 1024;
  const used = (usedBy.get(f) ?? new Set()).size > 0;
  // Lazy = used by a page, but only through `import()`: not part of the first load.
  const lazy = used && !loadsWithPage.has(f);
  const sizeTier = libs.length || kb > HEAVY_KB ? "heavy" : kb >= LIGHT_KB ? "medium" : "light";
  const tier = lazy ? "light" : sizeTier;
  // Named exports: `export function X`, `export const X` and shadcn's `export { X, Y }`.
  const exports = [
    ...[...src.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]),
    ...[...src.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter((x) => /^[A-Z][a-z]/.test(x ?? ""))),
  ].filter((x) => !/^[A-Z0-9_]+$/.test(x));
  const defaultExport = /export\s+default\s+function\s+([A-Za-z0-9]+)/.exec(src)?.[1];
  rows.push({
    file: rel(f),
    folder: rel(f).split("/").slice(0, 2).join("/"),
    name: exports[0] ?? defaultExport ?? rel(f).split("/").pop().replace(/\.(tsx|ts)$/, ""),
    exports: [...new Set(exports)],
    lines: src.split("\n").length,
    gzKB: gz === null ? null : Math.round(kb * 10) / 10,
    rawKB: raw === null ? null : Math.round((raw / 1024) * 10) / 10,
    libs,
    tier,
    sizeTier,
    lazy,
    usedBy: [...(usedBy.get(f) ?? [])].sort(),
  });
}
rows.sort((a, b) => (b.gzKB ?? 0) - (a.gzKB ?? 0));
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), thresholdsKB: { light: LIGHT_KB, heavy: HEAVY_KB }, components: rows }, null, 2) + "\n");
const count = (t) => rows.filter((r) => r.tier === t).length;
console.log(`${rows.length} components · light ${count("light")} · medium ${count("medium")} · heavy ${count("heavy")} · unused ${rows.filter((r) => !r.usedBy.length).length}`);
console.log(`wrote ${relative(ROOT, OUT)}`);
