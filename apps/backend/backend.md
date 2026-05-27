2. Instalación de Fastify (alternativa a express):

```bash
cd apps/backend

# Fastify adapter
pnpm add @nestjs/platform-fastify fastify

# Config module para variables de entorno
pnpm add @nestjs/config

# Validación de DTOs
pnpm add class-validator class-transformer

# AWS SDK para SQS
pnpm add @aws-sdk/client-sqs

# Commons del monorepo
pnpm add @event-platform/commons@workspace:*

cd ../..
```

3. Configurar tsconfig.json del backend:

```typescript
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "paths": {
      "@event-platform/commons": ["../../packages/commons/src/index.ts"]
    }
  },
  "include": ["src/**/*", "prisma/seed.ts"],
  "exclude": ["node_modules", "dist"]
}
```

5. Configurar el AppModule

```typescrypt
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
})
export class AppModule {}
```
