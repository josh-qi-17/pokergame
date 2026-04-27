FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY packages/server/package.json ./packages/server/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @poker/shared build
RUN pnpm --filter @poker/engine build
RUN pnpm --filter @poker/server run db:generate
RUN pnpm --filter @poker/server build
RUN pnpm --filter @poker/web build

FROM node:20-alpine AS runner
RUN npm install -g pnpm
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/prisma ./packages/server/prisma
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/engine/node_modules ./packages/engine/node_modules
COPY --from=builder /app/packages/server/node_modules ./packages/server/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY packages/server/package.json ./packages/server/

RUN chown -R appuser:nodejs /app
USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/prod.db

CMD ["node", "packages/server/dist/index.js"]
