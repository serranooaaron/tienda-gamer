# Desarrollo de Tienda Gamer

Qué tiene cada parte de la tienda, cómo funciona por dentro y por qué está hecha así. Lo más nuevo va primero.
Para instalar y ejecutar el proyecto, ver el [README](../readme.md).

## Mapa del proyecto

```
src/
  app.js                    Arma Express: cabeceras, rutas y vistas (sin abrir el puerto, para los tests)
  server.js                 Conecta la base, abre el puerto y apaga de forma ordenada
  models/                   Esquemas de Mongoose (producto, usuario, carrito, orden, token revocado)
  routes/                   API (/api/...) y vistas renderizadas en el servidor
  middlewares/              Sesión, permisos y cabeceras de seguridad
  services/orders.service.js  Checkout: convierte el carrito en una orden
  utils/                    Validación de entradas, límite de intentos, subida de imágenes
  data/                     Catálogo de ejemplo y funciones de seed
  views/                    Plantillas Handlebars
public/
  js/                       JavaScript del navegador y módulos compartidos con el servidor
  css/styles.css            Estilos con tokens de color en :root
test/                       Tests de integración con Mocha, Chai y Supertest sobre MongoDB en memoria
```

Un patrón que se repite: **los módulos que necesitan el servidor y el navegador viven en `public/js/`** y el servidor los importa desde ahí (`passwordPolicy.js`, `catalogSchema.js`). Así la regla que valida el servidor y la que guía al usuario en el formulario son el mismo código y no pueden quedar distintas. El servidor siempre vuelve a validar: lo del navegador es solo ayuda.

---

