FROM node:24-alpine@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14 AS builder

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/forge/package.json ./packages/forge/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/forge ./packages/forge

RUN pnpm turbo run build --filter=@oaslananka/forge

FROM node:24-alpine@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14 AS runtime

LABEL org.opencontainers.image.source="https://github.com/oaslananka/mcp-suite"

RUN apk add --no-cache dumb-init wget procps
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp
RUN mkdir -p /app/data && chown -R mcp:mcp /app/data

COPY --from=builder --chown=mcp:mcp /workspace/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/forge/package.json ./packages/forge/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/forge/dist ./packages/forge/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/forge/node_modules ./packages/forge/node_modules

USER mcp

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/forge/dist/cli.js", "serve", "--port", "4000"]
