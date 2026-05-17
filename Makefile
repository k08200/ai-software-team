.PHONY: dev build test install clean help

## Default target
all: help

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

## Run all tests
test:
	npm run test

## Run tests with coverage
test-coverage:
	cd server && npm run test:coverage
	cd client && npm run test:coverage

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
	@echo "  make install       Install all dependencies"
	@echo "  cp .env.example server/.env && edit server/.env"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start server + client"
	@echo ""
	@echo "Testing:"
	@echo "  make test          Run all tests"
	@echo "  make test-coverage Run with coverage report"
	@echo ""
	@echo "Other:"
	@echo "  make build         Production build"
	@echo "  make clean         Remove build artifacts"
	@echo ""
