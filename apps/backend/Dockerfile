# Build stage
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

COPY packages ./packages
COPY apps/backend ./apps/backend

# This creates the workspace symlinks
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm --filter backend exec prisma generate

# Build commons first
RUN pnpm --filter commons build

# Build backend (now commons is in node_modules with proper types)
RUN pnpm --filter backend build


# Runtime stage
FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/backend ./apps/backend

# Install dependencies (creates node_modules with workspace symlinks)
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000

CMD ["node", "apps/backend/dist/main"]