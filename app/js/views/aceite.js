/*
 * Vista: Aceite por día y turno.
 *
 * Sale de los cierres de turno (Producción). Muestra, para hoy y para cada día
 * del período, el aceite que pasó cada turno y quién lo cargó, y avisa qué
 * turnos faltan cargar. El día va de 00:00 a 24:00 (Turno 1, 2 y 3).
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
  const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const plural = (n, uno, varios) => `${fmt.entero(n)} ${n === 1 ? uno : varios}`;
  const sumaAceite = (lista) => lista.reduce((s, r) => s + (Number(r.aceite) || 0), 0);

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

  /** Cierres de turno agrupados por día y por turno: Map(dia → Map(etiqueta → [registros])). */
  function agrupar() {
    const porDia = new Map();
    store.todos('produccion').forEach((r) => {
      const dia = T.diaDe(r);
      const etiqueta = T.normalizarEtiqueta(r.turno);
      if (!porDia.has(dia)) porDia.set(dia, new Map());
      const turnos = porDia.get(dia);
      if (!turnos.has(etiqueta)) turnos.set(etiqueta, []);
      turnos.get(etiqueta).push(r);
    });
    return porDia;
  }

  /** Estado de un día: cuántos turnos se cargaron, cuáles faltan y cuáles todavía no terminaron. */
  function estadoDia(dia, turnos, ahora) {
    const cargados = T.lista.filter((t) => turnos && turnos.has(t.etiqueta));
    const faltan = T.lista.filter((t) => !(turnos && turnos.has(t.etiqueta)) && T.estado(t.etiqueta, dia, ahora) === 'terminado');
    const porVenir = T.lista.filter((t) => !(turnos && turnos.has(t.etiqueta)) && T.estado(t.etiqueta, dia, ahora) !== 'terminado');
    const registros = turnos ? [...turnos.values()].flat() : [];
    return { cargados, faltan, porVenir, registros, total: sumaAceite(registros) };
  }

  function botonCargar(t, dia, texto, neutro) {
    const b = el('button', { className: neutro ? 'btn-falta btn-falta-neutro' : 'btn-falta', attrs: { type: 'button', title: `Cargar el ${T.corto(t.etiqueta)} del ${ddmm(dia)}` } }, [
      el('i', { attrs: { 'data-lucide': neutro ? 'clock' : 'circle-alert' }, className: 'h-3.5 w-3.5' }),
      el('span', { text: texto }),
    ]);
    b.addEventListener('click', () => {
      SoyaCore.navegar('produccion');
      SoyaCore.views.produccion.nuevoPara(t.etiqueta, dia);
    });
    return b;
  }

  function chip(clase, texto) {
    return el('span', { className: 'chip ' + clase, text: texto });
  }

  // ---------- Hoy ----------
  function dibujarHoy(grupos, ahora) {
    const hoy = T.isoDia(new Date(ahora));
    const f = T.fechaDia(hoy);
    $('#ac-hoy-fecha').textContent = `${DIAS_LARGOS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
    const turnos = grupos.get(hoy);
    const e = estadoDia(hoy, turnos, ahora);

    $('#ac-hoy').replaceChildren(...T.lista.map((t) => {
      const registros = (turnos && turnos.get(t.etiqueta)) || [];
      const est = T.estado(t.etiqueta, hoy, ahora);
      const cabecera = (estadoChip) => el('div', { className: 'flex items-start justify-between gap-2' }, [
        el('div', null, [
          el('p', { className: 'font-semibold text-slate-200', text: t.nombre }),
          el('p', { className: 'text-[11px] text-slate-500', text: `${t.desde}:00 a ${t.hasta}:00` }),
        ]),
        estadoChip,
      ]);

      if (registros.length) {
        const litros = sumaAceite(registros);
        const ultimo = registros[registros.length - 1];
        const hijos = [
          cabecera(chip('chip-operativo', 'Cargado')),
          el('p', { className: 'mt-2 text-2xl font-black text-white tabular-nums', text: fmt.litros(litros) }),
          el('p', { className: 'text-sm font-semibold text-brand-300', text: T.textoTanques(litros) || '—' }),
          el('p', { className: 'mt-1 truncate text-xs text-slate-400', text: registros.map((r) => r.operador || 'Sin operador').join(' · ') }),
        ];
        if (registros.length > 1) hijos.push(el('p', { className: 'text-[11px] font-semibold text-amber-300', text: `Cargado ${registros.length} veces: revisalo en Producción.` }));
        else hijos.push(el('p', { className: 'text-[11px] text-slate-500', text: `Cargado ${String(ultimo.fecha).slice(0, 10) === hoy ? 'a las ' + String(ultimo.fecha).slice(11, 16) : 'el ' + ddmm(String(ultimo.fecha)) + ' a las ' + String(ultimo.fecha).slice(11, 16)}` }));
        return el('div', { className: 'turno-card estado-operativo', attrs: { 'data-turno': t.etiqueta, 'data-estado': 'cargado' } }, hijos);
      }

      if (est === 'terminado') {
        // Si hoy ya se cargó algún turno, es día de producción y el que falta se marca en ámbar.
        // Si no se cargó ninguno (fin de semana, parada), queda en gris.
        const produce = e.cargados.length > 0;
        return el('div', { className: 'turno-card ' + (produce ? 'estado-observaciones' : 'estado-sin'), attrs: { 'data-turno': t.etiqueta, 'data-estado': produce ? 'falta' : 'sinCarga' } }, [
          cabecera(produce ? chip('chip-observaciones', 'Falta cargar') : chip('chip-sin', 'Sin cargar')),
          el('p', { className: 'mt-2 text-sm text-slate-300', text: `Terminó a las ${hhmm(T.finMs(t, hoy))} y no tiene cierre.` }),
          el('div', { className: 'mt-2' }, [botonCargar(t, hoy, 'Cargar ahora', !produce)]),
        ]);
      }

      const enCurso = est === 'enCurso';
      return el('div', { className: 'turno-card estado-sin', attrs: { 'data-turno': t.etiqueta, 'data-estado': enCurso ? 'enCurso' : 'pendiente' } }, [
        cabecera(chip('chip-sin', enCurso ? 'En curso' : 'Más tarde')),
        el('p', { className: 'mt-2 text-sm text-slate-400', text: enCurso ? `Termina a las ${hhmm(T.finMs(t, hoy))}.` : `Empieza a las ${hhmm(T.inicioMs(t, hoy))}.` }),
      ]);
    }));
    SoyaCore.icons.render($('#ac-hoy'));

    const partes = [`${e.cargados.length} de ${T.lista.length} turnos cargados`];
    if (e.total > 0) partes.unshift(`Total: ${fmt.litros(e.total)} (${T.textoTanques(e.total)})`);
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

  function celdaTurno(t, dia, registros, est) {
    if (registros && registros.length) {
      const hijos = registros.map((r) => el('div', { className: 'py-0.5' }, [
        el('span', { className: 'block font-semibold ' + (r.operador ? 'text-slate-200' : 'text-slate-500 italic'), text: r.operador || 'Sin operador' }),
        el('span', { className: 'block text-sm text-brand-300 tabular-nums', text: fmt.litros(r.aceite) }),
        el('span', { className: 'block text-[11px] text-slate-500', text: T.textoTanques(r.aceite) }),
      ]));
      if (registros.length > 1) hijos.push(el('span', { className: 'block text-[11px] font-semibold text-amber-300', text: `Cargado ${registros.length} veces` }));
      return el('td', { className: 'align-top', attrs: { 'data-turno': t.etiqueta, 'data-estado': 'cargado' } }, hijos);
    }
    if (est === 'falta') return el('td', { className: 'align-top', attrs: { 'data-turno': t.etiqueta, 'data-estado': 'falta' } }, [botonCargar(t, dia, 'Falta cargar')]);
    if (est === 'porVenir') return el('td', { className: 'align-top text-xs text-slate-500', text: 'Todavía no terminó', attrs: { 'data-turno': t.etiqueta, 'data-estado': 'porVenir' } });
    return el('td', { className: 'align-top text-slate-600', text: '—', attrs: { 'data-turno': t.etiqueta, 'data-estado': 'vacio' } });
  }

  function dibujarPeriodo(grupos, ahora) {
    const { desde, hasta } = rango(periodo);
    const hoy = T.isoDia(new Date(ahora));
    $('#ac-periodo-rango').textContent = `${ddmm(desde)} al ${hasta === hoy ? 'hoy' : ddmm(hasta)}`;

    const dias = [];
    for (let d = hasta; d >= desde; d = T.sumarDias(d, -1)) dias.push(d);

    let total = 0;
    let turnosCargados = 0;
    let faltantes = 0;
    let diasConProduccion = 0;
    let diasSinCarga = 0;
    let diasIncompletos = 0;
    const totalPorTurno = new Map(T.lista.map((t) => [t.etiqueta, 0]));

    const filas = dias.map((dia) => {
      const turnos = grupos.get(dia);
      const e = estadoDia(dia, turnos, ahora);
      const hayCarga = e.cargados.length > 0;
      total += e.total;
      turnosCargados += e.cargados.length;
      if (hayCarga) {
        diasConProduccion++;
        faltantes += e.faltan.length;
        if (e.faltan.length) diasIncompletos++;
      } else if (dia !== hoy) {
        diasSinCarga++;
      }
      T.lista.forEach((t) => totalPorTurno.set(t.etiqueta, totalPorTurno.get(t.etiqueta) + sumaAceite((turnos && turnos.get(t.etiqueta)) || [])));

      let estadoChip;
      if (e.cargados.length === T.lista.length) estadoChip = chip('chip-operativo', 'Completo');
      else if (hayCarga && e.faltan.length) estadoChip = chip('chip-observaciones', e.faltan.length === 1 ? 'Falta 1 turno' : `Faltan ${e.faltan.length} turnos`);
      else if (hayCarga) estadoChip = chip('chip-sin', `${e.cargados.length} de ${T.lista.length}`);
      else estadoChip = chip('chip-sin', dia === hoy ? `0 de ${T.lista.length}` : 'Sin carga');

      const f = T.fechaDia(dia);
      const celdas = T.lista.map((t) => {
        const registros = turnos && turnos.get(t.etiqueta);
        let est = 'vacio';
        if (!registros) {
          if (e.porVenir.includes(t)) est = 'porVenir';
          else if (hayCarga) est = 'falta';
        }
        return celdaTurno(t, dia, registros, est);
      });

      return el('tr', { className: hayCarga || dia === hoy ? '' : 'opacity-60', attrs: { 'data-dia': dia } }, [
        el('td', { className: 'align-top' }, [
          el('span', { className: 'block font-semibold text-slate-200', text: `${DIAS[f.getDay()]} ${ddmm(dia)}` }),
          dia === hoy ? el('span', { className: 'block text-[11px] text-brand-300', text: 'Hoy' }) : null,
        ]),
        ...celdas,
        el('td', { className: 'num align-top' }, [
          el('span', { className: 'block font-bold text-white', text: e.total ? fmt.litros(e.total) : '—' }),
          el('span', { className: 'block text-[11px] text-slate-500', text: e.total ? T.textoTanques(e.total) : '' }),
        ]),
        el('td', { className: 'align-top' }, [estadoChip]),
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
      kpi('Aceite del período', fmt.litros(total), `${tanquesTotal ? tanquesTotal + ' · ' : ''}${plural(turnosCargados, 'turno cargado', 'turnos cargados')}`),
      kpi('Promedio por día', diasConProduccion ? fmt.litros(total / diasConProduccion) : '—', plural(diasConProduccion, 'día con producción', 'días con producción')),
      kpi('Promedio por turno', turnosCargados ? fmt.litros(total / turnosCargados) : '—', turnosCargados ? T.textoTanques(total / turnosCargados) : 'sin turnos cargados'),
      kpi('Turnos sin cargar', fmt.entero(faltantes),
        faltantes ? `en ${plural(diasIncompletos, 'día', 'días')} con producción` : diasSinCarga ? `${plural(diasSinCarga, 'día', 'días')} sin ninguna carga` : 'todos los días están completos',
        faltantes > 0),
    );
  }

  function dibujar() {
    const ahora = Date.now();
    const grupos = agrupar();
    dibujarHoy(grupos, ahora);
    dibujarPeriodo(grupos, ahora);
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
