/*
 * Pantalla de la cuenta del dueño y estado de la copia en la nube.
 * La lógica de la sincronización está en nube.js; acá solo se muestra y se
 * conectan los botones.
 */
(function (SoyaCore) {
  'use strict';

  const { $, toast } = SoyaCore.ui;
  const nube = SoyaCore.nube;
  const icons = SoyaCore.icons;

  let modo = 'ingresar'; // 'ingresar' | 'crear'

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function hace(ms) {
    if (!ms) return 'nunca';
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
    return new Date(ms).toLocaleString(SoyaCore.config.locale, { dateStyle: 'short', timeStyle: 'short' });
  }

  const ESTADOS = {
    noConfigurada: { texto: () => 'No configurada: solo en esta PC', color: 'text-slate-500', icono: 'cloud-off' },
    sinCuenta: { texto: (i) => (i.pendientes ? `Sin sesión · ${plural(i.pendientes, 'cambio', 'cambios')} sin subir` : 'Sin cuenta: solo en esta PC'), color: 'text-slate-500', icono: 'cloud-off' },
    sincronizando: { texto: () => 'Sincronizando…', color: 'text-sky-300', icono: 'refresh-cw' },
    alDia: { texto: (i) => `Al día · ${hace(i.ultima)}`, color: 'text-emerald-400', icono: 'cloud' },
    pendiente: { texto: (i) => `${plural(i.pendientes, 'cambio', 'cambios')} sin subir`, color: 'text-amber-400', icono: 'cloud' },
    sinConexion: { texto: (i) => `Sin conexión · ${plural(i.pendientes, 'cambio', 'cambios')} sin subir`, color: 'text-amber-400', icono: 'cloud-off' },
    error: { texto: () => 'Error al sincronizar', color: 'text-red-400', icono: 'cloud-off' },
  };

  function pintar() {
    const i = nube.info();
    const e = ESTADOS[i.estado] || ESTADOS.sinCuenta;

    // Panel de la barra lateral
    icons.swap($('#nube-icono'), e.icono);
    $('#nube-icono').setAttribute('class', 'lucide shrink-0 h-4 w-4 ' + e.color);
    $('#nube-titulo').textContent = i.email || 'Copia en la nube';
    $('#nube-estado').textContent = e.texto(i);
    $('#nube-estado').className = 'block truncate text-[10px] ' + e.color;
    $('#btn-cuenta').dataset.estado = i.estado;

    // Diálogo
    $('#cuenta-no-configurada').hidden = i.configurada;
    $('#cuenta-ingreso').hidden = !i.configurada || !!i.email;
    $('#cuenta-activa').hidden = !i.email;
    if (i.email) {
      $('#cuenta-usuario').textContent = i.email;
      $('#cuenta-estado').textContent = e.texto(i);
      $('#cuenta-estado').className = 'font-semibold ' + e.color;
      $('#cuenta-ultima').textContent = hace(i.ultima);
      $('#cuenta-pendientes').textContent = i.pendientes ? plural(i.pendientes, 'cambio', 'cambios') : 'nada';
      $('#cuenta-mensaje').hidden = !i.mensaje;
      $('#cuenta-mensaje').textContent = i.mensaje;
      $('#cuenta-sincronizar').disabled = i.estado === 'sincronizando';
    } else if (i.estado === 'error' && i.mensaje) {
      mostrarError(i.mensaje);
    }
    avisoVinculo();
  }

  function avisoVinculo() {
    const i = nube.info();
    const email = $('#cuenta-email').value.trim().toLowerCase();
    const otro = i.vinculo && email && email !== i.vinculo.toLowerCase();
    $('#cuenta-aviso-vinculo').hidden = !otro;
    $('#cuenta-aviso-vinculo').textContent = otro
      ? `Esta PC está vinculada a ${i.vinculo}. Si entrás con otra cuenta, los datos de esta PC se reemplazan por los de esa cuenta (los de ${i.vinculo} siguen guardados en su nube).`
      : '';
  }

  function mostrarError(texto) {
    $('#cuenta-error').hidden = !texto;
    $('#cuenta-error').textContent = texto || '';
  }

  function ponerModo(nuevo) {
    modo = nuevo;
    $('#cuenta-tab-ingresar').setAttribute('aria-selected', String(modo === 'ingresar'));
    $('#cuenta-tab-crear').setAttribute('aria-selected', String(modo === 'crear'));
    $('#cuenta-pass2-campo').hidden = modo !== 'crear';
    $('#cuenta-pass2').required = modo === 'crear';
    $('#cuenta-pass').autocomplete = modo === 'crear' ? 'new-password' : 'current-password';
    $('#cuenta-enviar').textContent = modo === 'crear' ? 'Crear cuenta' : 'Ingresar';
    $('#cuenta-olvide').hidden = modo === 'crear';
    mostrarError('');
  }

  async function ocupado(boton, texto, fn) {
    const antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = texto;
    try { return await fn(); } finally { boton.disabled = false; boton.textContent = antes; }
  }

  SoyaCore.cuenta = {
    init() {
      const dialogo = $('#cuenta-dialogo');
      $('#btn-cuenta').addEventListener('click', () => { pintar(); dialogo.showModal(); });
      $('#cuenta-cerrar').addEventListener('click', () => dialogo.close());
      dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); });
      $('#cuenta-tab-ingresar').addEventListener('click', () => ponerModo('ingresar'));
      $('#cuenta-tab-crear').addEventListener('click', () => ponerModo('crear'));
      $('#cuenta-email').addEventListener('input', avisoVinculo);

      $('#form-cuenta').addEventListener('submit', async (e) => {
        e.preventDefault();
        mostrarError('');
        const email = $('#cuenta-email').value.trim();
        const pass = $('#cuenta-pass').value;
        if (modo === 'crear' && pass !== $('#cuenta-pass2').value) {
          mostrarError('Las dos contraseñas no son iguales.');
          $('#cuenta-pass2').focus();
          return;
        }
        const crear = modo === 'crear';
        try {
          await ocupado($('#cuenta-enviar'), crear ? 'Creando la cuenta…' : 'Ingresando…', () => (crear ? nube.crearCuenta(email, pass) : nube.ingresar(email, pass)));
          $('#form-cuenta').reset();
          ponerModo('ingresar');
          toast(crear ? 'Cuenta creada. Esta PC ya guarda una copia en la nube.' : 'Listo: esta PC ya sincroniza con la cuenta.', 'ok');
          pintar();
        } catch (err) {
          mostrarError(err.message);
        }
      });

      $('#cuenta-olvide').addEventListener('click', async () => {
        const email = $('#cuenta-email').value.trim();
        if (!email) {
          mostrarError('Escribí el correo de la cuenta y volvé a tocar "Olvidé mi contraseña".');
          $('#cuenta-email').focus();
          return;
        }
        try {
          await nube.recuperar(email);
          mostrarError('');
          toast(`Te mandamos un correo a ${email} para cambiar la contraseña.`, 'ok');
        } catch (err) {
          mostrarError(err.message);
        }
      });

      $('#cuenta-sincronizar').addEventListener('click', () => nube.sincronizar());
      $('#cuenta-bajar-todo').addEventListener('click', () => nube.bajarTodo());
      // Cerrar sesión pide la contraseña del dueño: los operarios no pueden desvincular la PC.
      const formSalir = $('#cuenta-salir-form');
      const errorSalir = (texto) => { $('#cuenta-salir-error').hidden = !texto; $('#cuenta-salir-error').textContent = texto || ''; };
      $('#cuenta-salir').addEventListener('click', () => {
        const i = nube.info();
        $('#cuenta-salir-aviso').textContent = i.pendientes
          ? `Hay ${plural(i.pendientes, 'cambio', 'cambios')} sin subir: van a quedar en esta PC y se suben cuando vuelvas a ingresar. Para cerrar la sesión, escribí la contraseña del dueño.`
          : 'Los datos siguen en esta PC y en la nube. Para cerrar la sesión, escribí la contraseña del dueño.';
        errorSalir('');
        formSalir.reset();
        formSalir.hidden = false;
        $('#cuenta-salir-pass').focus();
      });
      $('#cuenta-salir-cancelar').addEventListener('click', () => { formSalir.hidden = true; });
      dialogo.addEventListener('close', () => { formSalir.hidden = true; formSalir.reset(); });
      formSalir.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorSalir('');
        try {
          await ocupado($('#cuenta-salir-confirmar'), 'Confirmando…', () => nube.salirConClave($('#cuenta-salir-pass').value));
          formSalir.hidden = true;
          formSalir.reset();
          toast('Sesión cerrada en esta PC.', 'info');
          pintar();
        } catch (err) {
          errorSalir(['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'OTRA_CUENTA'].includes(err.codigo)
            ? 'La contraseña no es correcta.'
            : err.codigo === 'SIN_CONEXION'
              ? 'Para cerrar la sesión hace falta internet: se confirma la contraseña del dueño.'
              : err.message);
        }
      });

      nube.alCambiar(pintar);
      SoyaCore.store.alCambiar(pintar);
      setInterval(pintar, 30000); // "hace N min"
      ponerModo('ingresar');
      pintar();
    },
  };
})(window.SoyaCore = window.SoyaCore || {});
