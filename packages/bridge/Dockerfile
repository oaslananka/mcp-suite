FROM node:20-alpine AS builder

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/bridge/package.json ./packages/bridge/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/bridge ./packages/bridge

RUN pnpm turbo run build --filter=@oaslananka/bridge

FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init procps
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp

COPY --from=builder --chown=mcp:mcp /workspace/packages/bridge/dist ./dist
COPY --from=builder --chown=mcp:mcp /workspace/node_modules ./node_modules

USER mcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "dist/cli.js" >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/cli.js", "--help"]
