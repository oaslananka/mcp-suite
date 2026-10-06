FROM node@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS builder

WORKDIR /workspace

COPY .tool-versions package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY scripts/toolchain-contract.mjs scripts/verify-toolchain.mjs ./scripts/

RUN set -eux; \
    corepack enable; \
    pnpm_version="$(awk '$1 == "pnpm" { print $2 }' .tool-versions)"; \
    corepack prepare "pnpm@${pnpm_version}" --activate; \
    TOOLCHAIN_PNPM_VERSION="${pnpm_version}" node scripts/verify-toolchain.mjs --runtime
COPY packages/shared/package.json ./packages/shared/
COPY packages/atlas/package.json ./packages/atlas/

RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm rebuild better-sqlite3 esbuild

COPY packages/shared ./packages/shared
COPY packages/atlas ./packages/atlas

RUN pnpm turbo run build --filter=@oaslananka/atlas
RUN pnpm --ignore-scripts --filter @oaslananka/atlas deploy --legacy --prod /deploy/atlas
RUN source="$(find /workspace/node_modules -path '*/better-sqlite3/build/Release/better_sqlite3.node' -print -quit)"; \
    target="$(readlink -f /deploy/atlas/node_modules/better-sqlite3)"; \
    test -n "${source}"; \
    test -d "${target}"; \
    mkdir -p "${target}/build/Release"; \
    cp "${source}" "${target}/build/Release/better_sqlite3.node"

FROM node@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS runtime

LABEL org.opencontainers.image.source="https://github.com/oaslananka/mcp-suite"

RUN apk add --no-cache dumb-init openssl procps wget && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp
RUN mkdir -p /app/data && chown -R mcp:mcp /app/data

COPY --from=builder --chown=mcp:mcp /deploy/atlas ./packages/atlas

USER mcp

EXPOSE 4003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4003/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/atlas/dist/cli.js", "serve", "--port", "4003"]
