# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps/backend ./apps/backend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm --filter backend exec prisma generate

# Build commons package first
RUN pnpm --filter commons build

# Build backend
RUN pnpm --filter backend build

# Runtime stage
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy from builder: only what we need
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start the backend
CMD ["node", "apps/backend/dist/main"]
