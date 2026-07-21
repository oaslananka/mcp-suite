FROM node@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

WORKDIR /workspace

COPY .tool-versions package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY scripts/toolchain-contract.mjs scripts/verify-toolchain.mjs ./scripts/

RUN set -eux; \
    corepack enable; \
    pnpm_version="$(awk '$1 == "pnpm" { print $2 }' .tool-versions)"; \
    corepack prepare "pnpm@${pnpm_version}" --activate; \
    TOOLCHAIN_PNPM_VERSION="${pnpm_version}" node scripts/verify-toolchain.mjs --runtime
COPY packages/shared/package.json ./packages/shared/
COPY packages/observatory/package.json ./packages/observatory/

RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm rebuild better-sqlite3 esbuild

COPY packages/shared ./packages/shared
COPY packages/observatory ./packages/observatory

RUN pnpm turbo run build --filter=@oaslananka/observatory
RUN pnpm --ignore-scripts --filter @oaslananka/observatory deploy --legacy --prod /deploy/observatory
RUN source="$(find /workspace/node_modules -path '*/better-sqlite3/build/Release/better_sqlite3.node' -print -quit)"; \
    target="$(readlink -f /deploy/observatory/node_modules/better-sqlite3)"; \
    test -n "${source}"; \
    test -d "${target}"; \
    mkdir -p "${target}/build/Release"; \
    cp "${source}" "${target}/build/Release/better_sqlite3.node"

FROM node@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

LABEL org.opencontainers.image.source="https://github.com/oaslananka/mcp-suite"

RUN apk add --no-cache dumb-init procps wget && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
WORKDIR /app

RUN addgroup -g 1001 -S mcp && adduser -S -u 1001 -G mcp mcp
RUN mkdir -p /app/data && chown -R mcp:mcp /app/data

COPY --from=builder --chown=mcp:mcp /deploy/observatory ./packages/observatory

USER mcp

EXPOSE 4006

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4006/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/observatory/dist/cli.js", "serve", "--port", "4006"]
