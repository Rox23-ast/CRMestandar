# Use official Node.js image as the base.
# Pinned to the October 2026 security release (fixes CVE-2026-111497 and the
# rest of the Node.js security advisories published on 2026-10-21).
FROM node:22.23.4-alpine AS builder

# Set working directory
WORKDIR /app

# Prisma requires OpenSSL to select a compatible Alpine query engine.
RUN apk add --no-cache openssl

# Copy package.json and package-lock.json
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (devDependencies are required to compile TypeScript)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# --- Frontend Build ---
# Pinned to the same patched runtime: Node 20 reached end-of-life in April 2026
# and no longer receives security fixes.
FROM node:22.23.4-alpine AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies separately from the backend.
COPY frontend/package*.json ./
RUN npm ci

# Build the Vite configuration panel.
COPY frontend/ ./
RUN npm run build

# --- Production Image ---
FROM node:22.23.4-alpine AS production

WORKDIR /app

# Provide the OpenSSL runtime required by Prisma's native engine.
RUN apk add --no-cache openssl

# Install only production dependencies. `prisma` is a runtime dependency because
# the entrypoint runs `prisma migrate deploy`, so dev tooling (jest, ts-node-dev,
# handlebars, etc.) never ships in the final image.
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy built artifacts from the builder stages
COPY --from=builder /app/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public

# Run as the unprivileged `node` user (uid 1000). The SQLite volume is created
# with the ownership of this directory, so `prisma migrate deploy` can write.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

# Expose port
EXPOSE 3000

# Start command: apply pending Prisma migrations, then boot the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
