.PHONY: dev build test install clean help \
        db-up db-down db-migrate db-studio enterprise-up enterprise-down

## Default target
all: help

## ── Development ──────────────────────────────────────────────────────────────

## Start full development environment (server + client)
dev:
	@echo "🚀 Starting AI Software Engineering Team..."
	@if [ ! -f server/.env ]; then \
		echo "📋 Creating .env from example..."; \
		cp .env.example server/.env; \
		echo "⚠️  Please set ANTHROPIC_API_KEY in server/.env"; \
	fi
	npm run dev

## Install all dependencies
install:
	npm install
	@echo "✅ Dependencies installed"

## Build for production
build:
	npm run build

## ── Testing ──────────────────────────────────────────────────────────────────

## Run all tests
test:
	npm run test

## Run tests with coverage
test-coverage:
	cd server && npm run test:coverage
	cd client && npm run test:coverage

## ── Database ─────────────────────────────────────────────────────────────────

## Start only PostgreSQL (for local DB-backed development)
db-up:
	docker-compose -f docker-compose.enterprise.yml up -d postgres
	@echo "⏳ Waiting for PostgreSQL to be ready..."
	@until docker exec ast_postgres pg_isready -U ast 2>/dev/null; do sleep 1; done
	@echo "✅ PostgreSQL ready"

## Stop PostgreSQL
db-down:
	docker-compose -f docker-compose.enterprise.yml stop postgres

## Run database migrations
db-migrate:
	cd server && npm run db:migrate

## Generate migration files from schema changes
db-generate:
	cd server && npm run db:generate

## Open Drizzle Studio (DB browser)
db-studio:
	cd server && npm run db:studio

## ── Enterprise ───────────────────────────────────────────────────────────────

## Start full enterprise stack (PostgreSQL + Redis + App)
enterprise-up:
	@echo "🏢 Starting enterprise stack..."
	@if [ ! -f server/.env ]; then \
		echo "📋 Creating .env from example..."; \
		cp .env.example server/.env; \
		echo "⚠️  Please configure server/.env before continuing"; \
		exit 1; \
	fi
	docker-compose -f docker-compose.enterprise.yml up -d
	@echo "✅ Enterprise stack started"
	@echo "   App:      http://localhost:3001"
	@echo "   Health:   http://localhost:3001/health"

## Start enterprise stack with pgAdmin
enterprise-up-admin:
	docker-compose -f docker-compose.enterprise.yml --profile admin up -d
	@echo "✅ Enterprise stack + pgAdmin started"
	@echo "   pgAdmin:  http://localhost:5050"

## Stop enterprise stack
enterprise-down:
	docker-compose -f docker-compose.enterprise.yml down

## Destroy enterprise stack (removes volumes — WARNING: deletes all data)
enterprise-destroy:
	@echo "⚠️  This will DELETE all data. Press Ctrl+C to cancel..."
	@sleep 5
	docker-compose -f docker-compose.enterprise.yml down -v

## View enterprise logs
enterprise-logs:
	docker-compose -f docker-compose.enterprise.yml logs -f

## ── Utilities ────────────────────────────────────────────────────────────────

## Clean build artifacts and outputs
clean:
	rm -rf server/dist client/dist
	rm -rf server/outputs/*
	@echo "✅ Cleaned build artifacts"

## Show help
help:
	@echo ""
	@echo "AI Software Engineering Team"
	@echo "=============================="
	@echo ""
	@echo "Setup:"
	@echo "  make install             Install all dependencies"
	@echo "  cp .env.example server/.env && edit server/.env"
	@echo ""
	@echo "Development:"
	@echo "  make dev                 Start server + client (file-based mode)"
	@echo ""
	@echo "Database:"
	@echo "  make db-up               Start PostgreSQL via Docker"
	@echo "  make db-migrate          Run migrations"
	@echo "  make db-generate         Generate migrations from schema changes"
	@echo "  make db-studio           Open Drizzle Studio"
	@echo "  make db-down             Stop PostgreSQL"
	@echo ""
	@echo "Enterprise (full stack in Docker):"
	@echo "  make enterprise-up       Start PostgreSQL + Redis + App"
	@echo "  make enterprise-down     Stop enterprise stack"
	@echo "  make enterprise-logs     Tail logs"
	@echo "  make enterprise-destroy  DESTROY all data and containers"
	@echo ""
	@echo "Testing:"
	@echo "  make test                Run all tests"
	@echo "  make test-coverage       Run with coverage report"
	@echo ""
	@echo "Other:"
	@echo "  make build               Production build"
	@echo "  make clean               Remove build artifacts"
	@echo ""
