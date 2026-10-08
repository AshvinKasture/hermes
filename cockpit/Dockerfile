# ── Builder Stage ──
FROM node:22-alpine AS builder

WORKDIR /app

# Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --include=dev

COPY backend/ ./backend/
RUN cd backend && npm run build

# Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --include=dev

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# ── Runtime Stage ──
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY --from=builder /app/frontend/dist ./frontend/dist

# The compose file runs the container as the host user's UID/GID.
ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 9200

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9200/cockpit/healthz || exit 1

CMD ["node", "backend/dist/index.js"]
