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
