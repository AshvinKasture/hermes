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

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Copy compiled backend
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy built frontend
COPY --from=builder /app/frontend/dist ./frontend/dist

USER app

ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 9120

CMD ["node", "backend/dist/index.js"]