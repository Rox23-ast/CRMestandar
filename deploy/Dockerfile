# Use official Node.js image as the base
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Prisma requires OpenSSL to select a compatible Alpine query engine.
RUN apk add --no-cache openssl

# Copy package.json and package-lock.json (if available)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Build TypeScript code
RUN npm run build

# --- Frontend Build ---
# Vite 8 requires Node.js 20.19+.
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install frontend dependencies separately from the backend.
COPY frontend/package*.json ./
RUN npm install

# Build the Vite configuration panel.
COPY frontend/ ./
RUN npm run build

# --- Production Image ---
FROM node:22-alpine AS production

WORKDIR /app

# Provide the OpenSSL runtime required by Prisma's native engine.
RUN apk add --no-cache openssl

# Copy built artifacts and dependencies from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=frontend-builder /app/frontend/dist ./public

# Expose port
EXPOSE 3000

# Start command: apply pending Prisma migrations, then boot the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
