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
