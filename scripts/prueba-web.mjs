#!/usr/bin/env node
/**
 * Arma la VERSIÓN DE PRUEBA como carpeta web, para subirla a una página y pasarle
 * al cliente un link (en vez de un archivo).
 *
 *   node scripts/prueba-web.mjs [--whatsapp=549…] [--correo=…]
 *       → dist/prueba-web/ (index.html + css/ + js/ + prueba/)
 *
 * Es lo mismo que `empaquetar.mjs --prueba` (datos de ejemplo, cartel, "Sugerencia",
 * "Datos de prueba", datos guardados aparte), pero en archivos separados: así la
 * política de seguridad (CSP) sigue siendo la de index.html ('self'), sin huellas.
 * Se sube la carpeta entera, tal cual; index.html es la página de entrada.
 * Los datos que cargue el cliente quedan en SU navegador, no en la página.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const PRUEBA = path.join(ROOT, 'prueba');
const SALIDA = path.join(ROOT, 'dist', 'prueba-web');

const args = process.argv.slice(2);
const opcion = (nombre) => { const a = args.find((x) => x.startsWith(`--${nombre}=`)); return a ? a.slice(nombre.length + 3) : ''; };

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.cpSync(APP, SALIDA, { recursive: true });
fs.mkdirSync(path.join(SALIDA, 'prueba'));
['aislar-datos.js', 'datos-ejemplo.js', 'prueba.js'].forEach((f) => fs.copyFileSync(path.join(PRUEBA, f), path.join(SALIDA, 'prueba', f)));
const contacto = { whatsapp: opcion('whatsapp').replace(/\D/g, ''), correo: opcion('correo') };
fs.writeFileSync(path.join(SALIDA, 'prueba', 'contacto.js'), `/* Adónde llegan las sugerencias (lo arma scripts/prueba-web.mjs). */\nwindow.SoyaPrueba = ${JSON.stringify(contacto)};\n`);

let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const cambiar = (buscar, reemplazo) => {
  if (!html.includes(buscar)) throw new Error(`No encontré ${buscar} en index.html`);
  html = html.replace(buscar, () => reemplazo);
};
const tema = '<script src="js/tema.js"></script>';
cambiar(tema, `<script src="prueba/contacto.js"></script>\n    <script src="prueba/aislar-datos.js"></script>\n    ${tema}`);
const store = '<script src="js/store.js" defer></script>';
cambiar(store, `<script src="prueba/datos-ejemplo.js" defer></script>\n    ${store}`);
const defer = [...html.matchAll(/[ \t]*<script src="[^"]+" defer><\/script>/g)].pop();
if (!defer) throw new Error('No encontré los <script src="…" defer> en index.html');
const fin = defer.index + defer[0].length;
html = `${html.slice(0, fin)}\n    <script src="prueba/prueba.js" defer></script>${html.slice(fin)}`;
html = html.replace(/<title>([^<]*)<\/title>/, (_, t) => `<title>${t} (prueba)</title>`);
fs.writeFileSync(path.join(SALIDA, 'index.html'), html);

const contar = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? contar(path.join(dir, e.name)) : 1), 0);
console.log(`✔ ${path.relative(ROOT, SALIDA)}/ (${contar(SALIDA)} archivos)`);
