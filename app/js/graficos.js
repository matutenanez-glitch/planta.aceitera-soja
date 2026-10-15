/*
 * Gráficos simples en SVG, sin librerías (la app funciona sin internet).
 *
 *   SoyaCore.graficos.columnas(contenedor, { categorias, series, unidad, alto })
 *   SoyaCore.graficos.linea(contenedor,    { categorias, serie,  unidad, alto })
 *
 * categorias: [{ etiqueta: '08', titulo: 'Mié 08/10' }]
 * series:     [{ nombre: 'Producido', color: 'var(--color-viz-producido)', valores: [..] }]
 *
 * Reglas de diseño: columnas finas (máx. 24 px) con la punta redondeada,
 * grilla tenue, una sola escala, leyenda cuando hay 2 o más series y un
 * tooltip por día (con mouse o con teclado). Los textos se insertan siempre
 * con textContent.
 */
(function (SoyaCore) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const { el, fmt } = SoyaCore.ui;

  function s(tag, attrs, hijos) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      // Los colores vienen como variables CSS: se aplican por estilo (funciona en todos los navegadores).
      if ((k === 'fill' || k === 'stroke') && String(v).startsWith('var(')) n.style.setProperty(k, v);
      else n.setAttribute(k, v);
    });
    (hijos || []).forEach((h) => h && n.appendChild(h));
    return n;
  }
  function texto(attrs, contenido) {
    const t = s('text', attrs);
    t.textContent = contenido;
    return t;
  }

  /** Escala con números redondos: 0, 2.000, 4.000… */
  function escala(max) {
    if (!(max > 0)) return { max: 1, ticks: [0] };
    const crudo = max / 4;
    const p = 10 ** Math.floor(Math.log10(crudo));
    const f = crudo / p;
    const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    const tope = Math.ceil(max / paso) * paso;
    const ticks = [];
    for (let v = 0; v <= tope + paso / 2; v += paso) ticks.push(v);
    return { max: tope, ticks };
  }

  /** Columna con punta redondeada (4 px) y base recta. */
  function columna(x, y, w, h, color) {
    const r = Math.min(4, w / 2, h);
    const d = `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    return s('path', { d, fill: color });
  }

  function leyenda(series) {
    return el('div', { className: 'mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400' }, series.map((se) => {
      const muestra = el('span', { className: 'inline-block h-2.5 w-2.5 rounded-sm' });
      muestra.style.background = se.color;
      return el('span', { className: 'flex items-center gap-2' }, [muestra, el('span', { text: se.nombre })]);
    }));
  }

  function crearTooltip(cont) {
    const tip = el('div', { className: 'viz-tooltip', attrs: { role: 'presentation' } });
    tip.hidden = true;
    cont.appendChild(tip);
    return {
      mostrar(titulo, filas, xCentro) {
        tip.replaceChildren(
          el('p', { className: 'mb-1.5 text-[11px] font-semibold text-slate-400', text: titulo }),
          ...filas.map((f) => {
            const clave = el('span', { className: 'inline-block h-0.5 w-3 rounded-full' });
            clave.style.background = f.color;
            return el('p', { className: 'flex items-center gap-2 text-xs' }, [
              clave,
              el('span', { className: 'font-semibold text-white tabular-nums', text: f.valor }),
              el('span', { className: 'text-slate-400', text: f.nombre }),
            ]);
          }),
        );
        tip.hidden = false;
        const ancho = cont.clientWidth;
        const w = tip.offsetWidth;
        tip.style.left = Math.min(Math.max(xCentro - w / 2, 0), ancho - w) + 'px';
      },
      ocultar() { tip.hidden = true; },
    };
  }

  /** Re-dibuja cuando cambia el ancho del contenedor (por ejemplo, al mostrar la vista). */
  function alCambiarAncho(cont, dibujar) {
    if (cont._viz) cont._viz.disconnect();
    let ultimo = cont.clientWidth;
    const obs = new ResizeObserver(() => {
      if (cont.clientWidth > 0 && Math.abs(cont.clientWidth - ultimo) > 4) {
        ultimo = cont.clientWidth;
        dibujar();
      }
    });
    obs.observe(cont);
    cont._viz = obs;
  }

  function vacio(cont, mensaje) {
    cont.replaceChildren(el('p', { className: 'flex h-40 items-center justify-center text-sm text-slate-500 italic', text: mensaje || 'Sin datos en este período.' }));
  }

  // ------------------------------------------------------------------
  function columnas(cont, opts) {
    const dibujar = () => {
      const { categorias, series, unidad = '', alto = 200 } = opts;
      const valores = series.flatMap((se) => se.valores);
      if (!valores.some((v) => v > 0)) { vacio(cont, opts.vacio); return; }

      const W = Math.max(cont.clientWidth, 320);
      const m = { izq: 60, der: 8, arr: 8, aba: 26 };
      const pw = W - m.izq - m.der;
      const n = categorias.length;
      const banda = pw / n;
      const ns = series.length;
      const ancho = Math.min(24, Math.max((banda * 0.72 - (ns - 1) * 2) / ns, 2));
      const grupo = ancho * ns + (ns - 1) * 2;
      const { max, ticks } = escala(Math.max(...valores));
      const Y = (v) => m.arr + alto - (v / max) * alto;
      const fmtV = (v) => fmt.entero(v) + (unidad ? ' ' + unidad : '');

      const svg = s('svg', { viewBox: `0 0 ${W} ${alto + m.arr + m.aba}`, width: W, height: alto + m.arr + m.aba, class: 'block overflow-visible', role: 'img', 'aria-label': opts.titulo || series.map((se) => se.nombre).join(' y ') });
      // grilla y eje Y
      ticks.forEach((tk) => {
        svg.appendChild(s('line', { x1: m.izq, x2: W - m.der, y1: Y(tk), y2: Y(tk), class: tk === 0 ? 'viz-base' : 'viz-grilla' }));
        svg.appendChild(texto({ x: m.izq - 8, y: Y(tk) + 3.5, 'text-anchor': 'end', class: 'viz-eje' }, fmt.entero(tk)));
      });
      // etiquetas X (se saltean si no entran)
      const cada = Math.max(1, Math.ceil(26 / banda));
      categorias.forEach((c, i) => {
        if (i % cada === 0 || i === n - 1) svg.appendChild(texto({ x: m.izq + banda * (i + 0.5), y: alto + m.arr + 17, 'text-anchor': 'middle', class: 'viz-eje' }, c.etiqueta));
      });

      const resaltado = s('rect', { x: 0, y: m.arr, width: banda, height: alto, class: 'viz-resaltado', visibility: 'hidden' });
      svg.appendChild(resaltado);
      // columnas
      categorias.forEach((_, i) => {
        const x0 = m.izq + banda * i + (banda - grupo) / 2;
        series.forEach((se, k) => {
          const v = se.valores[i] || 0;
          if (v <= 0) return;
          const h = Math.max(alto - (Y(v) - m.arr), 1);
          svg.appendChild(columna(x0 + k * (ancho + 2), Y(v), ancho, h, se.color));
        });
      });

      // áreas de interacción (más grandes que la columna) + tooltip
      const marco = el('div', { className: 'relative' }, [svg]);
      const tip = crearTooltip(marco);
      categorias.forEach((c, i) => {
        const filas = series.map((se) => ({ nombre: se.nombre, color: se.color, valor: fmtV(se.valores[i] || 0) }));
        const zona = s('rect', {
          x: m.izq + banda * i, y: m.arr, width: banda, height: alto, fill: 'transparent', tabindex: '0', class: 'viz-zona',
          'aria-label': `${c.titulo || c.etiqueta}: ${filas.map((f) => `${f.nombre} ${f.valor}`).join(', ')}`,
        });
        const entrar = () => {
          resaltado.setAttribute('x', m.izq + banda * i);
          resaltado.setAttribute('visibility', 'visible');
          tip.mostrar(c.titulo || c.etiqueta, filas, m.izq + banda * (i + 0.5));
          if (opts.alSeleccionar) zona.style.cursor = 'pointer';
        };
        const salir = () => { resaltado.setAttribute('visibility', 'hidden'); tip.ocultar(); };
        zona.addEventListener('pointerenter', entrar);
        zona.addEventListener('focus', entrar);
        zona.addEventListener('pointerleave', salir);
        zona.addEventListener('blur', salir);
        if (opts.alSeleccionar) {
          zona.addEventListener('click', () => opts.alSeleccionar(i));
          zona.addEventListener('keydown', (e) => { if (e.key === 'Enter') opts.alSeleccionar(i); });
        }
        svg.appendChild(zona);
      });

      cont.replaceChildren(...(series.length > 1 ? [leyenda(series)] : []), marco);
    };
    dibujar();
    alCambiarAncho(cont, dibujar);
  }

  // ------------------------------------------------------------------
  function linea(cont, opts) {
    const dibujar = () => {
      const { categorias, serie, unidad = '', alto = 160 } = opts;
      if (!serie.valores.some((v) => v > 0)) { vacio(cont, opts.vacio); return; }

      const W = Math.max(cont.clientWidth, 320);
      const m = { izq: 60, der: 70, arr: 12, aba: 26 };
      const pw = W - m.izq - m.der;
      const n = categorias.length;
      const banda = pw / n;
      const X = (i) => m.izq + banda * (i + 0.5);
      const { max, ticks } = escala(Math.max(...serie.valores));
      const Y = (v) => m.arr + alto - (v / max) * alto;
      const fmtV = (v) => fmt.entero(v) + (unidad ? ' ' + unidad : '');

      const svg = s('svg', { viewBox: `0 0 ${W} ${alto + m.arr + m.aba}`, width: W, height: alto + m.arr + m.aba, class: 'block overflow-visible', role: 'img', 'aria-label': opts.titulo || serie.nombre });
      ticks.forEach((tk) => {
        svg.appendChild(s('line', { x1: m.izq, x2: W - m.der, y1: Y(tk), y2: Y(tk), class: tk === 0 ? 'viz-base' : 'viz-grilla' }));
        svg.appendChild(texto({ x: m.izq - 8, y: Y(tk) + 3.5, 'text-anchor': 'end', class: 'viz-eje' }, fmt.entero(tk)));
      });
      const cada = Math.max(1, Math.ceil(26 / banda));
      categorias.forEach((c, i) => {
        if (i % cada === 0 || i === n - 1) svg.appendChild(texto({ x: X(i), y: alto + m.arr + 17, 'text-anchor': 'middle', class: 'viz-eje' }, c.etiqueta));
      });

      const puntos = serie.valores.map((v, i) => `${X(i)},${Y(v || 0)}`);
      svg.appendChild(s('path', { d: `M${X(0)},${Y(0)}L${puntos.join('L')}L${X(n - 1)},${Y(0)}Z`, fill: serie.color, 'fill-opacity': '0.1' }));
      svg.appendChild(s('path', { d: 'M' + puntos.join('L'), fill: 'none', stroke: serie.color, 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      // punto y valor final (etiqueta directa solo en el extremo)
      const ultimo = serie.valores[n - 1] || 0;
      svg.appendChild(s('circle', { cx: X(n - 1), cy: Y(ultimo), r: '4', fill: serie.color, class: 'viz-anillo' }));
      svg.appendChild(texto({ x: X(n - 1) + 9, y: Y(ultimo) + 4, class: 'viz-valor' }, fmtV(ultimo)));

      // cursor vertical + tooltip
      const guia = s('line', { x1: 0, x2: 0, y1: m.arr, y2: m.arr + alto, class: 'viz-guia', visibility: 'hidden' });
      const punto = s('circle', { r: '4', fill: serie.color, class: 'viz-anillo', visibility: 'hidden' });
      svg.appendChild(guia);
      svg.appendChild(punto);
      const marco = el('div', { className: 'relative' }, [svg]);
      const tip = crearTooltip(marco);
      categorias.forEach((c, i) => {
        const valor = fmtV(serie.valores[i] || 0);
        const zona = s('rect', { x: m.izq + banda * i, y: m.arr, width: banda, height: alto, fill: 'transparent', tabindex: '0', class: 'viz-zona', 'aria-label': `${c.titulo || c.etiqueta}: ${serie.nombre} ${valor}` });
        const entrar = () => {
          guia.setAttribute('x1', X(i)); guia.setAttribute('x2', X(i)); guia.setAttribute('visibility', 'visible');
          punto.setAttribute('cx', X(i)); punto.setAttribute('cy', Y(serie.valores[i] || 0)); punto.setAttribute('visibility', 'visible');
          tip.mostrar(c.titulo || c.etiqueta, [{ nombre: serie.nombre, color: serie.color, valor }], X(i));
        };
        const salir = () => { guia.setAttribute('visibility', 'hidden'); punto.setAttribute('visibility', 'hidden'); tip.ocultar(); };
        zona.addEventListener('pointerenter', entrar);
        zona.addEventListener('focus', entrar);
        zona.addEventListener('pointerleave', salir);
        zona.addEventListener('blur', salir);
        svg.appendChild(zona);
      });

      cont.replaceChildren(marco);
    };
    dibujar();
    alCambiarAncho(cont, dibujar);
  }

  SoyaCore.graficos = { columnas, linea };
})(window.SoyaCore = window.SoyaCore || {});
