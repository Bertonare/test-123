# AI Agent Guide — Enterprise SDET Test Framework

This repository is structured for multi-microservice, multi-environment QA automation and seamless collaboration with AI coding agents.

## Knowledge & Skills
- Architecture & Strategy: [docs/testing-architecture.md](docs/testing-architecture.md)
- Reusable SDET Skill: [.agent/skills/sdet-testing/SKILL.md](.agent/skills/sdet-testing/SKILL.md)

## Project Layout
- **Multi-Environment Profiles**: `config/environments/{local,dev,qa,staging}.json` (validated via Zod in `src/config/schemas.ts`)
- **Microservice & Frontend Registry**: `config/projects.json` (`auth-service`, `users-service`, `orders-service`, `web-portal`, `platform`)
- **Core & Service Objects**: `src/core/` (`ServiceHttpClient`, `assertContract`) & `src/services/` (`AuthServiceClient`, `UsersServiceClient`, `OrdersServiceClient`)
- **Contracts**: `src/contracts/apiContracts.ts` (Zod response schemas)
- **Backend API & Integration Tests**: `src/projects/<project-id>/*.api.spec.ts` and `*.integration.spec.ts`
- **Frontend E2E Tests**: `cypress/e2e/<project-id>/*.cy.ts` with Page Objects in `cypress/support/pages/` and `cy.loginBySession()`
- **Dummy Target App & Data**: `src/dummy-app/server.ts` + `src/fixtures/dummy-data.ts`
- **Dashboard + Jenkins Integration**: `src/dashboard/` (UI at `http://localhost:4000`, Jenkins REST client + built-in simulator in `src/dashboard/services/jenkinsClient.ts`)
- **MCP Server**: `src/mcp/server.ts` (`.mcp.json`)

## Standard Commands
- Type-check (Backend + Cypress): `npm run typecheck`
- Start Dashboard + Dummy App: `npm run dashboard`
- Backend API Tests only: `npm run test:api`
- Backend Integration Tests only: `npm run test:integration`
- All Backend Tests: `npm run test:backend`
- Frontend E2E Headless: `npm run test:e2e:headless`
- Frontend E2E Headed (visible Chrome for debugging): `npm run test:e2e:headed`
- Interactive Cypress Runner: `npm run test:e2e`
- Scoped / Full Pipeline CLI: `npx ts-node src/scripts/run-all.ts --project=users-service --env=local --layer=backend-api` (add `--headed --browser=chrome` for visible E2E debugging)
- Start MCP stdio server: `npm run mcp`

## MCP Tools Available (`.mcp.json`)
1. `list_test_suites` (filters: `projectId`, `layer`, `tag`)
2. `run_tests` (params: `layer`, `projectId`, `environment`, `targetFile`)
3. `get_test_runs`
4. `trigger_jenkins_build` (params: `projectId`, `environment`, `testLayer`, `tags`, `branch`)
5. `get_jenkins_builds`
6. `manage_dummy_data` (`snapshot`, `reset`, `seed`)
7. `get_environment_config`
