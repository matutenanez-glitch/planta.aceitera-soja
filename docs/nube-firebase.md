# Copia en la nube con Firebase

La cuenta del dueño es **opcional**:

- **Sin cuenta**, la app funciona igual que siempre y todo queda en esa PC.
- **Con la cuenta del dueño**, todas las PCs de la planta guardan una copia en la nube y se comparten los datos:
  - Cada PC sigue guardando todo localmente, así que **funciona sin internet**.
  - Cuando hay conexión, cada PC sube lo que se cargó y baja lo que cargaron las otras. Lo hace sola: 3 segundos después de cada cambio, cada 2 minutos y cuando vuelve internet.
  - Si el mismo registro se cambió en dos PCs, queda el cambio más nuevo. Las reglas de Firestore no dejan pisar una versión con otra más vieja.
  - En la nube **no se borra nada**: lo que se borra en la app queda guardado como "borrado", con su contenido.

Hay **una sola cuenta por planta**, la del dueño:

- El dueño ingresa con esa cuenta una vez en cada PC de la planta.
- Los operarios no necesitan cuenta: cargan como siempre y todo se guarda en la cuenta del dueño.
- Para cerrar la sesión en una PC hay que escribir la contraseña del dueño, así nadie más puede desvincularla. Para confirmarla hace falta internet.

## Cómo está armado

| Parte | Dónde |
|---|---|
| Ingreso, creación de la cuenta y "olvidé mi contraseña" | Firebase Authentication (correo y contraseña) |
| Datos | Firestore: `usuarios/{uid}/{colección}/{id}` |
| Quién puede leer y escribir | `firebase/firestore.rules`: cada cuenta solo ve lo suyo |
| Código de la app | `app/js/nube.js` (sincronización) y `app/js/cuenta.js` (pantalla) |

La app habla con Firebase por su API REST, sin librerías externas. Por eso sigue funcionando sin internet y la política de seguridad (CSP) solo habilita los tres dominios de Firebase.

Cada documento de Firestore tiene:

- `datos`: el registro completo, en JSON;
- `borrado`: si se borró en la app;
- `modificado`: cuándo se cambió (hora de la PC, y siempre mayor que la versión anterior), para decidir cuál cambio es el más nuevo;
- `servidor`: hora del servidor, para bajar solo lo nuevo;
- `dispositivo`: qué PC lo subió.

## Poner en marcha el proyecto (una sola vez)

1. **Crear el proyecto.** Entrá a <https://console.firebase.google.com> con la cuenta de Google de la empresa, tocá **Agregar proyecto** y ponele un nombre (por ejemplo `gestion-aceitera`). Google Analytics no hace falta.
2. **Activar el ingreso con correo.** Andá a **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar**.
    - En **Authentication → Plantillas**, poné el idioma en **Español**: así el correo de "restablecer contraseña" llega en castellano.
3. **Crear la base de datos.** Andá a **Firestore Database → Crear base de datos**.
    - Elegí el **modo de producción**.
    - Elegí la ubicación `southamerica-east1` (San Pablo), que es la más cercana a Argentina. Después no se puede cambiar.
4. **Publicar las reglas.** En **Firestore → Reglas**, pegá el contenido de `firebase/firestore.rules` y tocá **Publicar**. También se pueden publicar con `firebase deploy --only firestore:rules`, usando `firebase.json`.
5. **Registrar la app.** Andá a **Configuración del proyecto → Tus apps → Web (`</>`)**, ponele un nombre y copiá estos dos datos:
    - `apiKey`;
    - `projectId`.
6. **Configurar la app.** Pegá esos dos datos en `app/js/config.js`, en `firebase: { apiKey: '...', projectId: '...' }`, y generá la versión nueva de la app.

   > La `apiKey` de Firebase **no es secreta**: identifica el proyecto. Lo que protege los datos son las reglas del paso 4.
7. **(Recomendado) Limitar la apiKey.** En Google Cloud Console, andá a **APIs y servicios → Credenciales**, elegí la clave y, en **Restricciones de API**, dejá solo estas tres:
    - Identity Toolkit API;
    - Token Service API;
    - Cloud Firestore API.

   No pongas restricción por sitio web: la app se abre como archivo y no tiene dominio.