## Recuperar la contraseña por email y versión de sesión (25/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| `sessionVersion` en el usuario y `sv` en el token | `src/models/user.model.js`, `src/utils/auth.js` | Poder cerrar todas las sesiones de una cuenta de una vez |
| `currentAccount` en `attachUser` | `src/middlewares/auth.middleware.js` | Además de la firma y la revocación, compara la versión de sesión; el rol sale de la base |
| Colección `passwordresets` | `src/models/passwordReset.model.js` | Pedidos pendientes: usuario, **hash** del token y vencimiento (índice TTL) |
| `sendResetEmail`, `findValidReset`, `consumeReset`, `clearResets` | `src/utils/passwordReset.js` | Token de un solo uso que vence a los 30 minutos y email con el link |
| `mailer.send`, `appUrl`, `escapeHtml` | `src/utils/mailer.js` | Envío con la API de Brevo (con `fetch`, sin SDK); el dominio del link sale de `APP_URL` |
| `POST /api/sessions/forgot` y `POST /api/sessions/reset` | `src/routes/sessions.route.js` | Pedir el link y crear la contraseña nueva; `forgotLimiter` (3 por email y 10 por conexión, cada hora) |
| Páginas `/recuperar` y `/restablecer` | `forgot.handlebars`, `reset.handlebars`, `public/js/recover.js`, `styles.css` | Formularios y el link "¿Olvidaste tu contraseña?" en el login |
| Variables nuevas | `.env.example` | `APP_URL`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` |

### Cómo funciona

1. **El pedido.** `/recuperar` valida el email y lo cuenta en el límite.
   - **Responde siempre el mismo mensaje.**
   - Si la cuenta existe, envía el email **después de responder**, así ni el texto ni la demora revelan qué emails tienen cuenta.
2. **El token.** `sendResetEmail` borra los pedidos anteriores de la cuenta y genera 32 bytes aleatorios en `base64url`. En la base guarda solo su SHA-256, con vencimiento a los 30 minutos.
3. **El link.** Es `${APP_URL}/restablecer?token=…`. `/restablecer` responde con `Referrer-Policy: no-referrer` y muestra el formulario si el pedido sigue vigente; si no, ofrece pedir otro.
4. **La contraseña nueva.** `POST /api/sessions/reset`:
   - aplica la regla del registro;
   - recién entonces consume el token con `findOneAndDelete`;
   - guarda el hash nuevo y suma 1 a `sessionVersion` en el mismo `updateOne`;
   - borra los demás pedidos y limpia el bloqueo de login de esa cuenta.
5. **En cada pedido con sesión.** `attachUser`:
   - verifica la firma;
   - mira que el token no esté revocado (logout);
   - busca la cuenta (`role sessionVersion`) y compara la versión.
   Si la contraseña se recuperó después de firmar el token, o la cuenta ya no existe, la sesión se descarta. Los tokens sin `sv`, de antes de este cambio, cuentan como versión 0.

### Por qué

- **Recuperación sin el administrador:** quien olvida la contraseña prueba que es dueño del email y la cambia solo.
- **Dos mecanismos de sesión:**
  - la lista de tokens revocados sigue sirviendo para cerrar **una** sesión (logout);
  - la versión de sesión cierra **todas** de una vez, sin guardar cada token.
- **`APP_URL` y no el `Host` del pedido:** con el `Host`, alguien podría pedir el link de otra persona con `Host: sitio-falso.com` y robarle el token desde un email legítimo. Hay un test con `Host` y `X-Forwarded-Host` falsos.
- **Hash del token, misma respuesta y envío en segundo plano:** un backup de la base no sirve para usar links pendientes, y el formulario no sirve para averiguar qué emails tienen cuenta.
- **Validar antes de consumir:** una contraseña débil no gasta el link.
- **El rol se lee de la base:** como `attachUser` ya busca la cuenta, quitarle el rol de administrador a alguien corta su acceso en ese momento, no cuando vence su token de 24 horas.

### Límites conocidos

- Cada pedido con sesión hace una consulta más, por `_id`, que es el índice principal.
- El límite de pedidos vive en la memoria del proceso.
- Si Brevo falla, la persona ve el mismo mensaje y el error queda en el log.
- Sin dominio propio, los emails pueden llegar a spam.
- Todavía no hay "cambiar contraseña" desde un perfil en la tienda (la biblioteca sí lo tiene).

### Tests

En `test/passwordReset.test.js` (10 tests). Ninguno llama a Brevo.

- Pedido:
  - misma respuesta con y sin cuenta;
  - hash en la base;
  - `Host` falso.
- Validación del email y límite de pedidos.
- Restablecer:
  - cierra la sesión de los dos dispositivos;
  - la contraseña vieja deja de servir;
  - el link no sirve dos veces;
  - pedir otro link anula el anterior;
  - un link vencido no sirve;
  - una contraseña débil no gasta el link.
- Ataques: tokens inventados u operadores, y dos usos simultáneos (gana uno).
- El email escapa el nombre.
- Quitar el rol de administrador corta el acceso al panel.
- El login ofrece recuperar la contraseña.

---

## Pago con Mercado Pago, parte 1: Checkout Pro y vuelta verificada (25/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| `status` y `payment` en la orden | `src/models/order.model.js` | La orden nace "pendiente" y guarda los datos del pago tal como los informa Mercado Pago |
| Cliente de la API | `src/services/mercadoPago.js` | `createPreference` y `getPayment` con el `fetch` de Node, sin SDK; `PaymentError`; `paymentsConfigured()` |
| `startPayment` | `src/services/payments.service.js` | Arma la preferencia con los productos y precios de la orden guardada |
| `confirmPayment` | mismo archivo | Consulta el pago real y actualiza la orden con una transición condicional |
| `POST /api/orders/:oid/pay` | `src/routes/orders.route.js` | Devuelve la dirección de Checkout Pro de una orden propia y pendiente |
| `GET /orders/:oid/pago` | `src/routes/views.route.js` | Vuelta desde Mercado Pago: confirma y redirige al detalle |
| `paymentState(order)` | mismo archivo | Etiqueta y mensaje de cada estado: pendiente, pago en proceso, rechazado, pagada, demostración |
| Pantallas | `checkout.handlebars`, `orderDetail.handlebars`, `orders.handlebars`, `public/js/checkout.js` | "Pagar con Mercado Pago", el estado en "Mis compras" y reintento desde el detalle |

### Cómo funciona

1. **"Pagar con Mercado Pago" en el checkout.**
   - `POST /api/orders` crea la orden como antes: reserva el stock y vacía el carrito, ahora con `status: "pendiente"`.
   - Después, `POST /api/orders/:oid/pay` crea la preferencia y el navegador va a `init_point`.
   - Si Mercado Pago no responde, la orden queda pendiente y el comprador va a su detalle, donde puede volver a intentarlo.
2. **La preferencia.**
   - Un ítem por línea de la orden, con `unit_price` y `quantity` de la orden guardada y `currency_id: "ARS"`.
   - `external_reference` es el id de la orden.
   - Las tres `back_urls` apuntan a `/orders/:oid/pago`.
   - `auto_return: "approved"` solo con https, porque Mercado Pago no vuelve solo a un sitio http y no acepta `localhost`.
   - El id de la preferencia queda en la orden.
3. **La vuelta.** De la URL solo se usa `payment_id`, y solo si son dígitos. `confirmPayment` consulta `GET /v1/payments/:id` y comprueba:
   - que `external_reference` sea esta orden;
   - que, si está aprobado, `transaction_amount` sea igual al total de la orden.
   Después guarda id, estado, detalle y medio de pago.
4. **Solo `approved` pasa la orden a "pagada".**
   - `rejected` la deja pendiente con el aviso "Pago rechazado" y el botón para reintentar.
   - `pending` e `in_process` la dejan como "Pago en proceso".
   - La actualización es `updateOne({ _id, status: "pendiente" }, …)`: si ya estaba pagada, no se toca.
5. **Redirección final.** La vuelta redirige con 303 a `/orders/:oid?pago=1`. Recargar el detalle no vuelve a consultar ni a escribir. El aviso sale del estado guardado, no de la URL.

### Por qué

- **Precios de la base:** el navegador no manda precios ni totales. Aunque el precio del producto cambie después de comprar, se cobra lo que quedó en la orden (hay un test que lo comprueba).
- **No confiar en la URL de vuelta:** cualquiera puede escribir `?status=approved`. Solo cuenta lo que responde la API con el token de la tienda, y además el pago tiene que ser de esta orden y por su total.
- **Transición condicional:** dos vueltas simultáneas, o un aviso viejo de "rechazado" que llega tarde, no deshacen una orden pagada. Es la misma idea que el descuento de stock atómico del checkout.
- **Sin SDK:** son dos llamadas HTTP. El `fetch` de Node 24 alcanza, con tiempo límite de 10 s y `X-Idempotency-Key` en los POST. Una dependencia menos para auditar.
- **Token solo en el servidor:** sale de `MP_ACCESS_TOKEN`, nunca llega al navegador ni a los logs. Los errores de la API se registran sin el token y al comprador le llega un mensaje genérico.
- **Sin token, la tienda sigue funcionando:** no muestra el botón de pago y la API responde 503 "Los pagos no están configurados".
- **Compras anteriores:** no tienen `status`. Se muestran como "Demostración" y no se pueden pagar.

### Límites conocidos (parte 2)

- No hay webhook todavía. Si el comprador cierra la pestaña después de pagar y no vuelve, la orden queda pendiente hasta que entre a su detalle por la vuelta. La parte 2 suma la notificación con firma verificada.
- El stock reservado de una orden que nunca se paga no vuelve solo. La parte 2 lo devuelve cuando el pago se rechaza en forma definitiva o la orden vence.
- La vuelta automática (`auto_return`) solo funciona en el sitio publicado con https. En desarrollo se usa el botón "Volver al sitio" o se arma la URL de vuelta a mano.

### Tests

En `test/payments.test.js` (11 tests). Ninguno llama a Mercado Pago: se reemplazan `createPreference` y `getPayment` del cliente.

- La orden nace pendiente.
- La preferencia usa los precios guardados aunque el producto cambie de precio.
- Pagar: solo el dueño y solo una orden pendiente; sin token, 503.
- Vuelta aprobada → pagada, ignorando lo que dice la URL.
- Una URL sin `payment_id` válido no cambia nada.
- Se rechaza un pago de otra orden o por otro monto.
- Pago rechazado y en proceso → la orden sigue pendiente, con su aviso.
- Doble vuelta y aviso tardío no deshacen el pago.
- Nadie confirma una orden ajena.
- Las compras viejas se ven como demostración.

En el navegador, con la cuenta vendedora de prueba: el checkout de Mercado Pago abrió con el total de la orden ($400). Para completar el pago, Mercado Pago exige una cuenta compradora de prueba ("Una de las partes con la que intentás hacer el pago es de prueba").

---

## Recomendaciones por intereses (25/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| Cookie `tg_intereses` | `src/utils/interests.js` | Guarda en el navegador qué categorías y marcas mira cada visitante, sin datos personales |
| `readInterests(req)` | mismo archivo | Lee la cookie y descarta todo lo que no sea una categoría o marca del catálogo |
| `recordInterest(req, res, { category, brand })` | mismo archivo | Suma una visita y reescribe la cookie (30 días) |
| `clearInterests(res)` y `topInterest(interests)` | mismo archivo | Borrar la cookie; elegir la categoría más vista |
| `isVisitor(req)` | `src/routes/views.route.js` | Ni el administrador ni los bots cuentan como visitantes (lo comparte con el contador de vistas) |
| `pickRecommended(interest, excludeId)` | mismo archivo | Hasta 4 productos de la categoría más vista, primero los de las marcas más vistas |
| `POST /intereses/olvidar` | mismo archivo | Borra la cookie y vuelve al inicio con una confirmación |
| Sección "Porque viste …" | `src/views/index.handlebars`, `public/css/styles.css` | Productos recomendados, aviso de qué se guarda y botón "Olvidar lo que miré" |
| "Lo más visto" en el panel | `src/views/admin.handlebars` y ruta `/admin` | Top 5 de productos, categorías y marcas por vistas |

### Cómo funciona

1. **Qué cuenta como interés.** Ver la página de un producto suma su categoría y su marca. Entrar a la primera página de una categoría suma la categoría. En los dos casos, solo si es un visitante real.
2. **La cookie.**
   - Formato: `teclados~3|mouse~1/Razer~2|Cooler Master~1`. A la izquierda de `/` van las categorías y a la derecha las marcas, cada una con su cantidad.
   - Ningún nombre del catálogo usa `|`, `~` ni `/`, así que no hace falta escapar nada.
   - Guarda hasta 5 categorías y 10 marcas, las más vistas. Cada cantidad tiene un tope de 99.
   - Opciones: `HttpOnly`, `SameSite=Lax`, `Secure` en producción y 30 días de duración.
3. **Al leerla, `readInterests` la valida entera.**
   - Si es más larga que 600 caracteres o no es texto, se descarta.
   - Cada nombre tiene que existir en `CATEGORIES` (categorías) o en la lista de marcas, y cada cantidad tiene que ser un entero positivo.
   - Lo demás se ignora: `__proto__`, `<script>`, categorías inventadas y nombres repetidos.
4. **En el inicio**, `topInterest` elige la categoría más vista y `pickRecommended` trae hasta 24 productos a la venta de esa categoría, ordenados por vistas.
   - Los reordena poniendo primero los de las marcas que más mira el visitante, y se queda con 4.
   - No repite el producto de la imagen grande.
   - Si no hay ninguno, la sección no aparece.
5. **"Olvidar lo que miré"** es un formulario POST. El servidor borra la cookie (`clearCookie` con las mismas opciones) y redirige a `/?olvidado=1`, que muestra la confirmación sin recomendaciones.
   - En esa redirección la cookie vieja todavía viaja: por eso la página ignora las recomendaciones cuando trae `olvidado=1`.
6. **En el panel**, tres agregaciones suman las vistas por categoría y por marca, y una consulta trae los productos más vistos. Son totales de la tienda, armados con el contador de vistas que ya existía.

### Por qué

- **Una cookie en lugar de guardar en la base:** no hay que identificar al visitante ni tener cuentas para recomendar. Lo que se sabe de él vive solo en su navegador, vence sola a los 30 días y se borra con un botón.
- **Sin datos personales:** solo nombres de categorías y marcas del catálogo, que son públicos. Ni ids de producto, ni email, ni IP.
- **Validar todo al leer:** la cookie la escribe el servidor, pero cualquiera puede editarla. Como solo se aceptan nombres de una lista conocida, nada de la cookie llega a una consulta ni a la página sin pasar por esa lista.
- **`HttpOnly`:** el navegador no necesita leerla. Así un script inyectado tampoco puede leerla.
- **Olvidar con POST:** con un GET, cualquier imagen o link de otro sitio podría borrar los intereses. `SameSite=Lax` y el POST lo evitan.
- **No cuentan el administrador ni los bots:** si no, el administrador revisando la tienda y los buscadores llenarían las recomendaciones y las estadísticas.
- **Las estadísticas del panel son agregadas:** muestran qué interesa en la tienda, no qué miró cada persona. La API pública no expone nada de esto.

### Límites conocidos

- La recomendación usa la categoría más vista y no mezcla categorías.
- Si el visitante borra las cookies o cambia de navegador, empieza de cero.
- Las vistas por categoría y marca del panel suman las vistas de los productos actuales: si un producto cambia de categoría, sus vistas pasan con él.

### Tests

En `test/interests.test.js` (12 tests):

- Cookie:
  - solo acepta nombres del catálogo, con cantidades enteras y tope;
  - descarta `__proto__`, `<script>`, cantidades negativas o no numéricas y cookies largas o que no son texto;
  - se guarda con `HttpOnly`, `SameSite=Lax` y 30 días, sin el id del producto.
- Qué cuenta:
  - entrar a una categoría cuenta, pero no a una inventada;
  - el administrador y los bots no guardan nada.
- Inicio:
  - sin intereses no hay sección;
  - con intereses, la categoría más vista y primero las marcas más vistas;
  - no se repite el producto de la imagen grande;
  - "Olvidar" borra la cookie, confirma y deja de recomendar;
  - olvidar no responde a GET.
- Panel: lo más visto solo para el administrador.

---

## Importar productos desde JSON (25/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| `planImport(rows)` | `src/services/catalogImport.js` | Revisa cada fila y dice si se crea, se actualiza, no cambia o tiene un error, sin guardar nada |
| `applyImport(rows)` | mismo archivo | Vuelve a revisar todo y guarda con un solo `bulkWrite`, solo si no hay errores |
| `previewOf(plan)` | mismo archivo | Lo que ve el navegador: resumen y filas, sin los datos completos |
| `POST /api/products/import/preview` y `POST /api/products/import` | `src/routes/products.route.js` | Vista previa y confirmación, solo para administradores. Cuerpo `{ products: [...] }` |
| Límite propio de 1 MB | `src/app.js` | La importación recibe hasta 200 productos; el resto de la API sigue en 100 KB |
| Diálogo "Importar JSON" | `src/views/admin.handlebars`, `public/js/catalogImport.js`, `public/css/styles.css` | Plantilla por categoría, elegir archivo, vista previa y confirmar |
| Catálogo de ejemplo | `docs/catalogo-ejemplo.json` | 15 componentes y monitores con modelos reales, pausados y sin stock |

### Cómo funciona

1. **Leer cada fila.**
   - Cada fila tiene que ser un objeto.
   - Pasa por `pickProductFields`, la misma lista de campos permitidos que un alta, así que `_id`, `views`, `$set` y cualquier clave desconocida se ignoran. `featured` se descarta, porque el destacado se elige en el panel.
   - El código (`code`) es obligatorio y se pasa a mayúsculas, como lo guarda el modelo.
2. **Buscar lo que ya existe.** Dos consultas: los productos con esos códigos y los que ya usan esos nombres. Los dos campos tienen índice único.
   - Los `$in` se marcan con `mongoose.trusted`: son nuestros, con valores ya validados, y sin eso `sanitizeFilter` los trataría como texto literal.
3. **Revisar fila por fila, en orden:**
   - Código o nombre repetido dentro del archivo: "El código se repite en la fila 1".
   - Nombre que ya usa otro producto de la base.
   - En un producto nuevo, los campos obligatorios (`title`, `description`, `price`, `stock`, `category`).
   - Las reglas del catálogo (`applyCatalogRules`): tipo, marca y ficha de la categoría, combinando con lo guardado si el producto ya existe.
   - La validación del modelo (`validate()`), con los mensajes de Mongoose traducidos ("price: no puede ser menor que 0").
4. **Clasificar.** Si el código no existe, la fila se crea. Si existe, se comparan solo los campos que trae el archivo: si alguno cambia, se actualiza (y se listan los cambios); si no, queda "Sin cambios".
5. **Confirmar.** El servidor recalcula el plan. No usa el de la vista previa, porque la base pudo cambiar en el medio. Si hay alguna fila con error, responde 400 y no guarda nada. Si no, hace un solo `bulkWrite`:
   - `insertOne` para las altas, con los valores por defecto del modelo;
   - `updateOne` con `$set` de los campos del archivo para las actualizaciones.
6. **En el navegador.**
   - Lee el archivo, que puede pesar hasta 1 MB, y lo parsea. Si no es JSON muestra el error del parser.
   - Pide la vista previa y muestra el resumen y una fila por producto.
   - "Confirmar importación" queda desactivado si hay errores o si no hay nada para guardar.
7. **Plantilla.** Se arma en el navegador con `CATEGORIES`: un producto de ejemplo con todos los campos de la ficha y una clave `_ayuda` con las opciones de cada uno. La importación ignora esa clave.

### Por qué

- **Todo o nada:** con 50 filas y 3 errores, guardar 47 deja el catálogo a medias y obliga a buscar cuáles faltan. Es más simple corregir el archivo y volver a cargarlo, y la vista previa dice exactamente qué corregir.
- **Actualizar por código y solo lo que trae el archivo:** un archivo con `{ "code": "X", "price": 120 }` cambia el precio y nada más. Sirve para actualizar precios o stock en lote sin reescribir fichas.
- **Recalcular al confirmar:** la vista previa es informativa. Si el navegador enviara "lo que hay que hacer", alguien podría mandar un plan armado a mano.
- **Sin token de API:** la importación usa la sesión del administrador, que ya tiene cookie `HttpOnly`, límite de intentos y revocación. Un token aparte sería otro secreto para guardar y rotar.
- **Límite de 1 MB solo en esta ruta:** el parser general de 100 KB protege al resto de la API. El de importación va antes y el general no vuelve a leer un cuerpo ya leído.
- **El catálogo de ejemplo llega pausado y sin stock:** los precios son de referencia. Importarlo no publica nada hasta que alguien los revise y active cada producto en el panel. Solo trae los datos de ficha confirmados de cada modelo; lo dudoso queda vacío.

### Límites conocidos

- La importación no sube imágenes. `thumbnail` acepta una ruta `/image/...` ya subida o una dirección `https`; sin eso queda la imagen por defecto.
- Si dos administradores importan a la vez, el segundo puede chocar con un nombre que el primero acaba de crear. El índice único lo frena y responde 409, sin guardar duplicados.
- No se pueden borrar productos desde un archivo.

### Tests

En `test/import.test.js` (8 tests):

- Permisos: sin sesión 401 y cliente 403, y nada se guarda.
- La vista previa clasifica en crear, actualizar (con la lista de cambios) y sin cambios, sin guardar nada.
- Diez errores distintos, cada uno con su mensaje:
  - código repetido (sin distinguir mayúsculas);
  - marca de otra categoría;
  - ficha inválida;
  - nombre de otro producto;
  - precio negativo;
  - sin código, sin título y sin categoría;
  - fila que no es objeto.
- Rechazo de archivos que no son una lista, vacíos o de más de 200 productos.
- Operadores y campos no permitidos (`views`, `featured`, `_id`, `$set`) no llegan a la base.
- La confirmación crea y actualiza.
- Con una sola fila con error no se guarda nada.
- `docs/catalogo-ejemplo.json` se importa sin errores y queda pausado.

---

## Ficha técnica en el formulario del panel (25/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| Campos Tipo, Marca, Modelo y Garantía | `src/views/admin.handlebars` | Los datos del catálogo que antes solo se podían cargar por la API |
| Sección "Ficha técnica" | mismo archivo | Contenedor que el navegador llena según la categoría |
| `productCatalogFields(form)` | `public/js/productForm.js` | Arma tipo, marca y ficha desde `CATEGORIES`, los llena al editar y los lee al guardar |
| Validación antes de enviar | `public/js/admin.js` | Corre `checkCategoryFields` y `cleanSpecs`, las mismas funciones que el servidor |
| Estilos de la ficha | `public/css/styles.css` | Una sección (`<fieldset>`) por grupo de la ficha, en grilla que se adapta al ancho |

### Cómo funciona

1. Al abrir el formulario, `load(product)`:
   - llena los menús de Tipo y Marca con los de la categoría;
   - crea un control por campo de la ficha, agrupados en `<fieldset>` con su `<legend>`.
   Según el tipo del campo, el control es:
   - **`select`:** un menú con sus opciones y "—" para "sin dato".
   - **`boolean`:** un menú Sí / No / —, porque "no sé" no es lo mismo que "No".
   - **`number`:** texto con teclado decimal (`inputmode="decimal"`) que acepta coma, igual que el servidor. La unidad va en la etiqueta: "Peso (g)".
   - **`text`:** texto de hasta 80 caracteres.
2. Al cambiar la categoría, todo se rearma y se conservan los valores que existen en la nueva y siguen siendo válidos. Por ejemplo, "RGB" o "Conexión" al pasar de mouse a auriculares.
3. Al guardar, `read()` junta los valores no vacíos, convierte Sí/No en `true`/`false` y corre `checkCategoryFields` y `cleanSpecs`.
   - Si algo falla, el mensaje es el mismo que daría el servidor ("Peso: debe ser un número").
   - `markInvalid` marca ese campo con `aria-invalid="true"` y le pasa el foco.
4. Se envía la ficha completa. En una edición reemplaza a la anterior, así que un campo que se vacía se borra.

### Por qué

- **La definición del catálogo arma el formulario:** sumar un campo o una marca en `catalogSchema.js` lo agrega a la validación, a la página del producto, a los filtros y ahora también al panel, sin tocar HTML.
- **Validar en el navegador con el mismo código:** el error aparece al instante junto al campo y no puede ser distinto del que da la API. La API igual valida todo, porque el navegador se puede saltear.
- **Sí/No como menú y no como casilla:** una casilla sin marcar se lee como "No". Con el menú, "—" deja el dato vacío y no aparece en la tienda.
- **Números como texto con teclado decimal:** `type="number"` rechaza la coma en algunos navegadores con idioma inglés y muestra flechas que no sirven para un peso o una frecuencia.

### Límites conocidos

- Los campos de la ficha no se marcan como obligatorios: todo es opcional, como en el servidor.
- El error del servidor se muestra arriba del botón Guardar y no se ubica en un campo; solo los errores que se detectan en el navegador marcan el campo.

### Tests

- `test/views.test.js`: el panel tiene Tipo, Marca, Modelo, Garantía y el contenedor de la ficha.
- `test/catalog.test.js`: la API acepta lo que envía el formulario: números como texto con coma, Sí/No, tipo vacío (`null`) y garantía vacía.
- En el navegador:
  - alta de un monitor con marca, tipo, modelo, garantía y 7 campos;
  - error "Peso: debe ser un número" con el foco en el campo;
  - edición que carga todos los valores;
  - sin desbordes a 375 px;
  - contraste de los títulos de sección de 6,18:1.

---

## Filtros del catálogo (20/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| `filter: true` en 27 campos de la ficha | `public/js/catalogSchema.js` | Marca qué campos ofrece filtrar cada categoría (conexión, socket, panel, resolución, RGB…) |
| `filterFields(category)` | mismo archivo | Lista los campos filtrables de una categoría |
| `readCatalogFilters(query, category)` | `src/utils/catalogFilters.js` | Lee los filtros de la URL y descarta los que no son válidos |
| `filtersToMatch(filters, category, except)` | mismo archivo | Convierte los filtros elegidos en condiciones de Mongo |
| `catalogFacets(Product, base, filters, category)` | mismo archivo | Opciones de cada filtro con la cantidad de productos, en una sola consulta |
| `RESERVED_PARAMS` | mismo archivo | Parámetros que ya usa `/products`; un test impide que un campo filtrable se llame igual |
| Bloque "Filtros" y filtros aplicados | `src/views/home.handlebars`, `public/css/styles.css` | Un menú por filtro y un chip "Marca: Razer ✕" para quitar cada uno |
| Envío automático y URL limpia | `public/js/filters.js` | Aplica el filtro al elegirlo, saca los campos vacíos de la URL y pliega los filtros en celular |

### Cómo funciona

1. La URL lleva un parámetro por filtro, con nombre legible: `/products?category=mouse&brand=Razer&sub=inalambricos&connection=Bluetooth&rgb=si`.
   - `brand` es la marca y `sub` la subcategoría.
   - Los campos de la ficha usan su propia clave.
   - Los sí/no se escriben `si` y `no`.
2. `readCatalogFilters` arma, para la categoría elegida, la lista de filtros posibles con sus opciones, en el orden de la definición del catálogo. Se queda solo con los parámetros que son texto y coinciden exactamente con una opción.
   - Sin categoría, el único filtro es la marca, con la lista de todas las marcas.
3. La consulta se arma en dos partes:
   - **Base:** publicado, categoría, búsqueda y stock.
   - **Filtros:** `filtersToMatch` traduce cada uno al campo de Mongo que le corresponde (`brand`, `subcategory` o `specs.<clave>`) y al valor guardado (`true`/`false` para los sí/no).
   El listado paginado usa la base más los filtros.
4. `catalogFacets` corre una sola agregación: `$match` con la base y un `$facet` con una rama por filtro. Cada rama aplica **todos los filtros menos el suyo** y agrupa por su campo.
   - Así, con Razer elegida, el menú de marca sigue mostrando "Logitech (1)" para cambiar de una a otra.
   - Los demás menús cuentan solo dentro de Razer.
5. Al armar las opciones se descartan las que tienen 0 productos, salvo la elegida. También se oculta todo filtro con una sola opción, porque no ayuda a elegir, salvo que ya esté aplicado.
6. Los links mantienen los filtros: paginación, orden y quitar un filtro (que conserva los demás). Los chips de categoría los quitan, porque la marca o el socket de una categoría no tienen sentido en otra.
7. En el navegador, `filters.js` hace tres cosas:
   - Envía el formulario al cambiar un menú.
   - En el evento `formdata`, saca los campos vacíos para que la URL no quede llena de parámetros vacíos.
   - En pantallas de 640 px o menos, pliega el bloque `<details>` si no hay filtros aplicados.
   Sin JavaScript, los filtros quedan abiertos y se aplican con el botón "Buscar".

### Por qué

- **Formulario GET y no una API con JavaScript:** el resultado es una URL que se puede compartir, guardar o abrir en otra pestaña, y que el botón "atrás" respeta. Funciona sin JavaScript y lo indexan los buscadores.
- **Las claves de Mongo nunca vienen de la URL:** el nombre del campo consultado (`specs.connection`) sale de la definición del catálogo, y el valor tiene que coincidir con una opción conocida.
  - Un parámetro como `specs.dpi=1` o `brand[$ne]=x` se ignora, y además `sanitizeFilter` sigue activo.
  - Por eso no hace falta ningún operador de Mongo armado con datos del usuario.
- **Valores inválidos se ignoran, no dan error:** un link viejo o mal escrito muestra el catálogo sin ese filtro en lugar de una página de error.
- **Conteos sin el filtro propio:** es lo que hacen las tiendas de referencia. Si cada menú contara con su propio filtro aplicado, elegir Razer dejaría el menú de marca con una sola opción y habría que limpiar para cambiar.
- **Una sola agregación con `$facet`:** con 6 filtros serían 6 consultas; así es una, y la base (`status`, `category`) usa los índices `{ category, brand }` y `{ category, subcategory }`.
- **Solo listas cerradas y sí/no:** un filtro de texto libre mostraría variantes del mismo valor escritas distinto. Los números (memoria, Hz, DPI) necesitan rangos, que quedan para más adelante.
- **`<details>` para plegar:** es nativo, se maneja con teclado y anuncia su estado a los lectores de pantalla sin ARIA extra. El resumen mide 44 px de alto para tocarlo cómodo.

### Límites conocidos

- No hay filtros por rango (precio, memoria, frecuencia) ni de selección múltiple (dos marcas a la vez).
- Los filtros de la ficha consultan `specs.<clave>` sin índice propio: se apoyan en el índice por categoría. Alcanza para un catálogo de cientos de productos; con miles habría que indexar los campos más usados.
- El conteo de los chips de categoría no tiene en cuenta la búsqueda ni los filtros.

### Tests

En `test/filters.test.js` (11 tests):

- Lectura de la URL:
  - acepta valores de la lista;
  - ignora la marca de otra categoría, los parámetros repetidos, los operadores, los nombres heredados (`constructor`), los campos que no son filtro, `rgb=true` y los textos de 10.000 caracteres.
- Ningún campo filtrable choca con `RESERVED_PARAMS`.
- Filtrado por marca, tipo, ficha y sí/no.
- Conteos sin el filtro propio y sin opciones vacías.
- Filtros aplicados con link para quitar cada uno.
- Los chips de categoría quitan los filtros y la paginación los conserva.
- Las URL maliciosas no rompen la página ni muestran HTML sin escapar.
- Los productos sin marca se siguen listando.
- Sin categoría, solo aparece el filtro de marca.

---

## Tests automáticos en GitHub y pull requests (18/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| Workflow "Tests" | `.github/workflows/tests.yml` | Corre `npm ci`, `npm test` y `npm audit --omit=dev --audit-level=high` en cada pull request y en cada push a `main` |
| Plantilla de pull request | `.github/pull_request_template.md` | Cada PR cuenta qué cambia, cómo se probó, qué no se verificó y qué hacer después de unirlo |
| Insignia de estado | `readme.md` | Muestra si los tests de `main` pasan |

### Cómo funciona

1. Cada mejora se hace en su propia rama y se sube a GitHub como pull request contra `main`.
2. GitHub Actions corre el workflow en una máquina Ubuntu con Node 24, la misma versión mayor que usa Render. Los tests levantan su propia MongoDB en memoria y generan su `JWT_SECRET`, así que no necesitan secretos del repositorio.
3. El PR muestra el resultado del chequeo. Se une a `main` solo con el chequeo en verde, y recién ahí Render publica.

### Por qué

- **Antes no había un segundo control:** los tests corrían solo en la computadora de desarrollo. Ahora corren en una máquina limpia, instalando exactamente lo que dice `package-lock.json` (`npm ci`). Eso detecta los "en mi máquina anda" que vienen de archivos sin commitear o de dependencias instaladas a mano.
- **`permissions: contents: read` y `persist-credentials: false`:** el workflow solo lee el código. Si alguna acción o dependencia estuviera comprometida, no tendría un token con permiso de escritura en el repo.
- **`concurrency`:** un push nuevo a la misma rama cancela la corrida vieja, que ya no sirve.
- **Caché del binario de MongoDB:** `mongodb-memory-server` descarga unos 100 MB la primera vez. Con caché, las corridas siguientes tardan menos.
- **`npm audit` también en CI:** la misma regla que la compuerta local. Las vulnerabilidades altas o críticas en dependencias de producción frenan el PR.

### Límites conocidos

- Las acciones están fijadas por versión mayor (`@v4`), no por hash del commit. Fijarlas por hash es más seguro pero obliga a actualizarlas a mano. Dependabot podría hacerlo.
- El escaneo de secretos (ggshield) sigue corriendo solo localmente, en el hook de pre-commit. En CI necesitaría una clave de API guardada como secreto del repo.
- Que un PR con tests fallando no se pueda unir depende de activar la protección de la rama `main` en la configuración del repo.

---

## Componentes, monitores y categorías vacías (18/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| Fichas de `procesadores`, `placas-de-video`, `memorias-ram`, `motherboards`, `gabinetes` y `monitores` | `public/js/catalogSchema.js` | Subcategorías, marcas cerradas y campos agrupados en secciones, como en las tiendas de referencia |
| Listas compartidas `SOCKETS` y `MEMORY_TYPES` | mismo archivo | El mismo socket o tipo de memoria se escribe igual en procesadores y motherboards |
| `GROUPS` | mismo archivo | Nombres de los tres grupos (Periféricos, Componentes, Monitores) para menús y filtros |
| Íconos de las categorías nuevas | `src/routes/views.route.js` (`CATEGORY_ICONS`) | Tarjetas del inicio y chips del catálogo; van con `aria-hidden` porque el nombre ya está escrito al lado |
| Ocultar categorías vacías | `src/routes/views.route.js` y `src/views/index.handlebars` | El inicio y los chips solo muestran categorías con productos publicados |

### Cómo funciona

1. Sumar una categoría es solo declararla en `CATEGORIES`. El enum del modelo (`CATEGORY_KEYS`), las etiquetas de Handlebars, la validación de la API y la ficha de la página del producto salen de ahí, así que no hubo que tocar el modelo ni las rutas.
2. Las claves con guion (`placas-de-video`, `memorias-ram`) se usan tal cual en la URL (`/products?category=placas-de-video`). Son legibles y no necesitan codificarse.
3. `getCategoriesWithCount()` sigue devolviendo todas las categorías con su cantidad, incluso las que tienen 0. Cada vista decide qué hacer con eso:
   - **Inicio:** solo las tarjetas con `count > 0`. Si no hay ninguna, no se muestra la sección "Categorías".
   - **Chips de `/products`:** las que tienen productos y además la elegida, aunque esté vacía. Quien llega por un link a `?category=gabinetes` ve el chip marcado y el mensaje "No encontramos productos", en lugar de un filtro invisible.

### Por qué

- **Ocultar las vacías:** con 11 categorías y productos solo en algunas, el inicio iba a mostrar seis tarjetas "0 productos" que llevan a páginas vacías. Una tienda que todavía no vende monitores no debería ofrecerlos. Cuando se cargue el primero, la tarjeta aparece sola.
- **Ocultarlas en la vista y no en la consulta:** el conteo es uno solo para el inicio y para el catálogo. Así la regla del chip elegido se resuelve sin una segunda consulta.
- **Listas compartidas:** si "LGA1700" estuviera escrito dos veces, un error de tipeo en una de las dos haría que un procesador y su motherboard dejaran de coincidir en el filtro por socket.
- **Campos elegidos:** son los que muestran HardGamers, Compra Gamer y Mexx en sus fichas, limitados a lo que sirve para comparar o filtrar. Lo que cambia mucho entre modelos y no se filtra (conectores de energía, puertos frontales, radiadores soportados, contenido de la caja) va como texto libre de hasta 80 caracteres. Lo que sí se va a filtrar (socket, tipo de memoria, panel, resolución, formato) va como lista cerrada.
- **Las placas de video tienen dos tipos de marca:** la subcategoría es el fabricante del chip (NVIDIA, AMD, Intel) y la marca es quien arma la placa (Asus, MSI, Gigabyte Aorus…). Así se puede buscar "RTX de MSI".

### Límites conocidos

- Todavía no hay filtros por marca, subcategoría ni campos de la ficha en `/products`.
- El formulario del panel todavía no muestra los campos de la ficha. Por ahora los componentes se cargan por la API.

### Tests

En `test/catalog.test.js`:

- Fichas de placa de video y procesador: números escritos como texto y socket inexistente.
- Campos de otra categoría y marcas que no corresponden.
- Todas las categorías pertenecen a un grupo de `GROUPS`.
- La ficha de un monitor sale con sus unidades ("27 pulgadas", "350 cd/m²").
- El inicio y los chips ocultan las categorías vacías, salvo la elegida.

---

## Catálogo técnico (18/11/2026)

### Qué se agregó

| Pieza | Archivo | Para qué |
|---|---|---|
| Definición del catálogo | `public/js/catalogSchema.js` | Categorías, subcategorías, marcas y ficha técnica de cada una |
| `cleanSpecs(category, specs)` | mismo archivo | Valida y limpia la ficha técnica de un producto |
| `checkCategoryFields({ category, subcategory, brand })` | mismo archivo | Comprueba que la subcategoría y la marca existan en la categoría |
| `specSheet(category, specs)` | mismo archivo | Arma la ficha para mostrar: secciones con filas "etiqueta: valor" |
| `CatalogError` | mismo archivo | Error de catálogo que la API convierte en una respuesta 400 con el motivo |
| Campos nuevos del producto | `src/models/product.model.js` | `subcategory`, `brand`, `model`, `warrantyMonths`, `specs` |
| `applyCatalogRules(data, current)` | `src/utils/productInput.js` | Aplica las reglas del catálogo en altas y ediciones |
| Ficha en la página del producto | `src/views/productDetail.handlebars` | Sección "Especificaciones" agrupada como en las tiendas de referencia |
| Seed que completa el catálogo | `src/data/seeders.js` | Agrega marca y ficha a los productos existentes sin pisar precio ni stock |

### Cómo está definida una categoría

```js
mouse: {
  label: "Mouse",
  group: "perifericos",
  subcategories: { "con-cable": "Con cable", inalambricos: "Inalámbricos" },
  brands: ["Logitech", "Razer", "Redragon", ...],
  sections: [
    { title: "Sensor", fields: [
      { key: "dpi", label: "DPI máximo", type: "number" },
      { key: "pollingHz", label: "Tasa de sondeo", type: "number", unit: "Hz" },
    ] },
    ...
  ],
}
```

Cada campo declara `key` (cómo se guarda), `label` (cómo se ve), `type` (`text`, `number`, `boolean` o `select`), `unit` en los números y `options` en las listas.

**Por qué una definición en datos y no un esquema de Mongoose por categoría:**
- Las fichas cambian seguido (una marca nueva, un campo más). Con la definición en un objeto, el cambio es una línea y no toca la base ni las rutas.
- De la misma definición salen la validación y la ficha que se muestra, y está pensada para generar también el formulario del panel, los filtros del catálogo y la plantilla de importación. Un solo lugar para cada regla.
- Mongoose guarda `specs` como `Mixed` (un objeto libre). La forma la garantiza `cleanSpecs` antes de guardar, no la base. Es el equilibrio habitual en catálogos con atributos distintos por categoría: un esquema rígido por categoría obligaría a una colección o a un discriminador por cada una.

### Cómo valida `cleanSpecs`

1. Si la categoría no existe, error.
2. Si la ficha no es un objeto (por ejemplo, un array), error.
3. **Lista de campos permitidos:** cualquier clave que no esté en la ficha de la categoría es un error que nombra las claves ("La ficha de Mouse no tiene estos campos: hotSwap"). Así no entran datos de otra categoría ni basura.
4. Por tipo:
   - **número:** acepta `26000` o `"26000"` y también la coma decimal (`"60,5"`), porque así se escribe en Argentina. Rechaza negativos, infinitos y texto.
   - **sí/no:** solo `true` o `false`; `"si"` es un error, para no adivinar.
   - **opción:** tiene que ser exactamente una de `options`.
   - **texto:** se recorta y tiene un máximo de 80 caracteres.
5. Los campos vacíos se omiten: una ficha a medio completar es válida y solo muestra lo cargado.

Devuelve una ficha **nueva y limpia**, no la que llegó. Así lo que se guarda siempre tiene el tipo correcto, aunque la entrada venga de un formulario (todo texto) o de un JSON.

### Cómo se aplican las reglas al crear y editar

`applyCatalogRules(data, current)` corre después de `pickProductFields` (que ya filtró campos y tipos básicos):

- **Alta:** valida subcategoría, marca y ficha contra la categoría enviada.
- **Edición:** combina lo enviado con lo que el producto ya tenía. Si solo cambia la ficha, se valida contra la categoría guardada. **Si cambia la categoría**, la subcategoría, la marca y la ficha que quedaron de la anterior también tienen que valer en la nueva; si no, la edición se rechaza diciendo qué falta. Es preferible a borrar datos sin avisar.
- Los errores de catálogo se traducen a `ProductInputError`, y la ruta los responde como 400 con el mensaje. Nunca llegan a un 500.

### Detalles de seguridad

- **`Object.hasOwn` en lugar de `in`** para comprobar la subcategoría: `"constructor" in {}` da `true`, porque `in` también mira propiedades heredadas, y un atacante podría mandar `subcategory: "constructor"`. Lo cubre un test.
- La ficha se muestra con `{{ }}` de Handlebars, que escapa el HTML. Un valor como `<img src=x onerror=...>` aparece como texto; también lo cubre un test.
- La API sigue aceptando solo los campos conocidos (`pickProductFields`): `specs` pasa por `cleanSpecs` y nada más se guarda tal cual llega.

### Productos existentes y seed

- Los campos nuevos son **opcionales** en el modelo: los productos cargados antes (incluidos los de Atlas) siguen viéndose; la página simplemente no muestra la ficha.
- El catálogo de ejemplo (`src/data/products.js`) ahora tiene marca Redragon, subcategoría, modelo, garantía y una ficha parcial con datos conocidos de cada modelo.
- **`seedProducts` cambió:** antes hacía `$set` de todo el producto y, si se volvía a correr, pisaba el precio y el stock que el administrador había cambiado. Ahora usa `$set` solo para los datos de catálogo (marca, subcategoría, modelo, garantía, ficha) y `$setOnInsert` para el resto. Volver a correr `npm run seed` contra Atlas completa las fichas sin tocar precios ni stock.

### Cómo se muestra

`specSheet` devuelve solo las secciones que tienen algún dato y formatea los valores: números con separador de miles de Argentina (`26.000`), unidad al final (`63 g`) y `Sí`/`No` en los booleanos. La vista usa `<dl>` (lista de definiciones), el elemento semántico para pares etiqueta-valor, que los lectores de pantalla leen como "DPI máximo: 26.000". Las secciones se acomodan en una, dos o tres columnas según el ancho, con `grid` y `auto-fit`.

### Límite conocido

El formulario del panel todavía no muestra subcategoría, marca ni ficha: por ahora esos datos se cargan por la API o el seed. Cambiar la categoría de un producto con subcategoría desde el panel da un error claro, porque el formulario aún no puede enviar la nueva.

### Tests

`test/catalog.test.js` (13 casos): coherencia de la definición (sin claves repetidas, tipos válidos), que los productos de ejemplo cumplan su ficha, conversión y omisión de vacíos, rechazo de campos ajenos, tipos y opciones, nombres heredados, formato de la ficha, altas y ediciones por la API (incluido el cambio de categoría), la página del producto, productos viejos sin ficha, escapado de HTML y el seed que no pisa precio ni stock.

---

## Partes anteriores (resumen)

| Cuándo | Qué | Dónde | Idea principal |
|---|---|---|---|
| 18/11/2026 | Destacado elegido desde el panel y contador de vistas | `routes/views.route.js` (`pickHero`, `countView`), `routes/products.route.js` (`keepOnlyFeatured`) | Un destacado a la vez; si no hay, el más visto y después el más caro. Una vista por visitante cada 24 h con una cookie de ids vistos, sin contar administradores ni bots. La API pública no expone las vistas |
| 11/11 y 17/11/2026 | Seguridad de cuentas | `public/js/passwordPolicy.js`, `utils/loginLimiter.js`, `models/revokedToken.model.js` | Contraseñas con mayúscula, minúscula, número y símbolo, sin palabras comunes ni datos personales y con un máximo de 72 bytes (lo que procesa bcrypt). Límite de intentos por IP y cuenta. Cerrar sesión revoca el token con una lista que vence sola (índice TTL) |
| 17/11/2026 | Cabeceras de seguridad y salud | `middlewares/securityHeaders.js`, `/api/health` | Política de contenido sin scripts en línea, protección contra clickjacking y HSTS en producción, sin sumar dependencias. Render usa `/api/health` para saber cuándo una versión está lista |
| 11/11/2026 | Subida de imágenes | `utils/uploader.js` | Solo administradores, PNG/JPG/WebP hasta 2 MB, nombre generado por el servidor y firma del archivo verificada leyendo sus primeros bytes |
| 6/11/2026 | Checkout | `services/orders.service.js` | El carrito se toma y se vacía en una sola operación (un doble clic no duplica la orden) y el stock se descuenta con la condición en la misma operación (la última unidad no se vende dos veces) |
| 17/11/2026 | Validación de productos | `utils/productInput.js` | Solo se guardan los campos esperados, con su tipo. Los operadores de MongoDB que lleguen del cliente se toman como texto (`sanitizeFilter`) |
