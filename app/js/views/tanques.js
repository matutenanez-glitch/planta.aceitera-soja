/*
 * Vista: Tanques de aceite.
 *
 * Los tanques se dibujan a partir de SoyaCore.config.tanques.
 * Nivel = suma de TODO el aceite producido, repartido en cascada:
 * interiores → exteriores → batería masiva (misma lógica que v2.8).
 * Ver README: todavía no se descuentan salidas de aceite.
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, fmt } = SoyaCore.ui;
  const store = SoyaCore.store;
  const cfg = SoyaCore.config.tanques;

  const ESTILOS = {
    interior: {
      cuerpo: 'relative h-32 w-16 overflow-hidden rounded-t rounded-b-3xl border-2 border-slate-600 bg-slate-900 shadow-inner',
      liquido: 'liquid-fill absolute bottom-0 w-full bg-linear-to-t from-brand-600 to-brand-400 opacity-90',
      valor: 'font-mono text-[10px] text-brand-400',
    },
    exterior: {
      cuerpo: 'relative h-32 w-14 overflow-hidden rounded-b-lg border-2 border-slate-500 bg-slate-900',
      liquido: 'liquid-fill absolute bottom-0 w-full bg-linear-to-t from-blue-700 to-brand-500 opacity-80',
      valor: 'font-mono text-[10px] text-blue-400',
    },
  };

  const medidores = []; // { nombre, capacidad, liquido, valor, cuerpo }

  function tanque(tipo, nombre, capacidad) {
    const e = ESTILOS[tipo];
    const liquido = el('div', { className: e.liquido });
    liquido.style.height = '0%';
    const cuerpo = el('div', { className: e.cuerpo, attrs: { role: 'meter', 'aria-label': nombre, 'aria-valuemin': '0', 'aria-valuemax': String(capacidad), 'aria-valuenow': '0' } }, [liquido]);
    const valor = el('span', { className: e.valor, text: '0 L' });
    medidores.push({ capacidad, liquido, valor, cuerpo });
    return el('div', { className: 'flex flex-col items-center' }, [
      cuerpo,
      el('span', { className: 'mt-3 text-xs font-bold text-slate-200', text: nombre }),
      valor,
      el('span', { className: 'text-[9px] text-slate-500', text: 'Máx: ' + fmt.entero(capacidad) + ' L' }),
    ]);
  }

  let masivo; // { liquido, valor, cuerpo, capacidad }

  function construir() {
    $('#tanques-interiores').replaceChildren(...cfg.interiores.nombres.map((n) => tanque('interior', n, cfg.interiores.capacidad)));
    $('#tanques-exteriores').replaceChildren(...cfg.exteriores.nombres.map((n) => tanque('exterior', n, cfg.exteriores.capacidad)));

    const capacidad = cfg.masivos.capacidadPorTanque * cfg.masivos.cantidad;
    const liquido = el('div', { className: 'liquid-fill w-full bg-linear-to-t from-purple-800 to-brand-600 opacity-70' });
    liquido.style.height = '0%';
    const divisores = Array.from({ length: cfg.masivos.cantidad - 1 }, () => el('div', { className: 'h-full w-px bg-slate-600/50' }));
    const nombre = `BATERÍA MASIVA (1-${cfg.masivos.cantidad})`;
    const cuerpo = el('div', { className: 'relative h-32 w-full overflow-hidden rounded-b-2xl border-2 border-slate-500 bg-slate-900', attrs: { role: 'meter', 'aria-label': nombre, 'aria-valuemin': '0', 'aria-valuemax': String(capacidad), 'aria-valuenow': '0' } }, [
      el('div', { className: 'absolute inset-0 flex flex-col justify-end' }, [liquido]),
      el('div', { className: 'pointer-events-none absolute inset-0 flex justify-evenly' }, divisores),
    ]);
    const valor = el('span', { className: 'mt-1 font-mono text-[11px] font-bold text-purple-400', text: '0 L' });
    masivo = { liquido, valor, cuerpo, capacidad };
    $('#tanques-masivos').replaceChildren(el('div', { className: 'flex w-full flex-col items-center px-4' }, [
      cuerpo,
      el('span', { className: 'mt-3 text-xs font-bold text-slate-200', text: nombre }),
      valor,
      el('span', { className: 'text-[9px] text-slate-500', text: 'Almacén Profundo' }),
    ]));

    $('#tanques-ruta').textContent =
      `Bateas ➔ Tanques Interiores (${cfg.interiores.decantacion}) ➔ Tanques Exteriores Estándar (${cfg.exteriores.nombres.length}) ➔ Tanques Masivos (${cfg.masivos.cantidad}).`;
  }

  function pintar(m, litros) {
    m.liquido.style.height = Math.min((litros / m.capacidad) * 100, 100) + '%';
    m.valor.textContent = fmt.entero(litros) + ' L';
    m.cuerpo.setAttribute('aria-valuenow', String(Math.round(litros)));
    m.cuerpo.setAttribute('aria-valuetext', `${fmt.entero(litros)} de ${fmt.entero(m.capacidad)} litros`);
  }

  function calcular() {
    let restante = store.todos('produccion').reduce((s, p) => s + (Number(p.aceite) || 0), 0);
    $('#total-oil-stock').textContent = fmt.litros(restante);

    medidores.forEach((m) => {
      const litros = Math.min(restante, m.capacidad);
      restante -= litros;
      pintar(m, litros);
    });
    pintar(masivo, Math.max(restante, 0)); // todo el sobrante va a la batería masiva
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.tanques = {
    init() {
      construir();
      store.alCambiar((c) => (c === 'produccion' || c === '*') && calcular());
      calcular();
    },
    refresh: calcular,
  };
})(window.SoyaCore = window.SoyaCore || {});
