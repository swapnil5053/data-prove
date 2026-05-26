# ─── Backend Dockerfile ─────────────────────────────────────────────────────
# Multi-stage build:
#   development — hot-reload with nodemon, full source access
#   production  — minimal image with only production deps, non-root user

# ── Stage 1: Base dependencies ───────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install only package manifests first to exploit Docker layer caching.
# node_modules are rebuilt only when package*.json changes.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: Development ─────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app

# Install ALL deps (including devDependencies like nodemon)
COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .

EXPOSE 3001

# nodemon watches for changes and auto-restarts the server
CMD ["npx", "nodemon", "--watch", ".", "--ext", "js,json", "server.js"]

# ── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Security: Create a non-root user for the process
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001 -G nodejs

# Copy only production node_modules from base stage
COPY --from=base /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodeuser:nodejs . .

# Drop to non-root user
USER nodeuser

EXPOSE 3001

# NODE_ENV should be set by the orchestrator (ECS task definition / K8s env)
ENV NODE_ENV=production

CMD ["node", "server.js"]
