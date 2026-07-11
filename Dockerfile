# ── Build stage ───────────────────────────────────────────────────
FROM oven/bun:1-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── Runtime stage ──────────────────────────────────────────────────
FROM oven/bun:1-alpine

WORKDIR /app

# Copy production deps + source
COPY --from=build /app/node_modules ./node_modules
COPY . .

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]

CMD ["bun", "run", "src/server.ts"]
