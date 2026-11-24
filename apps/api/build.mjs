// Bundles the API (including the workspace `@gst/shared` package) into dist/. Third-party deps stay external.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@gst/'));
for (const entry of ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts']) {
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20', outdir: 'dist', outbase: 'src', sourcemap: true, external, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
}
console.log('API bundled → dist/');