8. **Probar.** Abrí la app y tocá **Copia en la nube** (abajo a la izquierda) → **Crear cuenta**. En Firestore tiene que aparecer `usuarios/<uid>/...` con los registros.

## Costos y backups

- **Plan Spark (gratis).** Alcanza para empezar con pocas plantas:
    - 1 GiB de datos;
    - 50.000 lecturas y 20.000 escrituras por día.

  Una planta carga del orden de decenas de registros por día. Como cada PC baja solo lo nuevo, el consumo es bajo.
- **Backups automáticos de Firestore.** Necesitan el plan **Blaze** (pago por uso). Se cobra el espacio que ocupan los backups y, si alguna vez se restaura uno, el tamaño del backup. Para programar uno diario que se guarde 14 semanas (el máximo), con la Firebase CLI:

  ```sh
  firebase firestore:backups:schedules:create --database '(default)' --recurrence 'DAILY' --retention 14w
  ```

  Con Blaze, conviene poner una **alerta de presupuesto** en Google Cloud (Facturación → Presupuestos y alertas).
- Además de la nube, **cada planta puede seguir haciendo su backup** en un archivo con el botón **Exportar**.

Fuentes:

- [Backups programados de Firestore](https://firebase.google.com/docs/firestore/backups): requieren Blaze y la retención máxima es de 14 semanas.
- [Planes de precios de Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Soporte a los clientes

- **Ver los datos de una planta:** en **Firestore → usuarios**, cada `uid` es una planta. El correo de cada `uid` está en **Authentication → Usuarios**.
- **Olvidó la contraseña:** desde la app, con **Olvidé mi contraseña**. También se puede mandar el correo desde **Authentication → Usuarios → ⋮ → Restablecer contraseña**.
- **Dar de baja una planta:** en **Authentication → Usuarios → Inhabilitar cuenta**. Sus PCs dejan de sincronizar, pero los datos quedan en sus PCs.
- **Recuperar algo que se borró:** en Firestore, el documento sigue estando, con `borrado = true` y el registro completo en `datos`.

## Cosas a tener en cuenta

- **Hora de las PCs.** Para saber cuál cambio es el más nuevo se usa la hora de cada PC. Un cambio hecho sobre un registro siempre queda más nuevo que la versión que la PC tenía, pero conviene que todas las PCs tengan la hora automática de Windows.
- **Primera vez en una PC.** Si la PC ya tenía datos cargados sin cuenta, se suman a la cuenta.
- **Cambio de cuenta.** Si una PC vinculada entra con otra cuenta, sus datos se reemplazan por los de esa cuenta, y los de la cuenta anterior quedan en su nube. Si quedan cambios sin subir de la cuenta anterior, la app no deja cambiar.
- **Importar un backup con la nube activa.** El backup reemplaza los datos en todas las PCs. La app lo avisa antes de importar.
- **Registros que no entran.** Un registro de más de 19.000 caracteres no se sube; la app lo avisa y sube el resto.
- **Quién puede crear cuentas.** Tal como queda configurado, cualquiera que tenga la app puede crear una cuenta, y cada cuenta solo ve sus datos. Para dar de alta las plantas ustedes mismos, desactivá en **Authentication → Configuración → Acciones del usuario** la opción de crear cuentas, y creá cada cuenta desde **Authentication → Usuarios → Agregar usuario**.
- **Cerrar sesión.** Los datos quedan en la PC y la app sigue anotando los cambios. Si se vuelve a entrar con la misma cuenta, se suben.
- **Privacidad.** Al guardar datos de los clientes en su nube, conviene tener términos de uso y una política de privacidad. En Argentina aplica la Ley 25.326 de Protección de Datos Personales; consultalo con un abogado antes de vender el servicio.
- **Primera prueba real.** Las pruebas automáticas usan un Firebase simulado. La primera vez que se conecte a un proyecto real, hay que probar crear la cuenta, cargar en dos PCs y cortar internet.
