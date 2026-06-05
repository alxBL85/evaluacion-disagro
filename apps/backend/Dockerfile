# Build stage
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

COPY packages ./packages
COPY apps/backend ./apps/backend

# This creates the workspace symlinks
RUN pnpm install  --frozen-lockfile

# Generate Prisma Client
RUN pnpm --filter backend exec prisma generate

# Build commons first
RUN pnpm --filter commons build

# Rebuild node_modules links after building commons
RUN pnpm install --frozen-lockfile


# Build backend (now commons is in node_modules with proper types)
RUN pnpm install --frozen-lockfile
RUN pnpm --filter backend build


# Runtime stage
FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/backend ./apps/backend

# Copy built artifacts and node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/packages/commons/dist ./packages/commons/dist

EXPOSE 3000

CMD ["node", "apps/backend/dist/main"]