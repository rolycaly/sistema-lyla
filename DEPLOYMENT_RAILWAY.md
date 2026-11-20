# Preparación de despliegue en Railway

## Estado
Esta rama contiene ajustes de arranque y configuración para Railway. **No desplegar a producción todavía**: primero debe completarse la unificación del esquema MySQL con las consultas del backend y añadirse autenticación.

## Configuración del servicio web
- Root directory: `/`
- Build command: `npm run build`
- Start command: `npm start`
- Healthcheck path: `/api/health`
- Node.js: `22.12.0` o superior

El build compila el frontend con Vite y empaqueta el servidor TypeScript con esbuild en `dist-server/server.js`.

## Base MySQL
Añadir un servicio MySQL en Railway y conectar las variables privadas del servicio web. El backend acepta:
- `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`
- O sus equivalentes `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

No copiar contraseñas a GitHub. Usar variables de Railway.

## Bloqueos antes de producción
1. `database/schema.sql` crea tablas y columnas en inglés (por ejemplo `products.code`, `reservations.status`), pero varias rutas ejecutan SQL con nombres en español (por ejemplo `productos.codigo`, `reservas.estado`). El mapeo actual solo detecta nombres de tablas y no adapta las columnas. Hay que elegir un único esquema y adaptar todas las rutas y consultas.
2. `/api/sync/migrate` guarda los datos en memoria, no en MySQL, y no debe exponerse en producción sin autenticación y una migración transaccional real.
3. Varias validaciones de jornada consultan `inMemoryStore`, por lo que no son multiusuario ni persistentes.
4. No hay autenticación/autorización en las rutas de ventas, inventario, gastos ni reportes. No publicar datos financieros sin protegerlos.
5. Las imágenes no deben depender de archivos locales del contenedor; usar almacenamiento de objetos persistente y guardar sus URL en MySQL.

## Validación local/CI
`npm ci` y `npm run build` deben completarse correctamente. La compilación no sustituye pruebas de integración contra una base MySQL creada desde el esquema final.
