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
