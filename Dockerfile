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

CMD ["bun", "run", "src/server.ts"]
