# MotoX API

Base inicial del backend de MotoX con NestJS y PostgreSQL 18. Todavía no recibe solicitudes de viaje: Flutter sigue usando Firebase para los flujos actuales.

## Desarrollo local

1. Tener PostgreSQL 18 activo en el puerto `5433` y Node.js `24.15+` o `22.22.3+`.
2. Instalar dependencias: `npm ci`.
3. En Windows, ejecutar `python scripts/setup_local_db.py`. Solicita la contraseña local de `postgres`, crea la base `motox_dev` y el usuario `motox_app`, y guarda una contraseña propia en `.env.local`. Ese archivo está excluido de Git.
4. Iniciar: `npm run start:dev`.
5. Verificar `http://localhost:3000/health`: debe devolver `status: ok` y `majorVersion: 18`.

Para otra instalación, copiar `.env.example` a `.env.local` y configurar host, puerto, base y usuario de PostgreSQL 18. La API comprueba la conexión al iniciar y rechaza otra versión mayor de PostgreSQL.

## Verificación

`npm run build`, `npm test`, `npm run test:e2e` y `npm run lint`. La prueba e2e usa la base local configurada.

## Migración pendiente

Antes de apuntar Flutter a esta API faltan el modelo y las migraciones de datos, la verificación de tokens Firebase, autorización por rol, endpoints y estados de viajes/ofertas/pagos/reseñas, eventos en tiempo real, exportación y conciliación de Firestore, y pruebas con pasajero y conductor. El orden y las condiciones de publicación están en `../booking-moto/docs/plan-lanzamiento-y-migracion-backend.md`.
