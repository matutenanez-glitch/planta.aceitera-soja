/*
 * VERSIÓN DE PRUEBA: cartel en el encabezado, bienvenida, "Enviar sugerencia"
 * (por WhatsApp, correo o copiando el texto) y "Datos de prueba" (empezar de
 * cero o volver a cargar el ejemplo).
 *
 * Lo suma `scripts/empaquetar.mjs --prueba` al final. No forma parte de la app.
 * window.SoyaPrueba = { whatsapp, correo } lo arma el empaquetado (pueden ir vacíos:
 * entonces WhatsApp deja elegir el contacto y el correo deja escribir la dirección).
 */
(function (SoyaCore) {
  'use strict';

  const { $, el, toast } = SoyaCore.ui;
  const cfg = window.SoyaPrueba || {};
  const version = SoyaCore.config.version;
  const icono = (nombre, clase) => el('i', { attrs: { 'data-lucide': nombre }, className: clase || 'h-3.5 w-3.5' });

  function abrirEnlace(url) {
    const a = el('a', { attrs: { href: url, target: '_blank', rel: 'noopener' } });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function dialogo(id, titulo, cuerpo, pie) {
    const cerrar = el('button', { className: 'btn-icon', attrs: { type: 'button', 'aria-label': 'Cerrar' } }, [icono('x', 'h-4 w-4')]);
    const d = el('dialog', { className: 'dialogo max-w-lg', attrs: { id, 'aria-labelledby': id + '-titulo' } }, [
      el('div', { className: 'flex items-start justify-between gap-4 border-b border-slate-800 p-5' }, [
        el('h3', { className: 'text-lg font-bold text-white', text: titulo, attrs: { id: id + '-titulo' } }),
        cerrar,
      ]),
      el('div', { className: 'space-y-3 p-5 text-sm text-slate-300' }, cuerpo),
      el('div', { className: 'flex flex-wrap justify-end gap-2 border-t border-slate-800 p-4' }, pie),
    ]);
    cerrar.addEventListener('click', () => d.close());
    d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); });
    document.body.appendChild(d);
    return d;
  }

  // ---------- Enviar sugerencia ----------
  const texto = el('textarea', { className: 'field', attrs: { id: 'prueba-sugerencia', rows: '5', maxlength: '2000', placeholder: 'Ej: En Recepción me gustaría ver también la patente en la lista. En Mantenimientos falta la bomba de…' } });
  const pantalla = el('p', { className: 'text-xs text-slate-500' });
  const mensaje = () => `Sugerencia para Gestión Aceitera (versión de prueba ${version})\nPantalla: ${$('#page-name').textContent}\n\n${texto.value.trim()}`;
  const conTexto = (fn) => () => {
    if (!texto.value.trim()) { texto.focus(); toast('Escribí primero qué cambiarías o agregarías.', 'aviso'); return; }
    fn();
  };
  const botonWhatsapp = el('button', { className: 'btn w-auto bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500', attrs: { type: 'button', id: 'prueba-whatsapp' } }, [icono('message-circle'), el('span', { text: 'WhatsApp' })]);
  const botonCorreo = el('button', { className: 'btn-cancelar py-2 text-sm', attrs: { type: 'button', id: 'prueba-correo' } }, [icono('mail'), el('span', { text: 'Correo' })]);
  const botonCopiar = el('button', { className: 'btn-cancelar py-2 text-sm', attrs: { type: 'button', id: 'prueba-copiar' } }, [icono('clipboard-list'), el('span', { text: 'Copiar' })]);
  const dSugerencia = dialogo('prueba-sug-dialogo', 'Enviar una sugerencia', [
    el('p', { text: 'Contanos qué cambiarías, qué falta o qué no se entiende. El mensaje lleva la pantalla en la que estás.' }),
    el('label', { className: 'sr-only', text: 'Sugerencia', attrs: { for: 'prueba-sugerencia' } }),
    texto,
    pantalla,
  ], [botonCopiar, botonCorreo, botonWhatsapp]);
  botonWhatsapp.addEventListener('click', conTexto(() => {
    abrirEnlace(`https://wa.me/${String(cfg.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(mensaje())}`);
    dSugerencia.close();
    toast('Se abrió WhatsApp con el mensaje listo. ¡Gracias!', 'ok');
  }));
  botonCorreo.addEventListener('click', conTexto(() => {
    abrirEnlace(`mailto:${encodeURIComponent(cfg.correo || '').replace(/%40/g, '@')}?subject=${encodeURIComponent('Sugerencia · Gestión Aceitera (prueba)')}&body=${encodeURIComponent(mensaje())}`);
    dSugerencia.close();
    toast('Se abrió el correo con el mensaje listo. ¡Gracias!', 'ok');
  }));
  botonCopiar.addEventListener('click', conTexto(async () => {
    try {
      await navigator.clipboard.writeText(mensaje());
      toast('Texto copiado: pegalo donde quieras mandarlo.', 'ok');
    } catch (_) {
      texto.select();
      toast('Seleccioné el texto: copialo con Ctrl+C.', 'info');
    }
  }));

  // ---------- Datos de prueba ----------
  /** Botón que pide un segundo toque para confirmar. */
  function confirmable(id, etiqueta, ayuda, fn) {
    const b = el('button', { className: 'btn-cancelar w-full justify-start py-2 text-left text-sm', attrs: { type: 'button', id } }, [el('span', { text: etiqueta })]);
    let armado = null;
    b.addEventListener('click', () => {
      if (armado) { clearTimeout(armado); fn(); return; }
      b.firstChild.textContent = 'Tocá de nuevo para confirmar';
      b.classList.add('border-red-500', 'text-red-300');
      armado = setTimeout(() => { armado = null; b.firstChild.textContent = etiqueta; b.classList.remove('border-red-500', 'text-red-300'); }, 4000);
    });
    return el('div', { className: 'space-y-1' }, [b, el('p', { className: 'text-xs text-slate-500', text: ayuda })]);
  }
  const reiniciar = (sinEjemplo) => {
    window.SoyaPrueba.borrarTodo();
    if (sinEjemplo) localStorage.setItem('soya_sin_ejemplo', '1');
    localStorage.setItem('soya_prueba_bienvenida', '1');
    location.reload();
  };
  const dDatos = dialogo('prueba-datos-dialogo', 'Datos de la versión de prueba', [
    el('p', { text: 'Todo lo que cargues en esta versión queda solo en esta PC y aparte de la versión final: no se mezcla.' }),
    confirmable('prueba-cero', 'Empezar de cero', 'Borra todo (también los ejemplos) para probar con datos propios.', () => reiniciar(true)),
    confirmable('prueba-ejemplo', 'Volver a cargar el ejemplo', 'Borra lo cargado y vuelve a poner los datos de ejemplo.', () => reiniciar(false)),
  ], []);

  // ---------- Bienvenida (la primera vez) ----------
  const entendido = el('button', { className: 'btn w-auto bg-brand-500 px-5 py-2 text-sm text-slate-900 hover:bg-brand-400', text: 'Empezar a probar', attrs: { type: 'button', autofocus: '' } });
  const dBienvenida = dialogo('prueba-bienvenida', 'Versión de prueba de Gestión Aceitera', [
    el('p', { text: 'Esta versión es para probar la app y decirnos qué cambiarías antes de la versión final.' }),
    el('ul', { className: 'list-disc space-y-1 pl-5' }, [
      el('li', { text: 'Ya trae datos de ejemplo (camiones, turnos, mantenimientos, stock) para recorrer todo.' }),
      el('li', { text: 'Podés cargar, corregir y borrar lo que quieras: nada de esto pasa a la versión final.' }),
      el('li', { text: 'Con "Sugerencia", arriba a la derecha, nos mandás lo que cambiarías desde la pantalla en la que estés.' }),
      el('li', { text: 'Con "Datos de prueba" podés empezar de cero o volver a cargar el ejemplo.' }),
    ]),
  ], [entendido]);
  entendido.addEventListener('click', () => dBienvenida.close());
  dBienvenida.addEventListener('close', () => localStorage.setItem('soya_prueba_bienvenida', '1'));

  // ---------- Encabezado ----------
  $('#app-version').textContent = `v${version} · prueba`;
  const header = document.querySelector('main > header');
  const pastilla = header.lastElementChild;
  const botonSug = el('button', { className: 'btn-sm', attrs: { type: 'button', id: 'prueba-sugerir' } }, [icono('send'), el('span', { text: 'Sugerencia' })]);
  const botonDatos = el('button', { className: 'btn-sm', attrs: { type: 'button', id: 'prueba-datos' } }, [icono('database'), el('span', { text: 'Datos de prueba' })]);
  header.appendChild(el('div', { className: 'flex items-center gap-2' }, [
    el('span', { className: 'chip chip-observaciones', text: 'Versión de prueba' }),
    botonSug,
    botonDatos,
    pastilla,
  ]));
  botonSug.addEventListener('click', () => {
    pantalla.textContent = `Pantalla: ${$('#page-name').textContent} · Versión ${version} (prueba)`;
    dSugerencia.showModal();
    texto.focus();
  });
  botonDatos.addEventListener('click', () => dDatos.showModal());
  document.title = 'Gestión Aceitera (prueba)';

  SoyaCore.icons.render(header);
  [dSugerencia, dDatos, dBienvenida].forEach((d) => SoyaCore.icons.render(d));
  if (!localStorage.getItem('soya_prueba_bienvenida')) dBienvenida.showModal();
})(window.SoyaCore = window.SoyaCore || {});
