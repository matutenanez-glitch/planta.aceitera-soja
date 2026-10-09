// Pruebas del cálculo del circuito de aceite.  Correr con:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../app/js/circuito-aceite.js');
const { simular, parseFecha } = globalThis.SoyaCore.circuito;

const CFG = {
  interiores: { capacidad: 1525, nombres: ['INT 1', 'INT 2'], reposoMinutos: 60 },
  exteriores: { capacidad: 7625, nombres: ['EXT 1', 'EXT 2', 'EXT 3', 'EXT 4'] },
  grandes: { capacidad: 30000, nombres: ['GRANDE 1', 'GRANDE 2', 'GRANDE 3'] },
  trasvaseCuandoFalten: 1525,
  horasTurno: 8,
};
const t = (s) => parseFecha(s);
const turno = (fecha, aceite) => ({ id: fecha, fecha, turno: 'T', aceite });
const litros = (lista) => lista.map((x) => Math.round(x.litros));

/** n cierres de turno seguidos de 8 h, empezando el 1/10 a las 16:00 */
function turnos(n, aceite) {
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(2026, 9, 1, 16 + 8 * k, 0);
    const p = (x) => String(x).padStart(2, '0');
    return turno(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`, aceite);
  });
}

test('un turno chico queda en el interior que se está llenando', () => {
  const r = simular(CFG, { produccion: [turno('2026-10-01 16:00', 1000)] }, t('2026-10-01 17:00'));
  assert.deepEqual(litros(r.interiores), [1000, 0]);
  assert.equal(r.interiores[0].estado, 'llenando');
  assert.equal(r.totales.exteriores, 0);
});

test('al llenarse un interior pasa a reposo 1 h y las canillas van al otro', () => {
  // 1600 L en 8 h = 200 L/h → INT 1 se llena a las 15:37:30, reposo hasta 16:37:30
  const datos = { produccion: [turno('2026-10-01 16:00', 1600)] };
  const r = simular(CFG, datos, t('2026-10-01 16:00'));
  assert.equal(r.interiores[0].estado, 'reposo');
  assert.equal(r.interiores[0].reposoRestanteMin, 38);
  assert.equal(r.interiores[1].estado, 'llenando');
  assert.deepEqual(litros(r.interiores), [1525, 75]);

  const despues = simular(CFG, datos, t('2026-10-01 17:00'));
  assert.deepEqual(litros(despues.interiores), [0, 75]);
  assert.equal(despues.interiores[0].estado, 'vacio');
  assert.deepEqual(litros(despues.exteriores), [1525, 0, 0, 0]);
  assert.equal(despues.exteriores[0].estado, 'llenando');
});

test('exteriores en ronda: al que se llena le falta un interior → se vacía solo el siguiente', () => {
  // 20 turnos de 1600 L = 32.000 L → 20 interiores llenos (30.500 L) bajaron a exteriores.
  // EXT 1, 2 y 3 se llenan (5 interiores cada uno). Con el vaciado 19, al EXT 4 le falta
  // un interior → se vacía EXT 1 (el que más decantó). El vaciado 20 llena EXT 4 y la
  // ronda sigue por EXT 1, que ya está vacío.
  const r = simular(CFG, { produccion: turnos(20, 1600) }, t('2026-10-20 00:00'));
  assert.equal(Math.round(r.totales.planta), 32000, 'no se pierde ni aparece aceite');
  assert.deepEqual(litros(r.grandes), [7625, 0, 0]);
  assert.deepEqual(litros(r.exteriores), [0, 7625, 7625, 7625]);
  assert.equal(Math.round(r.totales.interiores), 1500);
  const trasvases = r.movimientos.filter((m) => m.tipo === 'trasvase');
  assert.equal(trasvases.length, 1);
  assert.equal(trasvases[0].desde, 'EXT 1');
  assert.equal(r.exteriorActivo, 0);
  assert.equal(r.exteriores[1].estado, 'decantando');
  assert.ok(r.exteriores[1].decantandoDesde < r.exteriores[3].decantandoDesde, 'EXT 2 decanta hace más que EXT 4');
  assert.equal(r.proximoVaciado, 'EXT 2');
});

test('en régimen siempre hay 3 exteriores decantando y uno llenándose', () => {
  const r = simular(CFG, { produccion: turnos(60, 1600) }, t('2026-11-01 00:00'));
  assert.equal(Math.round(r.totales.planta), 96000);
  const estados = r.exteriores.map((e) => e.estado);
  assert.equal(estados.filter((e) => e === 'llenando').length, 1);
  assert.ok(estados.filter((e) => e === 'decantando').length >= 2);
  r.movimientos.filter((m) => m.tipo === 'trasvase').forEach((m) => assert.equal(m.forzado, false));
});

test('el despacho baja el tanque grande elegido', () => {
  const datos = {
    produccion: turnos(20, 1600),
    despachosAceite: [{ id: 'd1', fecha: '2026-10-19 23:00', tanque: 0, litros: 5000, empresa: 'X' }],
  };
  const r = simular(CFG, datos, t('2026-10-20 00:00'));
  assert.deepEqual(litros(r.grandes), [2625, 0, 0]);
  assert.equal(r.alertas.length, 0);
});

test('despachar más de lo que hay deja el tanque en 0 y avisa', () => {
  const datos = { despachosAceite: [{ id: 'd1', fecha: '2026-10-02 10:00', tanque: 1, litros: 5000 }] };
  const r = simular(CFG, datos, t('2026-10-03 00:00'));
  assert.equal(r.grandes[1].litros, 0);
  assert.equal(r.alertas.length, 1);
});

test('una medición reemplaza los niveles y la producción sigue desde ahí', () => {
  const datos = {
    produccion: [...turnos(5, 1600), turno('2026-10-05 16:00', 1000)],
    mediciones: [{ id: 'm1', fecha: '2026-10-05 08:00', interiores: [500, 0], interiorActivo: 0, exteriores: [7625, 3000, 0, 0], exteriorActivo: 1, grandes: [20000, 5000, 0] }],
  };
  const r = simular(CFG, datos, t('2026-10-05 20:00'));
  // 500 + 1000 = 1500 en INT 1 (no llega a llenarse)
  assert.deepEqual(litros(r.interiores), [1500, 0]);
  assert.deepEqual(litros(r.exteriores), [7625, 3000, 0, 0]);
  assert.deepEqual(litros(r.grandes), [20000, 5000, 0]);
  assert.equal(r.ultimaMedicion.id, 'm1');
});

test('si los grandes se llenan, el aceite no se pierde y hay aviso', () => {
  const chico = { ...CFG, grandes: { ...CFG.grandes, capacidad: 5000 } };
  const r = simular(chico, { produccion: turnos(60, 1600) }, t('2026-11-01 00:00'));
  assert.equal(Math.round(r.totales.planta), 96000);
  assert.equal(r.grandes[2].estado, 'excedido');
  assert.ok(r.alertas.some((a) => a.texto.includes('llenos')));
});

test('un turno con muchísimo aceite vacía antes de tiempo y avisa', () => {
  // 13.000 L en 8 h: INT 2 se llena antes de que INT 1 termine su reposo
  const r = simular(CFG, { produccion: [turno('2026-10-01 16:00', 13000)] }, t('2026-10-02 00:00'));
  assert.equal(Math.round(r.totales.planta), 13000);
  assert.ok(r.alertas.some((a) => a.texto.includes('antes de cumplir el reposo')));
});

test('falta para trasvase descuenta lo que ya está en interiores', () => {
  const r = simular(CFG, { produccion: [turno('2026-10-01 16:00', 1000)] }, t('2026-10-01 17:00'));
  // lugar hasta el disparo: 3 × 7.625 + (7.625 − 1.525) = 28.975; menos 1.000 en INT 1
  assert.equal(Math.round(r.faltaParaTrasvase), 27975);
});

test('un turno que termina después de una medición solo suma lo producido después de medir', () => {
  // Medición a las 12:00; el turno de 08:00 a 16:00 trae 1600 L (200 L/h) → entran 800 L.
  const datos = {
    produccion: [turno('2026-10-05 16:00', 1600)],
    mediciones: [{ id: 'm1', fecha: '2026-10-05 12:00', interiores: [0, 0], interiorActivo: 0, exteriores: [0, 0, 0, 0], exteriorActivo: 0, grandes: [0, 0, 0] }],
  };
  const r = simular(CFG, datos, t('2026-10-05 16:30'));
  assert.equal(Math.round(r.totales.planta), 800);
  // Y si el cierre se registra en el mismo minuto que la medición, no suma nada (ya está medido).
  const mismo = simular(CFG, { ...datos, produccion: [turno('2026-10-05 12:00', 1600)] }, t('2026-10-05 13:00'));
  assert.equal(Math.round(mismo.totales.planta), 0);
});
