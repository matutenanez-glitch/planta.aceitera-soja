#!/usr/bin/env node
/**
 * Arma la app en UN SOLO archivo HTML, para pasarla por pendrive, correo o
 * WhatsApp y abrirla con doble clic (sin descomprimir nada).
 *
 *   node scripts/empaquetar.mjs
 *       → dist/gestion-aceitera-v<versión>.html (la app, vacía)
 *
 *   node scripts/empaquetar.mjs --prueba [--whatsapp=549…] [--correo=…]
 *       → dist/gestion-aceitera-v<versión>-prueba.html: VERSIÓN DE PRUEBA para un
 *         cliente. Suma lo de la carpeta prueba/: datos de ejemplo, el cartel de
 *         prueba, "Enviar sugerencia" (a ese WhatsApp o correo; si no se ponen, el
 *         cliente elige a quién) y "Datos de prueba" (empezar de cero o volver al
 *         ejemplo). Guarda sus datos aparte ("prueba:" delante de cada clave), así
 *         no se mezclan con la versión final aunque se use el mismo navegador.
 *
 * Mete adentro app/css/styles.css y todos los app/js/*.js, en el mismo orden
 * que index.html. Los scripts van al final del <body>, como los "defer": se
 * ejecutan con la página ya armada. La política de seguridad (CSP) sigue sin
 * permitir código de afuera: solo acepta estos scripts y estilos, por su huella
 * (sha256).
 *
 * La versión normal usa las mismas claves de datos (soya_*) que la carpeta app/:
 * abierta en el mismo navegador, ve los mismos datos.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const PRUEBA = path.join(ROOT, 'prueba');
const DIST = path.join(ROOT, 'dist');

const args = process.argv.slice(2);
const opcion = (nombre) => { const a = args.find((x) => x.startsWith(`--${nombre}=`)); return a ? a.slice(nombre.length + 3) : ''; };
const esPrueba = args.includes('--prueba');

const huella = (texto) => `'sha256-${crypto.createHash('sha256').update(texto, 'utf8').digest('base64')}'`;
const leerJs = (archivo) => fs.readFileSync(archivo, 'utf8').replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const version = (/version:\s*'([^']+)'/.exec(fs.readFileSync(path.join(APP, 'js', 'config.js'), 'utf8')) || [])[1] || 'sin-version';

// Estilos
const css = fs.readFileSync(path.join(APP, 'css', 'styles.css'), 'utf8');
const enlaceCss = '<link rel="stylesheet" href="css/styles.css">';
if (!html.includes(enlaceCss)) throw new Error('No encontré el <link> de css/styles.css en index.html');
html = html.replace(enlaceCss, () => `<style>${css}</style>`);

const etiqueta = (s) => `<script>/* ${s.src} */\n${s.codigo}</script>`;
const dePrueba = (nombre) => ({ src: `prueba/${nombre}`, codigo: leerJs(path.join(PRUEBA, nombre)) });

// Scripts sin "defer" (el modo día/noche, que va antes de dibujar): quedan en el
// <head>, en el mismo lugar. En la versión de prueba, antes que ellos van los
// datos de contacto y "guardar todo aparte", para que lean lo de la prueba.
const enCabeza = [];
if (esPrueba) {
  const datosContacto = { whatsapp: opcion('whatsapp').replace(/\D/g, ''), correo: opcion('correo') };
  enCabeza.push({ src: 'prueba/contacto', codigo: `window.SoyaPrueba = ${JSON.stringify(datosContacto)};` }, dePrueba('aislar-datos.js'));
}
let primero = true;
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const propio = { src, codigo: leerJs(path.join(APP, src)) };
  const antes = primero ? enCabeza.map(etiqueta).join('\n    ') + (enCabeza.length ? '\n    ' : '') : '';
  primero = false;
  enCabeza.push(propio);
  return antes + etiqueta(propio);
});
if (primero && esPrueba) throw new Error('No encontré el script del <head> (js/tema.js) para poner antes lo de la prueba');

// Scripts con "defer": se sacan del <head> y van al final del <body>, en el mismo orden.
let scripts = [];
html = html.replace(/[ \t]*<script src="([^"]+)" defer><\/script>\r?\n?/g, (_, src) => {
  scripts.push({ src, codigo: leerJs(path.join(APP, src)) });
  return '';
});
if (!scripts.length) throw new Error('No encontré los <script src="…" defer> en index.html');

if (esPrueba) {
  const antesDe = (src, ...nuevos) => {
    const i = scripts.findIndex((s) => s.src === src);
    if (i < 0) throw new Error(`No encontré ${src} para la versión de prueba`);
    scripts.splice(i, 0, ...nuevos);
  };
  antesDe('js/store.js', dePrueba('datos-ejemplo.js'));
  scripts.push(dePrueba('prueba.js'));
  html = html.replace(/<title>([^<]*)<\/title>/, (_, t) => `<title>${t} (prueba)</title>`);
}

const bloque = scripts.map(etiqueta);
if (!html.includes('</body>')) throw new Error('No encontré </body> en index.html');
html = html.replace('</body>', () => `${bloque.join('\n')}\n</body>`);

// CSP: en vez de 'self', las huellas de cada script y del estilo.
const cspAntes = /script-src 'self'; style-src 'self';/;
if (!cspAntes.test(html)) throw new Error('La CSP de index.html no tiene el formato esperado');
const huellasJs = [...enCabeza, ...scripts].map((s) => huella(`/* ${s.src} */\n${s.codigo}`)).join(' ');
html = html.replace(cspAntes, () => `script-src ${huellasJs}; style-src ${huella(css)};`);

fs.mkdirSync(DIST, { recursive: true });
const salida = path.join(DIST, `gestion-aceitera-v${version}${esPrueba ? '-prueba' : ''}.html`);
fs.writeFileSync(salida, html);
console.log(`✔ ${path.relative(ROOT, salida)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${enCabeza.length + scripts.length} scripts)`);
