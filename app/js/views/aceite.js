/*
 * Vista: Aceite por día y turno.
 *
 * Sale de los cierres de turno (Producción). Muestra, para hoy y para cada día
 * del período, el aceite que pasó cada turno y quién lo cargó, y avisa qué
 * turnos faltan cargar. El día va de 00:00 a 24:00 (Turno 1, 2 y 3) y se
 * produce de lunes a viernes (config.diasProduccion).
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt } = SoyaCore.ui;
  const store = SoyaCore.store;
  const T = SoyaCore.turnos;

  const pad = (n) => String(n).padStart(2, '0');
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const diaSemana = (iso) => `${DIAS[T.fechaDia(iso).getDay()]} ${ddmm(iso)}`;
  const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const plural = (n, uno, varios) => `${fmt.entero(n)} ${n === 1 ? uno : varios}`;
  const sumaAceite = (lista) => lista.reduce((s, r) => s + (r.sinProduccion ? 0 : Number(r.aceite) || 0), 0);

  let periodo = '7d';

  /** Primer y último día (AAAA-MM-DD) del período elegido. */
  function rango(clave) {
    const hoy = new Date();
    const hoyIso = T.isoDia(hoy);
    if (clave === '30d') return { desde: T.sumarDias(hoyIso, -29), hasta: hoyIso };
    if (clave === 'mes') return { desde: T.isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: hoyIso };
    if (clave === 'mesAnterior') {
      return {
        desde: T.isoDia(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: T.isoDia(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      };
    }
    return { desde: T.sumarDias(hoyIso, -6), hasta: hoyIso };
  }

  function irACargar(etiqueta, dia) {
    SoyaCore.navegar('produccion');
    SoyaCore.views.produccion.nuevoPara(etiqueta, dia);
  }

  function botonCargar(t, dia, texto, neutro) {
    const b = el('button', { className: neutro ? 'btn-falta btn-falta-neutro' : 'btn-falta', attrs: { type: 'button', title: `Cargar el ${T.corto(t.etiqueta)} del ${ddmm(dia)}` } }, [
      el('i', { attrs: { 'data-lucide': neutro ? 'clock' : 'circle-alert' }, className: 'h-3.5 w-3.5' }),
      el('span', { text: texto }),
    ]);
    b.addEventListener('click', () => irACargar(t.etiqueta, dia));
    return b;
  }

  function botonNoSeTrabajo(dia, etiquetas) {
    const b = el('button', {
      className: 'link-btn text-[11px]',
      text: 'No se trabajó',
      attrs: { type: 'button', 'data-sin-produccion': '', title: 'Marcar que no hubo producción en los turnos que faltan (parada, feriado). Se puede deshacer.' },
    });
    b.addEventListener('click', () => SoyaCore.views.produccion.marcarSinProduccion(dia, etiquetas));
    return b;
  }

  const chip = (clase, texto) => el('span', { className: 'chip ' + clase, text: texto });

  /** "Cargado a las 08:01" o, si se cargó otro día, "Cargado el jue 08/10 a las 10:15". */
  function textoCargado(r, dia) {
    const f = String(r.fecha);
    return f.slice(0, 10) === dia ? `Cargado a las ${f.slice(11, 16)}` : `Cargado el ${diaSemana(f.slice(0, 10)).toLowerCase()} a las ${f.slice(11, 16)}`;
  }

  // ---------- Hoy ----------
  function dibujarHoy(control) {
    const hoy = control.hoy;
    const f = T.fechaDia(hoy);
    $('#ac-hoy-fecha').textContent = `${DIAS_LARGOS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
    const resumen = control.resumenDia(hoy);

    $('#ac-hoy').replaceChildren(...resumen.turnos.map(({ turno: t, estado, registros }) => {
      const cabecera = (estadoChip) => el('div', { className: 'flex items-start justify-between gap-2' }, [
        el('div', null, [
          el('p', { className: 'font-semibold text-slate-200', text: t.nombre }),
          el('p', { className: 'text-[11px] text-slate-500', text: `${t.desde}:00 a ${t.hasta}:00` }),
        ]),
        estadoChip,
      ]);
      const tarjeta = (clase, est, hijos) => el('div', { className: 'turno-card ' + clase, attrs: { 'data-turno': t.etiqueta, 'data-estado': est } }, hijos);

      if (estado === 'cargado') {
        const litros = sumaAceite(registros);
        const hijos = [
          cabecera(chip('chip-operativo', 'Cargado')),
          el('p', { className: 'mt-2 text-2xl font-black text-white tabular-nums', text: fmt.litros(litros) }),
          el('p', { className: 'text-sm font-semibold text-brand-300', text: T.textoTanques(litros) || '—' }),
          el('p', { className: 'mt-1 truncate text-xs text-slate-400', text: registros.map((r) => r.operador || 'Sin operador').join(' · ') }),
        ];
        hijos.push(registros.length > 1
          ? el('p', { className: 'text-[11px] font-semibold text-amber-300', text: `Cargado ${registros.length} veces: revisalo en Producción.` })
          : el('p', { className: 'text-[11px] text-slate-500', text: textoCargado(registros[0], hoy) }));
        return tarjeta('estado-operativo', 'cargado', hijos);
      }
      if (estado === 'sinProduccion') {
        return tarjeta('estado-sin', 'sinProduccion', [cabecera(chip('chip-sin', 'No se trabajó')), el('p', { className: 'mt-2 text-sm text-slate-400', text: 'Marcado sin producción.' })]);
      }
      if (estado === 'falta' || estado === 'noSeEspera') {
        const falta = estado === 'falta';
        return tarjeta(falta ? 'estado-observaciones' : 'estado-sin', falta ? 'falta' : 'sinCarga', [
          cabecera(falta ? chip('chip-observaciones', 'Falta cargar') : chip('chip-sin', 'Sin producción')),
          el('p', { className: 'mt-2 text-sm text-slate-300', text: `Terminó a las ${hhmm(T.finMs(t, hoy))} y no tiene cierre.` }),
          el('div', { className: 'mt-2' }, [botonCargar(t, hoy, 'Cargar ahora', !falta)]),
        ]);
      }
      const enCurso = estado === 'enCurso';
      return tarjeta('estado-sin', estado, [
        cabecera(chip('chip-sin', enCurso ? 'En curso' : 'Más tarde')),
        el('p', { className: 'mt-2 text-sm text-slate-400', text: enCurso ? `Termina a las ${hhmm(T.finMs(t, hoy))}.` : `Empieza a las ${hhmm(T.inicioMs(t, hoy))}.` }),
      ]);
    }));
    SoyaCore.icons.render($('#ac-hoy'));

    const partes = [`${resumen.cargados + resumen.sinProduccion} de ${T.lista.length} turnos cargados`];
    if (resumen.total > 0) partes.unshift(`Total: ${fmt.litros(resumen.total)} (${T.textoTanques(resumen.total)})`);
    $('#ac-hoy-total').textContent = partes.join(' · ');
  }

  // ---------- Período ----------
  function kpi(titulo, valor, sub, alerta) {
    return el('div', { className: 'glass-panel rounded-xl p-5' + (alerta ? ' ring-1 ring-amber-400/40' : '') }, [
      el('p', { className: 'text-[11px] font-bold tracking-wide uppercase ' + (alerta ? 'text-amber-300' : 'text-slate-400'), text: titulo }),
      el('p', { className: 'mt-1 text-2xl font-black ' + (alerta ? 'text-amber-200' : 'text-white'), text: valor }),
      el('p', { className: 'mt-1 text-[11px] text-slate-500', text: sub }),
    ]);
  }

  function celdaTurno(dia, { turno: t, estado, registros }) {
    const attrs = { 'data-turno': t.etiqueta, 'data-estado': estado };
    if (estado === 'cargado') {
      const hijos = registros.filter((r) => !r.sinProduccion).map((r) => el('div', { className: 'py-0.5' }, [
        el('span', { className: 'block font-semibold ' + (r.operador ? 'text-slate-200' : 'text-slate-500 italic'), text: r.operador || 'Sin operador' }),
        el('span', { className: 'block text-sm text-brand-300 tabular-nums', text: fmt.litros(r.aceite) }),
        el('span', { className: 'block text-[11px] text-slate-500', text: T.textoTanques(r.aceite) }),
        T.cargadoTarde(r) ? el('span', { className: 'block text-[11px] text-sky-300', text: textoCargado(r, dia), attrs: { 'data-tarde': '' } }) : null,
      ]));
      if (registros.length > 1) hijos.push(el('span', { className: 'block text-[11px] font-semibold text-amber-300', text: `Cargado ${registros.length} veces` }));
      return el('td', { className: 'align-top', attrs }, hijos);
    }
    if (estado === 'sinProduccion') return el('td', { className: 'align-top text-xs text-slate-500 italic', text: 'No se trabajó', attrs });
    if (estado === 'falta') return el('td', { className: 'align-top', attrs }, [botonCargar(t, dia, 'Falta cargar')]);
    if (estado === 'enCurso' || estado === 'pendiente') return el('td', { className: 'align-top text-xs text-slate-500', text: 'Todavía no terminó', attrs });
    return el('td', { className: 'align-top text-slate-600', text: '—', attrs });
  }

  function chipDia(r) {
    const n = T.lista.length;
    if (r.faltan.length) return chip('chip-observaciones', r.faltan.length === 1 ? 'Falta 1 turno' : `Faltan ${r.faltan.length} turnos`);
    if (r.sinProduccion === n) return chip('chip-sin', 'No se trabajó');
    if (r.cargados + r.sinProduccion === n) return chip('chip-operativo', 'Completo');
    if (r.registros.length || r.porVenir) return chip('chip-sin', `${r.cargados + r.sinProduccion} de ${n}`);
    return chip('chip-sin', 'Sin producción');
  }

  function dibujarPeriodo(control) {
    const { desde, hasta } = rango(periodo);
    const hoy = control.hoy;
    $('#ac-periodo-rango').textContent = `${ddmm(desde)} al ${hasta === hoy ? 'hoy' : ddmm(hasta)}`;

    const dias = [];
    for (let d = hasta; d >= desde; d = T.sumarDias(d, -1)) dias.push(d);

    let total = 0;
    let turnosTrabajados = 0;
    let faltantes = 0;
    let diasConProduccion = 0;
    let diasIncompletos = 0;
    const totalPorTurno = new Map(T.lista.map((t) => [t.etiqueta, 0]));

    const filas = dias.map((dia) => {
      const r = control.resumenDia(dia);
      total += r.total;
      turnosTrabajados += r.cargados;
      faltantes += r.faltan.length;
      if (r.faltan.length) diasIncompletos++;
      if (r.trabajados.length) diasConProduccion++;
      r.turnos.forEach((x) => totalPorTurno.set(x.turno.etiqueta, totalPorTurno.get(x.turno.etiqueta) + sumaAceite(x.registros)));

      const estadoCelda = [chipDia(r)];
      if (r.faltan.length) estadoCelda.push(el('div', { className: 'mt-1' }, [botonNoSeTrabajo(dia, r.faltan.map((x) => x.turno.etiqueta))]));
      const apagado = !r.seEspera && !r.registros.length && dia !== hoy;

      return el('tr', { className: apagado ? 'opacity-60' : '', attrs: { 'data-dia': dia } }, [
        el('td', { className: 'align-top' }, [
          el('span', { className: 'block font-semibold text-slate-200', text: diaSemana(dia) }),
          dia === hoy ? el('span', { className: 'block text-[11px] text-brand-300', text: 'Hoy' }) : null,
        ]),
        ...r.turnos.map((x) => celdaTurno(dia, x)),
        el('td', { className: 'num align-top' }, [
          el('span', { className: 'block font-bold text-white', text: r.total ? fmt.litros(r.total) : '—' }),
          el('span', { className: 'block text-[11px] text-slate-500', text: r.total ? T.textoTanques(r.total) : '' }),
        ]),
        el('td', { className: 'align-top' }, estadoCelda),
      ]);
    });

    $('#ac-grilla-cabecera').replaceChildren(el('tr', null, [
      el('th', { text: 'Día', attrs: { scope: 'col' } }),
      ...T.lista.map((t) => el('th', { attrs: { scope: 'col' } }, [
        el('span', { className: 'block', text: t.nombre }),
        el('span', { className: 'block text-[10px] font-normal text-slate-500', text: `${t.desde} a ${t.hasta} h` }),
      ])),
      el('th', { className: 'num', text: 'Total del día', attrs: { scope: 'col' } }),
      el('th', { text: 'Estado', attrs: { scope: 'col' } }),
    ]));
    $('#ac-grilla').replaceChildren(...filas);
    $('#ac-grilla-pie').replaceChildren(el('tr', null, [
      el('td', { text: 'Total del período' }),
      ...T.lista.map((t) => el('td', { className: 'tabular-nums text-brand-300', text: fmt.litros(totalPorTurno.get(t.etiqueta)), attrs: { 'data-total-turno': t.etiqueta } })),
      el('td', { className: 'num text-white', text: fmt.litros(total), attrs: { 'data-total-periodo': '' } }),
      el('td'),
    ]));
    SoyaCore.icons.render($('#ac-grilla'));

    const tanquesTotal = T.textoTanques(total);
    $('#ac-kpis').replaceChildren(
      kpi('Aceite del período', fmt.litros(total), `${tanquesTotal ? tanquesTotal + ' · ' : ''}${plural(turnosTrabajados, 'turno trabajado', 'turnos trabajados')}`),
      kpi('Promedio por día', diasConProduccion ? fmt.litros(total / diasConProduccion) : '—', plural(diasConProduccion, 'día con producción', 'días con producción')),
      kpi('Promedio por turno', turnosTrabajados ? fmt.litros(total / turnosTrabajados) : '—', turnosTrabajados ? T.textoTanques(total / turnosTrabajados) : 'sin turnos cargados'),
      kpi('Turnos sin cargar', fmt.entero(faltantes), faltantes ? `en ${plural(diasIncompletos, 'día', 'días')}` : 'todo cargado', faltantes > 0),
    );
  }

  function dibujar() {
    const control = T.control(store.todos('produccion'));
    dibujarHoy(control);
    dibujarPeriodo(control);
  }

  const visible = () => !$('#view-aceite').hidden;

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.aceite = {
    init() {
      $$('#view-aceite [data-periodo]').forEach((b) => b.addEventListener('click', () => {
        periodo = b.dataset.periodo;
        $$('#view-aceite [data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        dibujar();
      }));
      store.alCambiar((c) => ['produccion', '*'].includes(c) && visible() && dibujar());
      // Los estados "en curso" / "falta cargar" dependen de la hora: se actualizan solos.
      setInterval(() => visible() && dibujar(), 60000);
    },
    refresh: dibujar,
  };
})(window.SoyaCore = window.SoyaCore || {});
