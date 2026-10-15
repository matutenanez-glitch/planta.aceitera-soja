#!/usr/bin/env node
/**
 * Arma la app en UN SOLO archivo HTML, para pasarla por pendrive, correo o
 * WhatsApp y abrirla con doble clic (sin descomprimir nada).
 *
 *   node scripts/empaquetar.mjs     → dist/gestion-aceitera-v<versión>.html
 *
 * Mete adentro app/css/styles.css y todos los app/js/*.js, en el mismo orden
 * que index.html. Los scripts van al final del <body>, como los "defer": se
 * ejecutan con la página ya armada. La política de seguridad (CSP) sigue sin
 * permitir código de afuera: solo acepta estos scripts y estilos, por su huella
 * (sha256).
 *
 * Usa las mismas claves de datos (soya_*) que la carpeta app/: abierta en el
 * mismo navegador, ve los mismos datos.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const DIST = path.join(ROOT, 'dist');

const huella = (texto) => `'sha256-${crypto.createHash('sha256').update(texto, 'utf8').digest('base64')}'`;

let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const version = (/version:\s*'([^']+)'/.exec(fs.readFileSync(path.join(APP, 'js', 'config.js'), 'utf8')) || [])[1] || 'sin-version';

// Estilos
const css = fs.readFileSync(path.join(APP, 'css', 'styles.css'), 'utf8');
const enlaceCss = '<link rel="stylesheet" href="css/styles.css">';
if (!html.includes(enlaceCss)) throw new Error('No encontré el <link> de css/styles.css en index.html');
html = html.replace(enlaceCss, () => `<style>${css}</style>`);

// Scripts: se sacan del <head> y van al final del <body>, en el mismo orden.
const scripts = [];
html = html.replace(/[ \t]*<script src="([^"]+)" defer><\/script>\r?\n?/g, (_, src) => {
  const codigo = fs.readFileSync(path.join(APP, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  scripts.push({ src, codigo });
  return '';
});
if (!scripts.length) throw new Error('No encontré los <script src="…" defer> en index.html');
const bloque = scripts.map((s) => `<script>/* ${s.src} */\n${s.codigo}</script>`);
if (!html.includes('</body>')) throw new Error('No encontré </body> en index.html');
html = html.replace('</body>', () => `${bloque.join('\n')}\n</body>`);

// CSP: en vez de 'self', las huellas de cada script y del estilo.
const cspAntes = /script-src 'self'; style-src 'self';/;
if (!cspAntes.test(html)) throw new Error('La CSP de index.html no tiene el formato esperado');
const huellasJs = scripts.map((s) => huella(`/* ${s.src} */\n${s.codigo}`)).join(' ');
html = html.replace(cspAntes, () => `script-src ${huellasJs}; style-src ${huella(css)};`);

fs.mkdirSync(DIST, { recursive: true });
const salida = path.join(DIST, `gestion-aceitera-v${version}.html`);
fs.writeFileSync(salida, html);
console.log(`✔ ${path.relative(ROOT, salida)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${scripts.length} scripts)`);
