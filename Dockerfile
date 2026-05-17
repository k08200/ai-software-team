# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies
RUN npm install

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Build server
RUN cd server && npx tsc

# Build client
RUN cd client && npx vite build

# ─── Production image ───────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Only copy production dependencies
COPY package*.json ./
COPY server/package.json ./server/
RUN npm install --workspace=server --omit=dev

# Copy built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Create outputs directory
RUN mkdir -p outputs

# Serve client static files from server
COPY --from=builder /app/client/dist ./server/dist/public

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
