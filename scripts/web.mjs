#!/usr/bin/env node
/**
 * Arma la página web completa (la usa Vercel al publicar, ver vercel.json):
 *
 *   node scripts/web.mjs
 *       → dist/web/          la app (lo mismo que app/)
 *       → dist/web/prueba/   la versión de prueba para clientes (datos de ejemplo,
 *                            "Sugerencia", "Datos de prueba"; guarda sus datos aparte)
 *
 * No necesita instalar nada (solo Node): el CSS ya está compilado en app/css/.
 * Acepta --whatsapp= y --correo= para la versión de prueba (ver prueba-web.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(ROOT, 'dist', 'web');

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), SALIDA, { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'prueba-web.mjs'), '--salida=dist/web/prueba', ...process.argv.slice(2)], { stdio: 'inherit' });

const version = (/version:\s*'([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', 'js', 'config.js'), 'utf8')) || [])[1];
console.log(`✔ dist/web/ listo (v${version}): la app en / y la versión de prueba en /prueba/`);
