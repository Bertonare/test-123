---
name: sdet-testing
description: Enterprise SDET workflow skill for authoring, organizing, executing, and debugging multi-microservice API, Contract, Integration, Cypress E2E, and Jenkins CI tests.
---

# SDET Enterprise Testing Skill

Use this skill whenever adding new microservice test suites, updating environment configurations, debugging test failures, or integrating Jenkins pipelines in this repository.

## 1. Enterprise Testing Strategy (Testing Trophy / Honeycomb)
Follow big-tech microservice testing proportions:
1. **Static Analysis (Base)**: Always keep `npm run typecheck` passing across both `src/` and `cypress/`.
2. **Service API & Contract Tests (`*.api.spec.ts`)**: Fast, isolated Jest suites per microservice using `ServiceHttpClient` / Service Clients (`src/services/*.ts`) and Zod contract validation (`assertContract` from `src/core/contractValidator.ts`).
3. **Cross-Service Integration Tests (`*.integration.spec.ts`)**: Verify multi-service state workflows (Auth -> Users -> Orders/Inventory) with `beforeEach` dummy data reset.
4. **Focused Cypress E2E Tests (`cypress/e2e/<project>/*.cy.ts`)**: Use lightweight Page Objects (`cypress/support/pages/*.ts`) and `cy.loginBySession()` (`cy.session()`) instead of repeating UI login flows.

## 2. Adding a New Microservice Project
1. Register the service in `config/projects.json` (`id`, `name`, `type`, `owner`, `defaultLayer`, `jenkinsJob`, `testRoot`, `tags`).
2. Add its environment URLs in `config/environments/{local,dev,qa,staging}.json` under `"services"`.
3. Add Zod response contracts in `src/contracts/apiContracts.ts` and a typed Service Client in `src/services/`.
4. Create tests under `src/projects/<project-id>/*.api.spec.ts` or `*.integration.spec.ts` (or `cypress/e2e/<project-id>/*.cy.ts` for frontends).
5. The Dashboard, CLI (`--project=<id>`), Jenkinsfile, and MCP server auto-discover the new project immediately.

## 3. Test Case Classification (`positive`, `negative`, `edge`)
Every `it(...)` test case must explicitly start with `[positive]`, `[negative]`, or `[edge]` so **Test Control**, Jest (`-t "\\[edge\\]"`), Cypress (`--env caseType=edge`), and MCP tools can classify and filter cases cleanly:
- `[positive]`: Happy path, valid auth/payloads, expected state transitions.
- `[negative]`: Invalid credentials, missing required fields (`400`/`401`/`403`/`409`), error contract verification.
- `[edge]`: Boundary conditions (`0` quantity, exact remaining stock `0`), non-existent IDs (`404`), malformed tokens, unsupported grant types, unauthenticated route redirects.

## 4. Verification Loop for AI Agents
1. Run `npm run typecheck`.
2. Run targeted tests via `run_tests` MCP tool (or `npm run test:backend` / `npm run test:all`).
3. To validate CI workflow, use `trigger_jenkins_build` MCP tool or `POST /api/jenkins/trigger`.
