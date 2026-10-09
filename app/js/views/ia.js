/*
 * Vista: Constructor de prompts R.C.T.F.R.I.
 * Arma el texto; no se conecta a ninguna IA (se copia y pega).
 */
(function (SoyaCore) {
  'use strict';

  const { $, $$, copiar, toast } = SoyaCore.ui;

  function armar() {
    $('#ia-output').value = $$('#form-ia [data-seccion]')
      .map((campo) => `[${campo.dataset.seccion}]\n${campo.value}`)
      .join('\n\n');
  }

  SoyaCore.views = SoyaCore.views || {};
  SoyaCore.views.ia = {
    init() {
      const form = $('#form-ia');
      form.addEventListener('input', armar);
      form.addEventListener('submit', (e) => e.preventDefault());
      $('#btn-copiar-prompt').addEventListener('click', async () => {
        const ok = await copiar($('#ia-output').value, $('#ia-output'));
        toast(ok ? '¡Prompt copiado al portapapeles!' : 'No se pudo copiar. Seleccioná el texto y usá Ctrl+C.', ok ? 'ok' : 'error');
      });
      armar();
    },
    refresh() {},
  };
})(window.SoyaCore = window.SoyaCore || {});
