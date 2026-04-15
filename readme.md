# Entrega Final CoderHouse - Backend

## 1. Objetivo

Desarrollar un backend de ecommerce con API REST, vistas dinamicas y persistencia en MongoDB.

## 2. Tecnologias Utilizadas

- Node.js
- Express
- Express-Handlebars
- MongoDB + Mongoose

## 3. Funcionalidades 

- Gestion de productos (alta, consulta, actualizacion y eliminacion).
- Gestion de carritos (crear, agregar productos, actualizar cantidades, eliminar productos y vaciar carrito).
- Paginacion, filtro y ordenamiento en listado de productos.

## 4. Vistas Implementadas

- `/` : pagina de inicio.
- `/products` : listado de productos con filtros y paginacion.
- `/products/:pid` : detalle de producto.
- `/cart` : ingreso de ID de carrito.
- `/carts/:cid` : vista del carrito con totales.

## 5. Ejecucion Local

1. Instalar dependencias: `npm install`
2. Configurar variables en `.env`
3. Ejecutar en desarrollo: `npm run dev`
4. Cargar datos iniciales (opcional): `npm run seed`

## 6. Variables de Entorno

```env
PORT=8081
URI_MONGODB=mongodb://localhost:27017/bdcoder
```

## 7. Deploy en Render

1. Subir el repositorio a GitHub.
2. Crear un `Web Service` en Render.
3. Configurar comandos:
   - Build: `npm install`
   - Start: `npm start`
4. Definir variable `URI_MONGODB` con MongoDB Atlas.
5. Desplegar y verificar la URL publica.
