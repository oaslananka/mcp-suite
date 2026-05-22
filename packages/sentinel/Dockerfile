FROM node:24-alpine AS builder

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sentinel/package.json ./packages/sentinel/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/sentinel ./packages/sentinel

RUN pnpm turbo run build --filter=@oaslananka/sentinel

FROM node:24-alpine AS runtime

RUN apk add --no-cache dumb-init procps
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp
RUN mkdir -p /app/data && chown -R mcp:mcp /app/data

COPY --from=builder --chown=mcp:mcp /workspace/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/sentinel/package.json ./packages/sentinel/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/sentinel/dist ./packages/sentinel/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/sentinel/node_modules ./packages/sentinel/node_modules

USER mcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "packages/sentinel/dist/cli.js proxy" >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/sentinel/dist/cli.js", "proxy"]
