# Tienda Gamer

E-commerce de periféricos gamer con API REST, vistas renderizadas en el servidor y persistencia en MongoDB.

Parte de la entrega final del curso de Backend (Coderhouse, comisión 86215; los primeros commits de este repo son esa entrega) y le suma una interfaz completa, cuentas de usuario y seguridad.

## Tecnologías

- Node.js + Express 5
- Express-Handlebars (vistas) + JavaScript sin frameworks en el navegador
- MongoDB + Mongoose 9 (`mongoose-paginate-v2`)
- JWT + bcrypt + cookies `httpOnly` para la autenticación
- Mocha + Chai + Supertest para los tests

## Funcionalidades

**Para clientes**
- Inicio con producto destacado y categorías
- Catálogo con búsqueda, filtro por categoría, solo con stock, orden por precio y paginación
- Detalle de producto con selector de cantidad limitado al stock y productos relacionados
- Registro e ingreso; el carrito queda guardado en la cuenta
- Carrito con cambio de cantidades, quitar productos y vaciar, con totales al instante
- Checkout con revisión de la compra, orden con número propio y descuento de stock
- Página "Mis compras" con el historial y el detalle de cada orden

**Para administradores** (`/admin`)
- Resumen del catálogo (productos, unidades, sin stock, pausados)
- Alta, edición, borrado y pausa de productos

## Seguridad

- Contraseñas con bcrypt; el hash nunca sale de la base (`select: false`)
- Sesión con JWT en cookie `httpOnly` + `SameSite=Lax` (`Secure` en producción)
- Crear, editar y borrar productos: solo administradores
- Cada carrito solo puede ser leído o modificado por su dueño
- El precio y el total de una compra se calculan en el servidor; cada usuario solo ve sus órdenes
- El stock se descuenta en una operación atómica: la última unidad no se vende dos veces y un doble clic no duplica la compra
- No se puede agregar más unidades que el stock disponible
- Búsquedas con texto escapado en `$regex` (evita ReDoS)
- Mismo mensaje para email inexistente o contraseña incorrecta
- Redirección tras el login solo a rutas internas

## Ejecución local

```bash
npm install
```

**Sin base de datos (recomendado para probar):** levanta MongoDB en memoria con productos y dos cuentas de prueba (las contraseñas se generan en cada arranque y aparecen en la consola). Los datos se borran al cerrar.

```bash
npm run dev:memory
```

**Con MongoDB Atlas:** copia `.env.example` a `.env`, completa las variables y carga los datos iniciales.

```bash
npm run seed
```

```bash
npm run dev
```

La app queda en http://localhost:8081.

## Tests

Tests de integración de la API y las vistas con Mocha, Chai y Supertest. Corren contra MongoDB en memoria, sin tocar ninguna base real.

```bash
npm test
```

Cubren sesiones, permisos de administrador, carritos por usuario, compras, límites de stock, compras simultáneas, escapado de datos en las vistas y redirecciones.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `URI_MONGODB` | Cadena de conexión de MongoDB (usa una base propia, ej. `/tienda-gamer`) |
| `JWT_SECRET` | Clave larga y aleatoria para firmar los tokens |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Opcional: cuenta administradora que crea `npm run seed` |
| `PORT` | Puerto (por defecto 8081) |
| `NODE_ENV` | `production` activa la cookie `Secure` |

## Vistas

| Ruta | Descripción |
|---|---|
| `/` | Inicio |
| `/products` | Catálogo con filtros |
| `/products/:pid` | Detalle de producto |
| `/cart` | Carrito del usuario (requiere sesión) |
| `/checkout` | Revisión y confirmación de la compra (requiere sesión) |
| `/orders` | Mis compras (requiere sesión) |
| `/orders/:oid` | Detalle de una compra (dueño o administrador) |
| `/login`, `/register` | Ingreso y registro |
| `/admin` | Panel de productos (solo administradores) |

## API

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/api/sessions/register` · `/login` · `/logout` | Público |
| `GET` | `/api/sessions/current` | Con sesión |
| `GET` | `/api/products` · `/api/products/:pid` | Público |
| `POST` `PUT` `DELETE` | `/api/products` | Administrador |
| `POST` | `/api/carts` (devuelve el carrito propio) | Con sesión |
| `GET` `PUT` `DELETE` | `/api/carts/:cid` y `/api/carts/:cid/products/:pid` | Dueño del carrito |
| `POST` `GET` | `/api/orders` (compra el carrito propio; lista las compras propias) | Con sesión |
| `GET` | `/api/orders/:oid` | Dueño de la compra o administrador |
