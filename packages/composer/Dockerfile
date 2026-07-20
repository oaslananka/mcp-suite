FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

WORKDIR /workspace

COPY .tool-versions .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY scripts/toolchain-contract.mjs scripts/verify-toolchain.mjs ./scripts/

RUN set -eux; \
    corepack enable; \
    pnpm_version="$(awk '$1 == "pnpm" { print $2 }' .tool-versions)"; \
    corepack prepare "pnpm@${pnpm_version}" --activate; \
    node scripts/verify-toolchain.mjs --runtime
COPY packages/shared/package.json ./packages/shared/
COPY packages/composer/package.json ./packages/composer/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/composer ./packages/composer

RUN pnpm turbo run build --filter=@oaslananka/composer

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

LABEL org.opencontainers.image.source="https://github.com/oaslananka/mcp-suite"

RUN apk add --no-cache dumb-init procps
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp
RUN mkdir -p /app/data && chown -R mcp:mcp /app/data

COPY --from=builder --chown=mcp:mcp /workspace/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=mcp:mcp /workspace/packages/composer/package.json ./packages/composer/package.json
COPY --from=builder --chown=mcp:mcp /workspace/packages/composer/dist ./packages/composer/dist
COPY --from=builder --chown=mcp:mcp /workspace/packages/composer/node_modules ./packages/composer/node_modules

USER mcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "packages/composer/dist/cli.js serve" >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/composer/dist/cli.js", "serve"]
