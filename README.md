# Test Control — Enterprise SDET Testing Framework

A scalable, production-ready QA automation framework built around the **Testing Trophy / Honeycomb** model for multi-microservice, multi-environment engineering teams. It combines **TypeScript Backend API, Contract & Integration tests** (Jest + Supertest + Zod), **Frontend E2E tests** (Cypress + Page Objects + `cy.session()`), a web-based **Test Control** dashboard, **Jenkins CI/CD integration**, a built-in **Dummy Target App & Data Store**, **Docker**, and **AI Agent (MCP) support**.

---

## Key Features

- **Test Control Dashboard (`http://localhost:4000`)**:
  - **Multi-Project & Multi-Environment Filtering**: Switch between registered microservices (`auth-service`, `users-service`, `orders-service`, `web-portal`, `platform`) and environments (`local`, `dev`, `qa`, `staging`).
  - **Expandable Suite Views**: Toggle between **List** and **Cards** views, search specs/cases, and click any suite to expand individual test cases with source line numbers and code preview.
  - **Positive / Negative / Edge Case Tracking**: Classify and filter test cases by `[positive]`, `[negative]`, and `[edge]` markers across Backend and Frontend suites.
  - **Headless & Headed Cypress Debugging**: Run E2E specs in `Headless`, `Headed (Chrome)`, `Headed (Chrome + Keep Open)`, or `Headed (Electron)` modes, or launch **Debug UI** (`cypress open`) directly from the dashboard.
  - **Report Exports & Analytics**: Export individual runs as **JSON**, **CSV**, or printable **HTML** reports (`/api/runs/:id/export`), export full run history (`/api/runs/export`), track the 10-run pass trend, flag flaky test cases, and run pre-flight environment service health checks.
- **Seamless Jenkins Integration**:
  - Trigger parameterized builds (`PROJECT`, `ENVIRONMENT`, `TEST_LAYER`, `CASE_TYPE`, `TAGS`, `GIT_BRANCH`) directly from **Test Control** or MCP tools.
  - Supports both a **Real Jenkins Controller** via REST API (CSRF crumb + build/console polling) and a **Built-in Jenkins Simulator** for local validation.
- **Built-in Dummy Target App & Seeded Data (`http://localhost:3000`)**:
  - OAuth 2.0 token server (`/oauth/token` for `client_credentials` and `password` grants), protected REST APIs (`/api/users`, `/api/products`, `/api/orders`), reset/seed endpoints, and Web UI (`/`, `/login`, `/dashboard`).
- **AI Agent Support (MCP + Skills + Docs)**:
  - Ready for AI coding assistants via [AGENTS.md](AGENTS.md), [.agent/skills/sdet-testing/SKILL.md](.agent/skills/sdet-testing/SKILL.md), [docs/testing-architecture.md](docs/testing-architecture.md), and the MCP stdio server in [src/mcp/server.ts](src/mcp/server.ts) ([.mcp.json](.mcp.json)).

---

## Directory Structure

