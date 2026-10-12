/*
 * Turnos: a qué día pertenece cada cierre de turno y qué turno sugerir al cargar.
 *
 * El día de producción va de 00:00 a 24:00: Turno 1 (00–08), Turno 2 (08–16)
 * y Turno 3 (16–00). El día está completo cuando se cargaron los 3 turnos.
 * Los horarios salen de los nombres en config.js → turnos.
 */
(function (SoyaCore) {
  'use strict';

  const cfg = SoyaCore.config;
  const HORA = 3600000;
  const pad = (n) => String(n).padStart(2, '0');
  const RE_FRANJA = /\((\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\)/;

  function leerFranja(etiqueta) {
    const m = RE_FRANJA.exec(String(etiqueta || ''));
    if (!m) return null;
    const inicio = Number(m[1]) * 60 + Number(m[2]); // minutos desde las 00:00
    const fin = Number(m[3]) * 60 + Number(m[4]);
    return {
      inicio,
      minutos: ((fin - inicio + 1440) % 1440) || 1440,
      clave: `${pad(m[1])}:${m[2]}-${pad(m[3])}:${m[4]}`,
      desde: pad(m[1]),
      hasta: pad(m[3]),
    };
  }

  const lista = cfg.turnos.map((etiqueta, orden) => {
    const f = leerFranja(etiqueta);
    return Object.assign({ etiqueta, orden, nombre: etiqueta.replace(/\s*\(.*\)/, '') }, f);
  });

  /** Turno de la configuración que corresponde a una etiqueta (por nombre exacto o por horario). */
  function porEtiqueta(etiqueta) {
    const exacto = lista.find((t) => t.etiqueta === etiqueta);
    if (exacto) return exacto;
    const f = leerFranja(etiqueta);
    return f ? lista.find((t) => t.clave === f.clave) || null : null;
  }

  /** Los registros viejos ("Turno 3 (00:00 - 08:00)") pasan al nombre actual con el mismo horario. */
  const normalizarEtiqueta = (etiqueta) => { const t = porEtiqueta(etiqueta); return t ? t.etiqueta : etiqueta; };

  const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fechaDia = (iso) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const sumarDias = (iso, n) => { const d = fechaDia(iso); d.setDate(d.getDate() + n); return isoDia(d); };
  const esDia = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

  function inicioMs(t, dia) {
    const d = fechaDia(dia);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, t.inicio).getTime();
  }
  const finMs = (t, dia) => inicioMs(t, dia) + t.minutos * 60000;

  /** Día del turno cuyo final queda más cerca de `refMs` (sirve para registros sin día). */
  function diaPara(etiqueta, refMs) {
    const t = porEtiqueta(etiqueta);
    if (!t || isNaN(refMs)) return null;
    const base = isoDia(new Date(refMs));
    let mejor = null;
    [-1, 0, 1].forEach((off) => {
      const dia = sumarDias(base, off);
      const dist = Math.abs(finMs(t, dia) - refMs);
      if (!mejor || dist < mejor.dist) mejor = { dia, dist };
    });
    return mejor.dia;
  }

  /** Día de la última vez que empezó ese turno (hoy o ayer). Para cuando se elige el turno a mano. */
  function ultimoDia(etiqueta, ahoraMs) {
    const t = porEtiqueta(etiqueta);
    const ahora = ahoraMs == null ? Date.now() : ahoraMs;
    const hoy = isoDia(new Date(ahora));
    if (!t) return hoy;
    return inicioMs(t, hoy) <= ahora ? hoy : sumarDias(hoy, -1);
  }

  /** Día de producción de un cierre de turno. */
  function diaDe(r) {
    if (esDia(r.dia)) return r.dia;
    return diaPara(r.turno, SoyaCore.ui.fechaMs(r.fecha)) || String(r.fecha || '').slice(0, 10);
  }

  /** 'terminado' | 'enCurso' | 'pendiente' según la hora actual. */
  function estado(etiqueta, dia, ahoraMs) {
    const t = porEtiqueta(etiqueta);
    const ahora = ahoraMs == null ? Date.now() : ahoraMs;
    if (!t) return 'terminado';
    if (ahora >= finMs(t, dia)) return 'terminado';
    return ahora >= inicioMs(t, dia) ? 'enCurso' : 'pendiente';
  }

  const clave = (dia, etiqueta) => `${dia}|${etiqueta}`;

  /**
   * Turno y día que conviene proponer en el formulario: el turno ya empezado
   * cuyo final está más cerca de ahora y que todavía no se cargó.
   * `cargados` es un Set de clave(dia, etiqueta).
   */
  function sugerir(cargados, ahoraMs) {
    const ahora = ahoraMs == null ? Date.now() : ahoraMs;
    const hoy = isoDia(new Date(ahora));
    const candidatos = [];
    [-1, 0].forEach((off) => {
      const dia = sumarDias(hoy, off);
      lista.forEach((t) => {
        if (inicioMs(t, dia) <= ahora) candidatos.push({ etiqueta: t.etiqueta, dia, dist: Math.abs(finMs(t, dia) - ahora) });
      });
    });
    candidatos.sort((a, b) => a.dist - b.dist);
    return candidatos.find((c) => !cargados || !cargados.has(clave(c.dia, c.etiqueta))) || candidatos[0];
  }

  /** "Turno 1 (00–08)" */
  const corto = (etiqueta) => { const t = porEtiqueta(etiqueta); return t ? `${t.nombre} (${t.desde}–${t.hasta})` : String(etiqueta || '-'); };

  /** "2 tanques", "1 tanque" o "≈ 1,4 tanques" según los litros. */
  function textoTanques(litros) {
    const l = Number(litros) || 0;
    if (l <= 0) return '';
    const n = l / cfg.litrosPorTanque;
    if (Number.isInteger(n)) return `${n} tanque${n === 1 ? '' : 's'}`;
    return `≈ ${SoyaCore.ui.fmt.decimal1(n)} tanques`;
  }

  SoyaCore.turnos = {
    lista,
    porEtiqueta,
    normalizarEtiqueta,
    isoDia,
    fechaDia,
    sumarDias,
    esDia,
    inicioMs,
    finMs,
    diaPara,
    ultimoDia,
    diaDe,
    estado,
    clave,
    sugerir,
    corto,
    textoTanques,
  };
})(window.SoyaCore = window.SoyaCore || {});
