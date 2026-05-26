# ─── Frontend Dockerfile ────────────────────────────────────────────────────
# Multi-stage build:
#   development — Vite dev server with hot-reload (HMR)
#   build       — production Vite bundle
#   production  — serve the static bundle with nginx

# ── Stage 1: Development (Vite dev server) ───────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .

EXPOSE 5173

# --host 0.0.0.0 exposes Vite HMR to the Docker network
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]

# ── Stage 2: Build (Vite static bundle) ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY . .

ARG VITE_API_BASE_URL
ARG VITE_PINATA_JWT
ARG VITE_PINATA_GATEWAY

# Build the static site — outputs to /app/dist
RUN npm run build

# ── Stage 3: Production (nginx) ───────────────────────────────────────────────
FROM nginx:1.25-alpine AS production

# Copy the built static files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config for SPA routing and security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
