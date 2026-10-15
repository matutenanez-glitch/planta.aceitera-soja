/*
 * Equipos de la planta por lugar (líneas y sectores), sacados de config.lugares.
 *
 * Los mantenimientos guardan el id del equipo (equipoId), su lugar y su nombre.
 * Los registros de versiones anteriores solo tenían el nombre ("Extrusor Línea 1"),
 * o un id que después cambió: se reconocen por los nombres e ids anteriores de cada
 * equipo (antes: [...]). Los que no tienen equivalencia quedan como "otros", con
 * su nombre y su historial.
 */
(function (SoyaCore) {
  'use strict';

  const { lugares, tiposEquipo } = SoyaCore.config;

  const porId = new Map();
  const porNombreAnterior = new Map();
  const LUGARES = lugares.map((l) => {
    const equipos = l.equipos.map((e) => {
      const eq = Object.freeze({ id: e.id, nombre: e.nombre, tipo: e.tipo, lugar: l.id, lugarNombre: l.nombre });
      if (porId.has(e.id)) console.error('[SoyaCore] Equipo repetido en config.lugares:', e.id);
      porId.set(e.id, eq);
      (e.antes || []).forEach((n) => porNombreAnterior.set(n, eq));
      return eq;
    });
    return Object.freeze({ id: l.id, nombre: l.nombre, equipos: Object.freeze(equipos) });
  });
  const porLugar = new Map(LUGARES.map((l) => [l.id, l]));

  /** Equipo de un registro de mantenimiento (o null si no está en la lista actual). */
  function de(r) {
    if (!r) return null;
    if (r.equipoId) return porId.get(r.equipoId) || porNombreAnterior.get(r.equipoId) || null;
    return porNombreAnterior.get(r.equipo) || null;
  }

  const nombreCompleto = (eq) => `${eq.lugarNombre} · ${eq.nombre}`;

  SoyaCore.planta = {
    lugares: () => LUGARES,
    lugar: (id) => porLugar.get(id) || null,
    equipos: () => [...porId.values()],
    buscar: (id) => porId.get(id) || null,
    de,
    nombreCompleto,
    /** Cómo se muestra el equipo de un registro: "Línea 1 · Prensa 3", o su nombre viejo. */
    nombreDe: (r) => { const eq = de(r); return eq ? nombreCompleto(eq) : (r && r.equipo) || '-'; },
    /** Clave única del equipo de un registro (para agrupar el historial). */
    claveDe: (r) => { const eq = de(r); return eq ? eq.id : 'otro:' + ((r && r.equipo) || ''); },
    tipos: () => tiposEquipo,
    etiquetaTipo: (t) => tiposEquipo[t] || t || '-',
  };
})(window.SoyaCore = window.SoyaCore || {});
