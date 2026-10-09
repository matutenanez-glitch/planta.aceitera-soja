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

  /** "AAAA-MM-DD HH:MM" (hora local) → milisegundos. NaN si no se entiende. */
  function fechaMs(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texto || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
  }

  /** Lee un <input type="number"> como número (NaN si está vacío). */
  const num = (input) => (input.value === '' ? NaN : Number(input.value));

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

  /**
   * Aviso flotante. type: 'info' | 'ok' | 'error'
   * accion (opcional): { texto, fn } → agrega un botón, por ejemplo "Deshacer".
   */
  function toast(msg, type, accion) {
    const container = $('#toast-container');
    const node = el('div', { className: 'toast' + (type === 'error' ? ' toast-error' : type === 'ok' ? ' toast-ok' : '') }, [el('span', { text: msg })]);
    const cerrar = () => {
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 300);
    };
    if (accion) {
      const boton = el('button', { className: 'toast-accion', text: accion.texto, attrs: { type: 'button' } });
      boton.addEventListener('click', () => { cerrar(); accion.fn(); }, { once: true });
      node.appendChild(boton);
    }
    container.appendChild(node);
    setTimeout(cerrar, accion ? 8000 : type === 'error' ? 6000 : 3000);
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

  /**
   * Tabla de registros con botones Editar y Borrar en cada fila.
   *   coleccion  nombre en el store
   *   columnas   [{ key, format?, className? }] (como renderRows)
   *   onEditar   fn(registro) → normalmente editor.editar
   * Borrar pide confirmación con un segundo clic y ofrece "Deshacer".
   * Devuelve { dibujar(), marcar(id|null) }.
   */
  function tablaRegistros({ tbody, caption, coleccion, columnas, onEditar, vacio }) {
    const store = SoyaCore.store;
    let verTodos = false;
    let editandoId = null;

    function botonAccion(accion, icono, etiqueta, extra) {
      return el('button', {
        className: 'btn-icon' + (extra ? ' ' + extra : ''),
        attrs: { type: 'button', 'data-accion': accion, 'aria-label': etiqueta, title: etiqueta },
      }, [el('i', { attrs: { 'data-lucide': icono }, className: 'h-3.5 w-3.5' })]);
    }

    function dibujar() {
      const filas = store.todos(coleccion);
      const limite = verTodos ? filas.length || 1 : SoyaCore.config.filasPorTabla;
      const visibles = filas.slice(-limite).reverse();
      const frag = document.createDocumentFragment();
      if (visibles.length === 0) {
        frag.appendChild(el('tr', null, [el('td', { className: 'empty', text: vacio || 'Sin registros todavía.', attrs: { colspan: columnas.length + 1 } })]));
      }
      visibles.forEach((row) => {
        const celdas = columnas.map((col) => {
          const raw = row[col.key];
          const value = col.format ? col.format(raw, row) : raw;
          const td = el('td', { className: col.className || '', text: value == null || value === '' ? '-' : value });
          if (td.classList.contains('truncate')) td.title = td.textContent;
          return td;
        });
        const quien = `registro del ${row.fecha}`;
        celdas.push(el('td', { className: 'acciones' }, [
          botonAccion('editar', 'pencil', 'Editar ' + quien),
          botonAccion('borrar', 'trash-2', 'Borrar ' + quien, 'btn-icon-borrar'),
        ]));
        const tr = el('tr', { attrs: { 'data-id': row.id } }, celdas);
        if (row.id === editandoId) tr.classList.add('fila-editando');
        frag.appendChild(tr);
      });
      tbody.replaceChildren(frag);
      SoyaCore.icons.render(tbody);

      if (caption) {
        const partes = [];
        if (filas.length > SoyaCore.config.filasPorTabla) {
          partes.push(el('span', { text: verTodos ? `Mostrando los ${fmt.entero(filas.length)} registros. ` : `Mostrando los últimos ${SoyaCore.config.filasPorTabla} de ${fmt.entero(filas.length)} registros. ` }));
          const toggle = el('button', { className: 'link-btn', text: verTodos ? 'Ver solo los últimos' : 'Ver todos', attrs: { type: 'button' } });
          toggle.addEventListener('click', () => { verTodos = !verTodos; dibujar(); });
          partes.push(toggle);
        } else if (filas.length > 0) {
          partes.push(el('span', { text: `${fmt.entero(filas.length)} registro(s).` }));
        }
        caption.replaceChildren(...partes);
      }
    }

    tbody.addEventListener('click', (e) => {
      const boton = e.target.closest('button[data-accion]');
      if (!boton) return;
      const id = boton.closest('tr').dataset.id;

      if (boton.dataset.accion === 'editar') {
        const registro = store.buscar(coleccion, id);
        if (registro) onEditar(registro);
        return;
      }

      // Borrar: el primer clic pide confirmación, el segundo borra.
      if (!boton.classList.contains('confirmar')) {
        boton.classList.add('confirmar');
        boton.replaceChildren(document.createTextNode('¿Borrar?'));
        boton.setAttribute('aria-label', 'Confirmar borrado');
        setTimeout(() => boton.isConnected && dibujar(), 4000);
        return;
      }
      const borrado = store.borrar(coleccion, id);
      if (!borrado) return;
      toast('Registro borrado.', 'info', {
        texto: 'Deshacer',
        fn: () => store.restaurar(coleccion, borrado) && toast('Registro restaurado.', 'ok'),
      });
    });

    return {
      dibujar,
      marcar(id) { editandoId = id; dibujar(); },
    };
  }

  /**
   * Pone un formulario en "modo edición": carga el registro, muestra la
   * fecha, cambia el botón a "Guardar cambios" y muestra "Cancelar".
   *   rellenar(registro)  carga los valores en los campos (propio de cada vista)
   *   alTerminar()        se llama al guardar o cancelar (para limpiar extras)
   *   tabla               la tablaRegistros, para resaltar la fila
   * El formulario necesita: [data-form-titulo], [data-campo-fecha] con un
   * <input type="datetime-local">, el botón submit y un botón [data-cancelar].
   */
  function editorFormulario(form, { rellenar, alTerminar, tabla }) {
    const panel = form.closest('.glass-panel');
    const titulo = panel.querySelector('[data-form-titulo]');
    const tituloNuevo = titulo ? titulo.textContent : '';
    const submit = form.querySelector('button[type="submit"]');
    const textoNuevo = submit.textContent.trim();
    const cancelar = form.querySelector('[data-cancelar]');
    const campoFecha = form.querySelector('[data-campo-fecha]');
    const inputFecha = campoFecha ? campoFecha.querySelector('input') : null;
    let id = null;

    function terminar() {
      id = null;
      form.reset();
      if (campoFecha) { campoFecha.hidden = true; inputFecha.required = false; }
      submit.textContent = textoNuevo;
      cancelar.hidden = true;
      if (titulo) titulo.textContent = tituloNuevo;
      panel.classList.remove('editando');
      if (tabla) tabla.marcar(null);
      if (alTerminar) alTerminar();
    }

    function editar(registro) {
      terminar();
      id = registro.id;
      rellenar(registro);
      if (campoFecha) {
        campoFecha.hidden = false;
        inputFecha.required = true;
        inputFecha.value = String(registro.fecha).replace(' ', 'T').slice(0, 16);
      }
      submit.textContent = 'Guardar cambios';
      cancelar.hidden = false;
      if (titulo) titulo.textContent = `Editando el registro del ${registro.fecha}`;
      panel.classList.add('editando');
      if (tabla) tabla.marcar(id);
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const primero = form.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
      if (primero) primero.focus({ preventScroll: true });
    }

    cancelar.addEventListener('click', terminar);

    return {
      get id() { return id; },
      editar,
      terminar,
      /** Fecha elegida en modo edición ("AAAA-MM-DD HH:MM"), o null si es un registro nuevo. */
      fecha: () => (id && inputFecha && inputFecha.value ? inputFecha.value.replace('T', ' ').slice(0, 16) : null),
    };
  }

  /**
   * Guarda lo que tiene un formulario: si está editando, actualiza; si no, agrega.
   * Devuelve el registro guardado o null.
   */
  function guardarRegistro(coleccion, editor, datos, mensajes) {
    const store = SoyaCore.store;
    const editando = editor.id;
    const guardado = editando
      ? store.actualizar(coleccion, editando, Object.assign({}, datos, { fecha: editor.fecha() }))
      : store.agregar(coleccion, Object.assign({ fecha: ahora() }, datos));
    if (!guardado) return null;
    editor.terminar();
    toast(editando ? 'Cambios guardados.' : mensajes.nuevo, 'ok');
    return guardado;
  }

  SoyaCore.ui = { $, $$, el, fmt, ahora, hoy, fechaMs, num, fillSelect, toast, alerta, descargar, tablaRegistros, editorFormulario, guardarRegistro };
})(window.SoyaCore = window.SoyaCore || {});
