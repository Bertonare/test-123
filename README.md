# Scalable SDET Testing Framework

A production-ready testing framework for a mid-size company, supporting API, Integration, and E2E tests built with TypeScript, Jest, Cypress, Docker, and Jenkins.

## 🚀 Features

- **API Testing**: Powered by Jest & Supertest.
- **E2E Testing**: Powered by Cypress.
- **OAuth 2.0 Integration**: Built-in support for Client Credentials flow with caching.
- **Dockerized**: Ready to run anywhere with Docker & Docker Compose.
- **CI/CD Ready**: Includes a `Jenkinsfile` for parallelized pipeline execution.
- **Strictly Typed**: Developed using TypeScript for better maintainability.

## 📁 Directory Structure

```text
/
├── src/
│   ├── api/            # API Test Scripts (Jest)
│   ├── config/         # Environment Configuration Logic
│   ├── utils/          # Helper classes (OAuth, Axios wrappers)
│   └── integration/    # Integration Test Scripts (Jest)
├── cypress/
│   ├── e2e/            # E2E UI Test Scenarios
│   └── support/        # Cypress commands and custom hooks
├── Dockerfile          # Test environment container
├── docker-compose.yml  # Local test orchestration
└── Jenkinsfile         # CI/CD pipeline definition
```

## 🛠️ Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Docker (optional, for containerized runs)

### 2. Installation
```bash
npm install
```

### 3. Configuration
Copy the `.env.example` file to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

### 4. Running Tests

#### Local Execution
```bash
# Run API tests
npm run test:api

# Run E2E tests (Headless)
npm run test:e2e:headless

# Open Cypress UI
npm run test:e2e
```

#### Docker Execution
```bash
# Run API tests in Docker
docker-compose up tests-api

# Run E2E tests in Docker
docker-compose up tests-e2e
```

## 🏗️ CI/CD Integration

The provided `Jenkinsfile` is designed for a parallel execution strategy. It requires two Jenkins credentials:
- `qa-oauth-client-id`
- `qa-oauth-client-secret`

Screenshots and JUnit reports are automatically archived as build artifacts.

