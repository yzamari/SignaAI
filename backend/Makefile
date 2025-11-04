# SignaAI Microservices Makefile
.PHONY: help build up down logs clean test health install-deps

# Variables
DOCKER_COMPOSE = docker-compose -f docker-compose.microservices.yml
SERVICES = api-gateway auth-service document-service signature-service notification-service workflow-service

# Default target
help:
	@echo "SignaAI Microservices Management"
	@echo "================================"
	@echo "Available commands:"
	@echo "  make build          - Build all service images"
	@echo "  make up             - Start all services"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - Show logs from all services"
	@echo "  make logs-service   - Show logs for specific service (e.g., make logs-auth)"
	@echo "  make health         - Check health status of all services"
	@echo "  make clean          - Remove containers and volumes"
	@echo "  make test           - Run tests for all services"
	@echo "  make install-deps   - Install dependencies for all services"
	@echo "  make dev            - Run in development mode"
	@echo "  make prod           - Run in production mode"

# Build all services
build:
	@echo "Building all microservices..."
	$(DOCKER_COMPOSE) build --parallel

# Start all services
up:
	@echo "Starting all microservices..."
	$(DOCKER_COMPOSE) up -d
	@echo "Waiting for services to be healthy..."
	@sleep 10
	@make health

# Stop all services
down:
	@echo "Stopping all microservices..."
	$(DOCKER_COMPOSE) down

# Restart all services
restart:
	@echo "Restarting all microservices..."
	@make down
	@make up

# Show logs from all services
logs:
	$(DOCKER_COMPOSE) logs -f

# Show logs for specific services
logs-gateway:
	$(DOCKER_COMPOSE) logs -f api-gateway

logs-auth:
	$(DOCKER_COMPOSE) logs -f auth-service

logs-document:
	$(DOCKER_COMPOSE) logs -f document-service

logs-signature:
	$(DOCKER_COMPOSE) logs -f signature-service

logs-notification:
	$(DOCKER_COMPOSE) logs -f notification-service

logs-workflow:
	$(DOCKER_COMPOSE) logs -f workflow-service

# Health check for all services
health:
	@echo "Checking health status of all services..."
	@echo "========================================="
	@echo -n "API Gateway:        "; curl -s http://localhost:5100/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "Auth Service:       "; curl -s http://localhost:5001/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "Document Service:   "; curl -s http://localhost:5002/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "Signature Service:  "; curl -s http://localhost:5003/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "Notification Service: "; curl -s http://localhost:5004/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "Workflow Service:   "; curl -s http://localhost:5005/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo -n "OCR Service:        "; curl -s http://localhost:8002/health | jq -r '.status' 2>/dev/null || echo "❌ Not responding"
	@echo "========================================="

# Clean up containers and volumes
clean:
	@echo "Cleaning up containers and volumes..."
	$(DOCKER_COMPOSE) down -v
	docker system prune -f

# Install dependencies for all services
install-deps:
	@echo "Installing dependencies for all services..."
	@for service in $(SERVICES); do \
		echo "Installing deps for $$service..."; \
		cd services/$$service && npm install && cd ../..; \
	done

# Run tests for all services
test:
	@echo "Running tests for all services..."
	@for service in $(SERVICES); do \
		echo "Testing $$service..."; \
		cd services/$$service && npm test && cd ../..; \
	done

# Development mode
dev:
	@echo "Starting services in development mode..."
	$(DOCKER_COMPOSE) up

# Production mode
prod:
	@echo "Starting services in production mode..."
	$(DOCKER_COMPOSE) up -d

# Build specific service
build-%:
	@echo "Building $* service..."
	$(DOCKER_COMPOSE) build $*

# Restart specific service
restart-%:
	@echo "Restarting $* service..."
	$(DOCKER_COMPOSE) restart $*

# Stop specific service
stop-%:
	@echo "Stopping $* service..."
	$(DOCKER_COMPOSE) stop $*

# Start specific service
start-%:
	@echo "Starting $* service..."
	$(DOCKER_COMPOSE) start $*

# Scale service
scale-%:
	@read -p "Number of instances: " num; \
	$(DOCKER_COMPOSE) up -d --scale $*=$$num

# Database operations
db-migrate:
	@echo "Running database migrations..."
	@for service in auth document signature notification workflow; do \
		echo "Migrating $$service database..."; \
		$(DOCKER_COMPOSE) exec $$service-service npm run migrate; \
	done

db-seed:
	@echo "Seeding databases..."
	@for service in auth document signature notification workflow; do \
		echo "Seeding $$service database..."; \
		$(DOCKER_COMPOSE) exec $$service-service npm run seed; \
	done

# Monitoring
monitor:
	@echo "Opening monitoring dashboards..."
	@open http://localhost:3000  # Grafana
	@open http://localhost:9090  # Prometheus
	@open http://localhost:16686 # Jaeger

# Show service status
status:
	@docker-compose -f docker-compose.microservices.yml ps

# View environment variables
env:
	@cat .env.example

# Initialize project
init:
	@echo "Initializing SignaAI microservices project..."
	@cp .env.example .env
	@echo "Please edit .env file with your configuration"
	@make install-deps
	@make build
	@echo "Initialization complete! Run 'make up' to start services"