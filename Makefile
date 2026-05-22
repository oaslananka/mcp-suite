.PHONY: install build test test-coverage typecheck lint format format-check audit clean dev docs-api knip stack-up stack-down smoke-prod

install:
	pnpm install --frozen-lockfile

build:
	pnpm turbo run build

test:
	pnpm run test

test-coverage:
	pnpm run test:coverage

typecheck:
	pnpm turbo run typecheck

lint:
	pnpm turbo run lint

format:
	pnpm run format

format-check:
	pnpm run format:check

audit:
	pnpm audit --audit-level=moderate

docs-api:
	pnpm run docs:api

knip:
	pnpm knip

clean:
	pnpm run clean

dev:
	pnpm turbo run dev

stack-up:
	docker compose up -d

stack-down:
	docker compose down -v

smoke-prod:
	pnpm run smoke:prod