```text
/
├── AGENTS.md                        # AI agent repository guide
├── .agent/skills/sdet-testing/      # Reusable SDET agent skill
├── .mcp.json                        # MCP server configuration
├── config/
│   ├── environments/                # local.json, dev.json, qa.json, staging.json
│   └── projects.json                # Microservice & frontend project registry
├── docs/
│   └── testing-architecture.md      # Testing Trophy / Honeycomb architecture guide
├── src/
│   ├── config/                      # Zod-validated env & project config loader
│   ├── core/                        # ServiceHttpClient, assertContract
│   ├── contracts/                   # Shared Zod API response contracts
│   ├── services/                    # Typed Service Object clients
│   ├── projects/                    # Scoped suites (*.api.spec.ts, *.integration.spec.ts)
│   ├── fixtures/                    # Dummy data store & seeded run history
│   ├── dummy-app/                   # Built-in OAuth 2.0 + REST API + Web Portal
│   ├── dashboard/                   # Test Control server, runners, exporter, Jenkins client & UI
│   ├── mcp/                         # MCP stdio server (7 tools)
│   ├── scripts/                     # Scoped & full pipeline CLI runner
│   ├── types/                       # Shared TypeScript interfaces
│   └── utils/                       # OAuthUtils & embedded/remote test target resolver
├── cypress/
│   ├── e2e/web-portal/              # Cypress E2E specs
│   └── support/
│       ├── pages/                   # Lightweight Page Object classes
│       ├── commands.ts              # cy.login(), cy.loginBySession(), cy.resetDummyData()
│       └── e2e.ts                   # Global hooks & caseType filter
├── Dockerfile
├── docker-compose.yml
└── Jenkinsfile
```

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Out of the box, `TEST_ENV=local` and `USE_DUMMY_APP=true` run all tests against the built-in Dummy Target App. To customize ports, external URLs, or Jenkins credentials:
```bash
cp .env.example .env
```

### 3. Launch Test Control Dashboard (+ Dummy App)
```bash
npm run dashboard
# Test Control UI: http://localhost:4000 (override with DASHBOARD_PORT=4050)
# Dummy Target App: http://localhost:3000 (demo login: admin / password)
```

### 4. CLI Commands
```bash
# Static Typecheck (Backend + Cypress)
npm run typecheck

# Backend Tests
npm run test:api                  # All *.api.spec.ts suites
npm run test:integration          # All *.integration.spec.ts suites
npm run test:backend              # All backend Jest suites + coverage

# Frontend Cypress E2E Tests (requires Dummy App or CYPRESS_BASE_URL)
npm run test:e2e:headless         # Headless run
npm run test:e2e:headed           # Visible Chrome browser run
npm run test:e2e                  # Interactive Cypress Test Runner

# Scoped / Full Pipeline CLI (auto-starts Dummy App if needed)
npm run test:all
npx ts-node src/scripts/run-all.ts --project=auth-service --env=local --layer=backend-api --caseType=edge
npx ts-node src/scripts/run-all.ts --project=web-portal --env=local --layer=frontend-e2e --headed --browser=chrome
```

---

## Docker Execution

```bash
# Start Test Control Dashboard + Dummy Target App
docker-compose up dashboard

# Run Backend API & Integration tests in Docker
docker-compose up tests-backend

# Run Cypress E2E tests against Dummy App in Docker
docker-compose up tests-e2e
```

---

## Jenkins CI/CD Setup

The parameterized [Jenkinsfile](Jenkinsfile) accepts `PROJECT`, `ENVIRONMENT`, `TEST_LAYER`, `CASE_TYPE`, `TAGS`, and `GIT_BRANCH`, executes backend and Cypress stages in parallel inside Docker, and archives JUnit XML reports and failure screenshots.

- **Jenkins Global Credentials**: Configure Secret Text credentials `qa-oauth-client-id` and `qa-oauth-client-secret`.
- **Dashboard Connection**: Set `JENKINS_URL`, `JENKINS_USER`, `JENKINS_API_TOKEN`, and `JENKINS_JOB_NAME` in `.env` (or configure them directly in the **Jenkins CI/CD** tab of **Test Control**). Leave `JENKINS_URL` unset to use the built-in simulator.

---

## Onboarding a New Microservice

1. Add the service entry to [config/projects.json](config/projects.json).
2. Add its per-environment base URLs under `"services"` in [config/environments/](config/environments/local.json).
3. Define Zod response contracts in [src/contracts/apiContracts.ts](src/contracts/apiContracts.ts) and a Service Client in `src/services/`.
4. Add tests in `src/projects/<project-id>/*.api.spec.ts` or `*.integration.spec.ts` with `[positive]`, `[negative]`, and `[edge]` markers—**Test Control**, CLI runners, Jenkins, and MCP auto-discover them automatically.
