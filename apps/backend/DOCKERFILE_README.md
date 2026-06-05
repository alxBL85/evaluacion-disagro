# Dockerfile - Backend

## Descripción

Dockerfile simple de dos etapas (builder y runtime) para construir y ejecutar el backend de la plataforma de eventos.

## Estructura

1. **Etapa Builder**: Instala dependencias, genera el Prisma Client, construye `packages/commons` y el backend
2. **Etapa Runtime**: Copia los artefactos compilados y node_modules necesarios para ejecutar la aplicación

## Cómo construir la imagen

```bash
# Desde la raíz del proyecto
docker build -f apps/backend/Dockerfile -t event-platform-backend:latest .
```

## Cómo ejecutar la imagen

```bash
# Ejecución básica (requiere DB_URL y otras variables)
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host/db" \
  event-platform-backend:latest

# Con archivo .env
docker run -p 3000:3000 \
  --env-file .env \
  event-platform-backend:latest
```

## Requisitos

- Node.js 20+
- pnpm 9.0.0+
- Docker (para construir la imagen)

## Variables de Entorno Necesarias

- `DATABASE_URL`: Conexión a la base de datos PostgreSQL
- `AWS_REGION`: Región de AWS (para SQS)
- `SQS_QUEUE_URL`: URL de la cola SQS (si se usa)

## Notas

- La imagen es simple e incluye todas las dependencias necesarias
- El tamaño final es de ~748MB (incluyendo node_modules)
- No se eliminan las dependencias de desarrollo del runtime (para mantener simplicidad)
- Los scripts locales (`pnpm dev`, `pnpm build`) siguen funcionando sin cambios
