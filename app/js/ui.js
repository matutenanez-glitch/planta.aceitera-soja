/*
 * Utilidades de interfaz: formato de números y fechas, tablas, avisos,
 * descargas y portapapeles.
 *
 * Regla de seguridad: los datos que escribe el usuario se insertan SIEMPRE
 * con textContent (nunca con innerHTML), así un nombre como
 * "Pérez <Hnos> & Cía" se muestra tal cual y no se puede inyectar código.
 */
(function (SoyaCore) {
  'use strict';

  const { locale } = SoyaCore.config;
  const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Crea un elemento. `text` siempre se asigna como texto plano. */
  function el(tag, opts, children) {
    const node = document.createElement(tag);
    const o = opts || {};
    if (o.className) node.className = o.className;
    if (o.text != null) node.textContent = String(o.text);
    if (o.attrs) Object.entries(o.attrs).forEach(([k, v]) => node.setAttribute(k, v));
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  const fmt = {
    entero: (n) => nf0.format(Number(n) || 0),
    decimal1: (n) => nf1.format(Number(n) || 0),
    kg: (n) => nf0.format(Number(n) || 0) + ' kg',
    litros: (n) => nf0.format(Number(n) || 0) + ' Lts',
    toneladas: (kg) => nf1.format((Number(kg) || 0) / 1000) + ' tn',
    porcentaje: (n) => (n == null || n === '' || isNaN(n) ? '-' : nf1.format(Number(n)) + '%'),
  };

  /** Fecha y hora local como "AAAA-MM-DD HH:MM" (mismo formato que v2.8). */
  function ahora() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16).replace('T', ' ');
  }
  const hoy = () => ahora().slice(0, 10);

  /** Lee un <input type="number"> como número (NaN si está vacío). */
  const num = (input) => (input.value === '' ? NaN : Number(input.value));

  /**
   * Dibuja las últimas filas de una colección en un <tbody>.
   * columns: [{ key, format?, className? }]
   */
  function renderRows(tbody, rows, columns, opts) {
    const o = opts || {};
    const limit = o.limit || SoyaCore.config.filasPorTabla;
    const visibles = rows.slice(-limit).reverse();
    const frag = document.createDocumentFragment();

    if (visibles.length === 0) {
      frag.appendChild(el('tr', null, [el('td', { className: 'empty', text: o.empty || 'Sin registros todavía.', attrs: { colspan: columns.length } })]));
    }
    visibles.forEach((row) => {
      frag.appendChild(el('tr', null, columns.map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw, row) : raw;
        const td = el('td', { className: col.className || '', text: value == null || value === '' ? '-' : value });
        if (td.classList.contains('truncate')) td.title = td.textContent; // texto completo al pasar el mouse
        return td;
      })));
    });
    tbody.replaceChildren(frag);

    if (o.caption) {
      o.caption.textContent = rows.length > limit
        ? `Mostrando los últimos ${limit} de ${fmt.entero(rows.length)} registros.`
        : rows.length > 0 ? `${fmt.entero(rows.length)} registro(s).` : '';
    }
  }

  /** Llena un <select> con opciones [{ value, label }] o strings. */
  function fillSelect(select, options, selected) {
    const frag = document.createDocumentFragment();
    options.forEach((opt) => {
      const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const node = el('option', { text: o.label, attrs: { value: o.value } });
      if (o.value === selected) node.selected = true;
      frag.appendChild(node);
    });
    select.replaceChildren(frag);
  }

  /** Aviso flotante. type: 'info' | 'ok' | 'error' */
  function toast(msg, type) {
    const container = $('#toast-container');
    const node = el('div', { className: 'toast' + (type === 'error' ? ' toast-error' : type === 'ok' ? ' toast-ok' : ''), text: msg });
    container.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 300);
    }, type === 'error' ? 6000 : 3000);
  }

  /** Banner persistente en la parte superior del contenido. */
  function alerta(msg) {
    const box = el('div', { className: 'flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-900/20 p-4 text-sm text-red-200', attrs: { role: 'alert' } }, [
      el('i', { attrs: { 'data-lucide': 'triangle-alert' }, className: 'mt-0.5 h-4 w-4 text-red-400' }),
      el('p', { text: msg }),
    ]);
    $('#alertas').appendChild(box);
    SoyaCore.icons.render(box);
  }

  /** Descarga un archivo generado en memoria. */
  function descargar(nombre, contenido, mime) {
    const url = URL.createObjectURL(new Blob([contenido], { type: mime || 'application/octet-stream' }));
    const a = el('a', { attrs: { href: url, download: nombre } });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Copia texto al portapapeles (con alternativa para navegadores viejos). */
  async function copiar(texto, textarea) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (_) {
      if (!textarea) return false;
      textarea.select();
      return document.execCommand('copy');
    }
  }

  SoyaCore.ui = { $, $$, el, fmt, ahora, hoy, num, renderRows, fillSelect, toast, alerta, descargar, copiar };
})(window.SoyaCore = window.SoyaCore || {});
