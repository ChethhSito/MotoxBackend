# MotoX API

Backend NestJS de MotoX. Está en un repositorio separado de `booking-moto` y usa PostgreSQL 18 para viajes, ofertas, pagos manuales, reseñas, talleres y tiendas. Flutter **todavía usa Firebase/Firestore** para esas operaciones: esta API no sustituye el flujo móvil hasta integrar sus llamadas y migrar los datos existentes.

## Arranque local

1. Instala Node.js compatible con el `package.json` y PostgreSQL 18.
2. Ejecuta `npm ci`.
3. En Windows, ejecuta `python scripts/setup_local_db.py`. Crea la base `motox_dev`, el usuario `motox_app` y `.env.local` con una contraseña propia. El archivo está ignorado por Git.
4. Configura `FIREBASE_PROJECT_ID` en `.env.local` con el proyecto de Firebase que usa Flutter. Para las rutas protegidas, configura credenciales de Firebase Admin mediante `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un JSON de cuenta de servicio fuera del repositorio o mediante identidad de la máquina anfitriona. No copies la clave al repositorio.
5. Ejecuta `npm run db:migrate` y luego `npm run start:dev`.
6. Abre `http://localhost:3000/health/ready`. Debe devolver `status: ok` y `schemaVersion: 003_user_role_events.sql`.

`GET /health/live` comprueba que el proceso responde. `GET /health/ready` comprueba PostgreSQL 18 y la versión requerida del esquema. `GET /health` mantiene la respuesta anterior de compatibilidad. La API rechaza una versión mayor de PostgreSQL distinta de 18.

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/modules/pasajero` | Solicitud, tarifa, ofertas, entrega, reseñas e historial del pasajero. |
| `src/modules/conductor` | Solicitudes cercanas, ofertas, viaje, ubicación, pago manual, reseñas e historial. |
| `src/modules/taller`, `src/modules/tienda` | Consulta pública y registro/edición de negocios. |
| `src/modules/seguridad` | Token Firebase, usuario, roles y aprobación administrativa. |
| `src/modules/viajes`, `src/modules/negocios` | Reglas y acceso a datos compartidos por los módulos HTTP. |
| `src/infrastructure/database` | Pool PostgreSQL y transacciones. |
| `migrations` | Esquema SQL versionado; no modificar una migración aplicada. |

El patrón es `controller` para HTTP, `dto` para validar entradas, `service` para reglas y `repository` para acceso a datos. Las operaciones que cambian varios registros usan una transacción.

## Endpoints principales

Todas las rutas `/v1` protegidas requieren `Authorization: Bearer <Firebase ID token>`. Un usuario nuevo se registra con rol `client`. El rol no se toma de lo enviado por Flutter.

| Actor | Rutas | Uso |
| --- | --- | --- |
| Pasajero | `POST/GET /v1/pasajero/viajes`, `GET /v1/pasajero/viajes/:id` | Crear, listar y consultar viajes. |
| Pasajero | `PATCH /v1/pasajero/viajes/:id/tarifa`, `GET /v1/pasajero/viajes/:id/ofertas`, `POST /v1/pasajero/viajes/:id/ofertas/:offerId/aceptar` o `/rechazar` | Negociar tarifa. Subirla invalida ofertas anteriores. |
| Pasajero | `POST /v1/pasajero/viajes/:id/cancelar`, `/confirmar-entrega`, `/resenas`; `GET .../conductor/ubicacion`, `GET .../resenas` | Cancelación, PIN de entrega, seguimiento y calificación. |
| Conductor | `GET /v1/conductor/solicitudes?lat=...&lng=...&radiusKm=10`, `GET .../solicitudes/:id` | Solicitudes próximas al inicio. |
| Conductor | `POST /v1/conductor/solicitudes/:id/aceptar`, `/ofertas`, `/ofertas/:offerId/retirar` | Aceptar tarifa o negociar. La oferta vence en dos minutos. |
| Conductor | `GET /v1/conductor/viajes`, `GET .../viajes/:id`, `POST .../llegada`, `/iniciar`, `/finalizar`, `/esperar-verificacion`, `/cancelar`, `/pago`, `/resenas` | Progreso del viaje, cobro manual e historial. |
| Conductor | `PUT /v1/conductor/ubicacion` | Actualizar su posición; el pasajero solo recibe una posición reciente durante un viaje activo. |
| Público | `GET /v1/taller` y `GET /v1/tienda` con `lat`, `lng` y `radiusKm` | Negocios aprobados próximos. |
| Titular | `GET /v1/taller/mis-negocios`, `POST /v1/taller`, `PATCH /v1/taller/:id`; equivalentes en `/v1/tienda` | Registro y edición; quedan pendientes de aprobación. |
| Admin | `POST /v1/seguridad/negocios/:id/aprobar`, `PATCH /v1/seguridad/usuarios/:uid/rol` | Aprobar negocios y habilitar o retirar rol de conductor. |
| Autenticado | `GET /v1/seguridad/me`, `GET /v1/seguridad/usuarios/:uid/resenas` | Perfil, promedio/conteo y comentarios de reseñas recibidas. |

Los cuerpos se validan con los DTO de cada módulo. `autoAcceptOffer: true` en la creación del viaje permite aceptar automáticamente la primera oferta que iguale la tarifa vigente. La API exige `expectedVersion` o `priceVersion` en acciones de tarifa para evitar aceptar una tarifa anterior. El PIN de delivery se guarda como hash y debe introducirlo el pasajero al confirmar la entrega; no se entrega al conductor.

### Roles iniciales

El primer administrador requiere una operación local de base de datos tras iniciar sesión una vez con Firebase para que exista su `uid` en `users`. Un operador con acceso administrativo a PostgreSQL puede ejecutar:

```sql
UPDATE users SET role = 'admin', updated_at = now() WHERE uid = '<uid-verificado>';
```

Después, el administrador puede habilitar conductores desde la ruta de rol. Antes de hacerlo debe validar su identidad y requisitos operativos. La API registra los cambios de rol en `user_role_events` e impide retirar el rol de conductor durante un viaje activo. Nunca habilites el rol desde datos que mande el cliente.

## Verificación

Ejecuta `npm run build`, `npm test`, `npm run test:e2e` y `npm run lint`. Las pruebas e2e usan PostgreSQL local, insertan usuarios temporales y los eliminan al terminar. Sustituyen la verificación del token solo dentro del proceso de pruebas; la API normal exige Firebase Admin.

## Integración pendiente antes de publicar

- Migrar los usuarios existentes y sus roles, viajes, ofertas y reseñas desde Firestore a PostgreSQL, con conciliación y estrategia para no duplicar viajes activos.
- Cambiar Flutter para llamar a esta API y recibir actualizaciones de ofertas, estado y posición en tiempo real. Hoy no hay WebSocket ni envío push desde este backend. La app actual sigue usando Firestore.
- Probar la verificación real de Firebase Admin, pasajero y conductor en dispositivos, ubicación en segundo plano y conectividad contra el servidor de Hostinger.
- Definir borrado de cuenta y de datos en PostgreSQL y la política de conservación. El historial y las reseñas se conservarán mientras exista la cuenta, según la decisión del proyecto.

El plan de migración y lanzamiento está en `../motox-docs/plan-lanzamiento-y-migracion-backend.md`.
