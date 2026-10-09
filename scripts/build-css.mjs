#!/usr/bin/env node
/**
 * Compila src/styles.css (Tailwind v4) → app/css/styles.css
 *
 *   npm run build:css     compila una vez
 *   npm run watch:css     recompila al guardar cambios en app/ o src/
 *
 * Busca las clases usadas en app/index.html y app/js/**\/*.js y genera solo
 * el CSS necesario. El resultado se versiona en git para que la app funcione
 * con doble clic, sin internet y sin instalar nada.
 */
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'src', 'styles.css');
const OUTPUT = path.join(ROOT, 'app', 'css', 'styles.css');
const SOURCE_DIR = path.join(ROOT, 'app');
const TAILWIND_DIR = path.dirname(require.resolve('tailwindcss/package.json'));

function listSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'css' ? [] : listSources(full);
    return /\.(html|js)$/.test(entry.name) ? [full] : [];
  });
}

function extractCandidates(files) {
  const candidates = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of text.split(/[\s"'`<>{};=]+/)) {
      if (token && token.length < 200) candidates.add(token);
    }
  }
  return candidates;
}

async function loadStylesheet(id, base) {
  let file;
  if (id === 'tailwindcss') file = path.join(TAILWIND_DIR, 'index.css');
  else if (id.startsWith('tailwindcss/')) file = path.join(TAILWIND_DIR, id.slice('tailwindcss/'.length).replace(/(\.css)?$/, '.css'));
  else file = path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
}

async function build() {
  const started = Date.now();
  const compiler = await compile(fs.readFileSync(INPUT, 'utf8'), { base: path.dirname(INPUT), loadStylesheet });
  const css = compiler.build([...extractCandidates(listSources(SOURCE_DIR))]);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, '/* Generado por scripts/build-css.mjs a partir de src/styles.css. No editar a mano. */\n' + css);
  console.log(`✔ app/css/styles.css (${(css.length / 1024).toFixed(1)} KB) en ${Date.now() - started} ms`);
}

await build();

if (process.argv.includes('--watch')) {
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((err) => console.error('✖', err.message)), 100);
  };
  for (const dir of [SOURCE_DIR, path.dirname(INPUT)]) {
    fs.watch(dir, { recursive: true }, (_event, file) => {
      if (file && !String(file).includes('css' + path.sep + 'styles.css')) rebuild();
    });
  }
  console.log('Observando cambios en app/ y src/ … (Ctrl+C para salir)');
}
