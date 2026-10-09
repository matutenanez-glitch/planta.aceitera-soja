/*
 * Vista: Aceite.
 *
 * Arriba, lo que más importa: cuánto aceite se produjo y cuánto se despachó
 * en el período (balance + gráficos por día). Abajo, dónde está el aceite
 * ahora (circuito de tanques), los movimientos y la medición manual.
 *
 * No se carga nada a mano: todo sale de los cierres de turno, los despachos
 * de aceite y las mediciones (ver js/circuito-aceite.js). Se recalcula al
 * guardar cualquiera de esos datos y cada 30 segundos, para que la cuenta
 * regresiva del reposo avance sola.
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, el, fmt, fillSelect, tablaRegistros, editorFormulario, guardarRegistro } = SoyaCore.ui;
  const store = SoyaCore.store;
  const cfg = SoyaCore.config.tanques;
  const icons = SoyaCore.icons;

  // ---------- Formatos ----------
  const pad = (n) => String(n).padStart(2, '0');
  const fechaCorta = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function duracion(ms) {
    const min = Math.max(Math.round(ms / 60000), 0);
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${pad(m)} min`;
    return `${m} min`;
  }
  const pct = (litros, cap) => Math.round((litros / cap) * 100);

  // ---------- Tanques (se construyen una vez y después solo se actualizan) ----------
  const ESTILOS = {
    interior: {
      cuerpo: 'relative h-32 w-16 overflow-hidden rounded-t rounded-b-3xl border-2 border-slate-600 bg-slate-900 shadow-inner',
      liquido: 'liquid-fill absolute bottom-0 w-full bg-linear-to-t from-brand-600 to-brand-400 opacity-90',
      litros: 'font-mono text-xs text-brand-400 tabular-nums',
    },
    exterior: {
      cuerpo: 'relative h-36 w-16 overflow-hidden rounded-b-lg border-2 border-slate-500 bg-slate-900',
      liquido: 'liquid-fill absolute bottom-0 w-full bg-linear-to-t from-blue-700 to-brand-500 opacity-80',
      litros: 'font-mono text-xs text-blue-400 tabular-nums',
    },
    grande: {
      cuerpo: 'relative h-40 w-20 overflow-hidden rounded-t-md rounded-b-2xl border-2 border-slate-500 bg-slate-900',
      liquido: 'liquid-fill absolute bottom-0 w-full bg-linear-to-t from-purple-800 to-brand-600 opacity-75',
      litros: 'font-mono text-xs font-bold text-purple-400 tabular-nums',
    },
  };

  function crearTanque(tipo, nombre, capacidad) {
    const e = ESTILOS[tipo];
    const chip = el('span', { className: 'chip chip-vacio' });
    const liquido = el('div', { className: e.liquido });
    liquido.style.height = '0%';
    const cuerpo = el('div', { className: e.cuerpo, attrs: { role: 'meter', 'aria-label': nombre, 'aria-valuemin': '0', 'aria-valuemax': String(capacidad), 'aria-valuenow': '0' } }, [liquido]);
    const litros = el('span', { className: e.litros, text: '0 L' });
    const detalle = el('span', { className: 'text-center text-[10px] whitespace-nowrap text-slate-500' });
    const nodo = el('div', { className: 'flex min-w-0 flex-col items-center gap-1.5' }, [
      chip,
      el('div', { className: 'mt-1' }, [cuerpo]),
      el('span', { className: 'mt-1 text-xs font-bold text-slate-200', text: nombre }),
      litros,
      detalle,
    ]);
    return { nodo, chip, liquido, cuerpo, litros, detalle };
  }

  const CHIPS = {
    llenando:     { clase: 'chip-llenando',   icono: 'arrow-down-to-line', texto: 'Llenándose' },
    reposo:       { clase: 'chip-reposo',     icono: 'timer',              texto: 'Reposo' },
    decantando:   { clase: 'chip-decantando', icono: 'hourglass',          texto: 'Decantando' },
    'con aceite': { clase: 'chip-aceite',     icono: null,                 texto: 'Con aceite' },
    lleno:        { clase: 'chip-decantando', icono: null,                 texto: 'Lleno' },
    vacio:        { clase: 'chip-vacio',      icono: null,                 texto: 'Vacío' },
    excedido:     { clase: 'chip-excedido',   icono: 'triangle-alert',     texto: 'Excedido' },
  };

  function pintarTanque(t, dato, { chipExtra, detalle }) {
    const c = CHIPS[dato.estado] || CHIPS.vacio;
    t.chip.className = 'chip ' + c.clase;
    t.chip.replaceChildren(
      ...(c.icono ? [el('i', { attrs: { 'data-lucide': c.icono }, className: 'h-3 w-3' })] : []),
      el('span', { text: c.texto + (chipExtra ? ' · ' + chipExtra : '') }),
    );
    icons.render(t.chip);
    t.liquido.style.height = Math.min((dato.litros / dato.capacidad) * 100, 100) + '%';
    t.cuerpo.classList.toggle('tanque-activo', dato.estado === 'llenando');
    t.cuerpo.classList.toggle('border-red-500', dato.estado === 'excedido');
    t.cuerpo.setAttribute('aria-valuenow', String(Math.round(dato.litros)));
    t.cuerpo.setAttribute('aria-valuetext', `${fmt.entero(dato.litros)} de ${fmt.entero(dato.capacidad)} litros, ${c.texto.toLowerCase()}`);
    t.litros.textContent = fmt.entero(dato.litros) + ' L';
    t.detalle.textContent = detalle;
  }

  const tanques = { interiores: [], exteriores: [], grandes: [] };

  function construir() {
    tanques.interiores = cfg.interiores.nombres.map((n) => crearTanque('interior', n, cfg.interiores.capacidad));
    tanques.exteriores = cfg.exteriores.nombres.map((n) => crearTanque('exterior', n, cfg.exteriores.capacidad));
    tanques.grandes = cfg.grandes.nombres.map((n) => crearTanque('grande', n, cfg.grandes.capacidad));
    $('#tanques-interiores').replaceChildren(...tanques.interiores.map((t) => t.nodo));
    $('#tanques-exteriores').replaceChildren(...tanques.exteriores.map((t) => t.nodo));
    $('#tanques-grandes').replaceChildren(...tanques.grandes.map((t) => t.nodo));

    const equivalen = cfg.exteriores.capacidad / cfg.interiores.capacidad;
    $('#ac-interiores-regla').textContent =
      `${fmt.entero(cfg.interiores.capacidad)} L c/u. Se alternan: el lleno reposa ${cfg.interiores.reposoMinutos} min mientras se llena el otro.`;
    $('#ac-exteriores-regla').textContent =
      `${fmt.entero(cfg.exteriores.capacidad)} L útiles c/u (≈ ${fmt.decimal1(equivalen)} interiores` +
      (cfg.exteriores.capacidadLimpio ? `; limpio, ${fmt.entero(cfg.exteriores.capacidadLimpio)} L` : '') +
      `). Se llenan en ronda: ${cfg.exteriores.nombres.map((n) => n.replace(/\D+/g, '')).join(' → ')} → …`;
    $('#ac-grandes-regla').textContent =
      `${fmt.entero(cfg.grandes.capacidad)} L c/u. Se llenan en orden.`;
  }

  // ---------- Cálculo y pintado ----------
  function calcular() {
    return SoyaCore.circuito.simular(cfg, {
      produccion: store.todos('produccion'),
      despachosAceite: store.todos('despachosAceite'),
      mediciones: store.todos('mediciones'),
    }, Date.now());
  }

  function promedioPorTurno() {
    const ultimos = store.todos('produccion').map((p) => Number(p.aceite)).filter((v) => v > 0).slice(-9);
    return ultimos.length ? ultimos.reduce((a, b) => a + b, 0) / ultimos.length : 0;
  }

  const PUNTOS = {
    turno: 'bg-emerald-400',
    lleno: 'bg-brand-400',
    vaciado: 'bg-blue-400',
    trasvase: 'bg-purple-400',
    despacho: 'bg-purple-300',
    medicion: 'bg-slate-400',
  };

  function textoMovimiento(m) {
    const L = (v) => fmt.entero(v) + ' L';
    switch (m.tipo) {
      case 'turno': return m.contados != null
        ? `Cierre de ${m.turno || 'turno'}: ${L(m.litros)}; se suman ${L(m.contados)} producidos después de la medición.`
        : `Cierre de ${m.turno || 'turno'}: entraron ${L(m.litros)} desde las bateas.`;
      case 'lleno': return `${m.tanque} se llenó y queda en reposo ${cfg.interiores.reposoMinutos} min. Canillas a ${m.siguiente}.`;
      case 'vaciado': return `${m.desde} bajó ${L(m.litros)} a ${m.hacia.join(' y ')}${m.forzado ? ' (antes de terminar el reposo)' : ''}.`;
      case 'trasvase': return `${m.desde} se vació a grandes: ${m.reparto.map((r) => `${r.tanque} ${L(r.litros)}`).join(', ')}.`;
      case 'despacho': return `Camión${m.empresa ? ' de ' + m.empresa : ''} cargó ${L(m.litros)} de ${m.tanque}.`;
      case 'medicion': return 'Medición cargada: los niveles se corrigieron a mano.';
      default: return m.tipo;
    }
  }

  function pintar() {
    const ahora = Date.now();
    pintarBalance(ahora);
    const r = calcular();

    // Tanques
    r.interiores.forEach((d, i) => pintarTanque(tanques.interiores[i], d, {
      chipExtra: d.estado === 'reposo' ? `${d.reposoRestanteMin} min` : '',
      detalle: d.estado === 'reposo' ? `baja a las ${fechaCorta(d.reposoHasta).slice(6)}` : `${pct(d.litros, d.capacidad)} % de ${fmt.entero(d.capacidad)} L`,
    }));
    r.exteriores.forEach((d, i) => pintarTanque(tanques.exteriores[i], d, {
      chipExtra: '',
      detalle: d.estado === 'decantando' && d.decantandoDesde ? `hace ${duracion(ahora - d.decantandoDesde)}` : `${pct(d.litros, d.capacidad)} %`,
    }));
    r.grandes.forEach((d, i) => pintarTanque(tanques.grandes[i], d, {
      chipExtra: '',
      detalle: `${pct(d.litros, d.capacidad)} % de ${fmt.entero(d.capacidad)} L`,
    }));

    // Resumen
    $('#ac-total').textContent = fmt.litros(r.totales.planta);
    $('#ac-total-detalle').textContent = `Interiores ${fmt.entero(r.totales.interiores)} · Exteriores ${fmt.entero(r.totales.exteriores)} · Grandes ${fmt.entero(r.totales.grandes)}`;
    $('#ac-grandes').textContent = fmt.litros(r.totales.grandes);
    $('#ac-grandes-detalle').textContent = `${pct(r.totales.grandes, r.totales.capacidadGrandes)} % de ${fmt.entero(r.totales.capacidadGrandes)} L de capacidad`;

    if (r.proximoVaciado) {
      const prom = promedioPorTurno();
      const turnos = prom > 0 ? Math.ceil(r.faltaParaTrasvase / prom) : null;
      $('#ac-trasvase').textContent = r.proximoVaciado;
      $('#ac-trasvase-detalle').textContent = r.faltaParaTrasvase > 0
        ? `Faltan ${fmt.entero(r.faltaParaTrasvase)} L de producción${turnos ? ` (≈ ${turnos} turno${turnos === 1 ? '' : 's'})` : ''}.`
        : 'Ya corresponde vaciarlo.';
    } else {
      $('#ac-trasvase').textContent = '—';
      $('#ac-trasvase-detalle').textContent = 'Los exteriores todavía no completaron la primera ronda.';
    }

    if (r.ultimoTurno) {
      $('#ac-ultimo-turno').textContent = '+' + fmt.litros(r.ultimoTurno.litros);
      $('#ac-ultimo-turno-detalle').textContent = `${r.ultimoTurno.turno || 'Turno'} · ${fechaCorta(r.ultimoTurno.t)}`;
    } else {
      $('#ac-ultimo-turno').textContent = '—';
      $('#ac-ultimo-turno-detalle').textContent = 'Todavía no hay cierres de turno.';
    }

    // Alertas del cálculo (las más recientes)
    $('#ac-alertas').replaceChildren(...r.alertas.slice(-4).reverse().map((a) => {
      const box = el('div', { className: 'flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-900/20 p-4 text-sm text-amber-100', attrs: { role: 'alert' } }, [
        el('i', { attrs: { 'data-lucide': 'triangle-alert' }, className: 'mt-0.5 h-4 w-4 text-amber-400' }),
        el('p', { text: `${fechaCorta(a.t)} · ${a.texto}` }),
      ]);
      icons.render(box);
      return box;
    }));

    // Movimientos (los últimos 12, el más nuevo arriba)
    const movs = r.movimientos.filter((m) => m.t <= ahora).slice(-12).reverse();
    $('#ac-movimientos').replaceChildren(...(movs.length ? movs.map((m) => el('li', { className: 'flex items-start gap-3 py-2.5' }, [
      el('span', { className: 'w-24 shrink-0 font-mono text-[11px] text-slate-500 tabular-nums', text: fechaCorta(m.t) }),
      el('span', { className: 'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (PUNTOS[m.tipo] || 'bg-slate-500'), attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'text-slate-300', text: textoMovimiento(m) }),
    ])) : [el('li', { className: 'py-4 text-slate-500 italic', text: 'Todavía no hay movimientos. Aparecen solos al guardar un cierre de turno.' })]));

    ultimoCalculo = r;
    if (!formTocado && !editor.id) cargarNivelesEnFormulario(r);
  }

  // ---------- Período, balance y gráficos ----------
  const DIA = 86400000;
  const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const inicioDelDia = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const ddmm = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  let periodo = '7d';

  /** Rango [inicio, fin) del período y el comienzo de cada día. */
  function rango(clave, ahora) {
    const hoy = new Date(ahora);
    let inicio;
    let fin = ahora + 1;
    if (clave === '30d') inicio = inicioDelDia(ahora) - 29 * DIA;
    else if (clave === 'mes') inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    else if (clave === 'mesAnterior') {
      inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).getTime();
      fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    } else inicio = inicioDelDia(ahora) - 6 * DIA;
    const dias = [];
    for (const d = new Date(inicio); d.getTime() < fin; d.setDate(d.getDate() + 1)) dias.push(d.getTime());
    return { inicio, fin, dias };
  }

  function datosCircuito() {
    return { produccion: store.todos('produccion'), despachosAceite: store.todos('despachosAceite'), mediciones: store.todos('mediciones') };
  }
  const stockEn = (datos, t) => SoyaCore.circuito.simular(cfg, datos, t).totales.planta;

  function sumarEntre(lista, campo, a, b) {
    const parse = SoyaCore.circuito.parseFecha;
    let total = 0, cantidad = 0;
    lista.forEach((r) => {
      const t = parse(r.fecha);
      if (t >= a && t < b) { total += Number(r[campo]) || 0; cantidad++; }
    });
    return { total, cantidad };
  }

  function tarjetaBalance(titulo, valor, sub, opciones) {
    const o = opciones || {};
    const punto = o.color ? el('span', { className: 'inline-block h-2.5 w-2.5 rounded-sm' }) : null;
    if (punto) punto.style.background = o.color;
    return el('div', { className: 'min-w-40 flex-1 rounded-xl border p-4 ' + (o.final ? 'border-brand-500/40 bg-brand-500/10' : 'border-slate-800 bg-slate-900/50') }, [
      el('p', { className: 'flex items-center gap-2 text-[11px] font-bold tracking-wide text-slate-400 uppercase' }, [punto, el('span', { text: titulo })]),
      el('p', { className: 'mt-1 text-2xl font-black ' + (o.final ? 'text-brand-300' : 'text-white'), text: valor }),
      el('p', { className: 'mt-1 text-[11px] text-slate-500', text: sub }),
    ]);
  }
  const operador = (signo) => el('span', { className: 'self-center px-1 text-2xl font-light text-slate-500', text: signo, attrs: { 'aria-hidden': 'true' } });

  function pintarBalance(ahora) {
    const datos = datosCircuito();
    const { inicio, fin, dias } = rango(periodo, ahora);
    const hastaAhora = fin > ahora;
    const prod = sumarEntre(datos.produccion, 'aceite', inicio, fin);
    const desp = sumarEntre(datos.despachosAceite, 'litros', inicio, fin);
    const stockInicio = stockEn(datos, inicio - 1);
    const stockFin = stockEn(datos, hastaAhora ? ahora : fin - 1);
    const ajuste = stockFin - (stockInicio + prod.total - desp.total);

    $('#ac-periodo-rango').textContent = `${ddmm(inicio)} al ${hastaAhora ? 'hoy' : ddmm(fin - 1)}`;

    const L = (v) => fmt.litros(v);
    const partes = [
      tarjetaBalance('Había', L(stockInicio), `al ${ddmm(inicio)} a las 00:00`),
      operador('+'),
      tarjetaBalance('Producido', L(prod.total), `${prod.cantidad} cierre${prod.cantidad === 1 ? '' : 's'} de turno`, { color: 'var(--color-viz-producido)' }),
      operador('−'),
      tarjetaBalance('Despachado', L(desp.total), `${desp.cantidad} camión${desp.cantidad === 1 ? '' : 'es'} de aceite`, { color: 'var(--color-viz-despachado)' }),
    ];
    if (Math.abs(ajuste) >= 1) {
      // La diferencia sale de una medición cargada en el período, o de un despacho mayor
      // a lo que el cálculo tenía en ese tanque (el cálculo no puede bajar de 0).
      const huboMedicion = sumarEntre(datos.mediciones, 'id', inicio, fin).cantidad > 0;
      partes.push(operador(ajuste > 0 ? '+' : '−'), huboMedicion
        ? tarjetaBalance('Ajuste por medición', L(Math.abs(ajuste)), ajuste > 0 ? 'la medición dio más que el cálculo' : 'la medición dio menos que el cálculo')
        : tarjetaBalance('Diferencia de cálculo', L(Math.abs(ajuste)), 'un camión cargó más de lo calculado: conviene cargar una medición'));
    }
    partes.push(operador('='), tarjetaBalance('Queda en planta', L(stockFin), hastaAhora ? 'ahora' : `al ${ddmm(fin - 1)}`, { final: true }));
    partes.push(el('p', { className: 'sr-only', text: `Había ${L(stockInicio)}, se produjeron ${L(prod.total)}, se despacharon ${L(desp.total)} y quedan ${L(stockFin)}.` }));
    $('#ac-balance').replaceChildren(...partes);

    // Gráficos por día
    const categorias = dias.map((d) => ({ etiqueta: pad(new Date(d).getDate()), titulo: `${DIAS_SEMANA[new Date(d).getDay()]} ${ddmm(d)}` }));
    const porDia = (lista, campo) => dias.map((d) => sumarEntre(lista, campo, d, d + DIA).total);
    SoyaCore.graficos.columnas($('#ac-graf-diario'), {
      titulo: 'Aceite producido y despachado por día',
      categorias,
      unidad: 'L',
      series: [
        { nombre: 'Producido', color: 'var(--color-viz-producido)', valores: porDia(datos.produccion, 'aceite') },
        { nombre: 'Despachado', color: 'var(--color-viz-despachado)', valores: porDia(datos.despachosAceite, 'litros') },
      ],
    });
    SoyaCore.graficos.linea($('#ac-graf-stock'), {
      titulo: 'Aceite en planta al cierre de cada día',
      categorias,
      unidad: 'L',
      serie: { nombre: 'En planta', color: 'var(--color-viz-nivel)', valores: dias.map((d) => stockEn(datos, Math.min(d + DIA - 1, ahora))) },
    });
  }

  // ---------- Medición manual ----------
  let ultimoCalculo = null;
  let formTocado = false;
  let editor;

  const GRUPOS = [
    { clave: 'interiores', titulo: 'Interiores', nombres: () => cfg.interiores.nombres, capacidad: () => cfg.interiores.capacidad, activo: 'interiorActivo' },
    { clave: 'exteriores', titulo: 'Exteriores', nombres: () => cfg.exteriores.nombres, capacidad: () => cfg.exteriores.capacidad, activo: 'exteriorActivo' },
    { clave: 'grandes', titulo: 'Grandes', nombres: () => cfg.grandes.nombres, capacidad: () => cfg.grandes.capacidad, activo: null },
  ];

  function construirFormularioMedicion() {
    const cont = $('#med-campos');
    cont.replaceChildren(...GRUPOS.map((g) => {
      const inputs = g.nombres().map((n, i) => {
        const id = `med-${g.clave}-${i}`;
        return el('div', null, [
          el('label', { className: 'mb-1 block text-[11px] text-slate-400', text: n, attrs: { for: id } }),
          el('input', { className: 'field px-2 py-1.5 tabular-nums', attrs: { type: 'number', id, min: '0', max: String(g.capacidad() * 2), step: '1', inputmode: 'numeric', required: '' } }),
        ]);
      });
      const hijos = [
        el('legend', { className: 'mb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase', text: `${g.titulo} (litros)` }),
        el('div', { className: 'grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2' }, inputs),
      ];
      if (g.activo) {
        const id = `med-${g.activo}`;
        const select = el('select', { className: 'field px-2 py-1.5', attrs: { id } });
        fillSelect(select, g.nombres().map((n, i) => ({ value: String(i), label: n })));
        hijos.push(el('div', { className: 'mt-2' }, [
          el('label', { className: 'mb-1 block text-[11px] text-slate-400', text: 'Se está llenando', attrs: { for: id } }),
          select,
        ]));
      }
      return el('fieldset', null, hijos);
    }));
    cont.addEventListener('input', () => { formTocado = true; });
  }

  function cargarNivelesEnFormulario(fuente) {
    GRUPOS.forEach((g) => {
      g.nombres().forEach((_, i) => {
        // fuente puede ser el cálculo actual ({ litros }) o una medición guardada (números)
        const v = Array.isArray(fuente[g.clave]) ? fuente[g.clave][i] : 0;
        const litros = v && typeof v === 'object' ? v.litros : Number(v) || 0;
        $(`#med-${g.clave}-${i}`).value = Math.round(litros);
      });
    });
    $('#med-interiorActivo').value = String(fuente.interiorActivo ?? 0);
    $('#med-exteriorActivo').value = String(fuente.exteriorActivo ?? 0);
  }

  const leerGrupo = (g) => g.nombres().map((_, i) => Number($(`#med-${g.clave}-${i}`).value) || 0);
  const totalMedicion = (r) => ['interiores', 'exteriores', 'grandes'].reduce((s, k) => s + (r[k] || []).reduce((a, b) => a + (Number(b) || 0), 0), 0);

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.tanques = {
    init() {
      construir();
      construirFormularioMedicion();

      $$('#view-tanques [data-periodo]').forEach((b) => b.addEventListener('click', () => {
        periodo = b.dataset.periodo;
        $$('#view-tanques [data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        pintarBalance(Date.now());
      }));

      const tabla = tablaRegistros({
        tbody: $('#tbody-mediciones'),
        caption: $('#caption-mediciones'),
        coleccion: 'mediciones',
        columnas: [{ key: 'fecha' }, { key: 'interiores', format: (_, r) => fmt.entero(totalMedicion(r)), className: 'num' }],
        vacio: 'Sin mediciones cargadas.',
        onEditar: (r) => editor.editar(r),
      });
      editor = editorFormulario($('#form-medicion'), {
        tabla,
        rellenar: (r) => { cargarNivelesEnFormulario(r); formTocado = true; },
        alTerminar: () => { formTocado = false; if (ultimoCalculo) cargarNivelesEnFormulario(ultimoCalculo); },
      });

      $('#form-medicion').addEventListener('submit', (e) => {
        e.preventDefault();
        guardarRegistro('mediciones', editor, {
          interiores: leerGrupo(GRUPOS[0]),
          exteriores: leerGrupo(GRUPOS[1]),
          grandes: leerGrupo(GRUPOS[2]),
          interiorActivo: Number($('#med-interiorActivo').value),
          exteriorActivo: Number($('#med-exteriorActivo').value),
        }, { nuevo: 'Medición guardada. El circuito sigue desde estos niveles.' });
      });

      store.alCambiar((c) => {
        if (c === 'mediciones' || c === '*') tabla.dibujar();
        if (['produccion', 'despachosAceite', 'mediciones', '*'].includes(c)) pintar();
      });
      tabla.dibujar();
      pintar();
      // La cuenta regresiva del reposo y el "decantando hace…" avanzan solos.
      setInterval(() => { if (!$('#view-tanques').hidden) pintar(); }, 30000);
    },
    refresh: pintar,
  };
})(window.SoyaCore = window.SoyaCore || {});
