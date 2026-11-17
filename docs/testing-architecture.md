# Enterprise SDET Testing Architecture

This framework follows the **Testing Trophy / Testing Honeycomb** pattern used by large microservice engineering organizations:

## 1. Layer Breakdown
| Layer | Tooling | Location | Purpose |
| :--- | :--- | :--- | :--- |
| **Static Type Safety** | TypeScript (`tsc --noEmit`) | `tsconfig.json`, `cypress/tsconfig.json` | Zero-cost static verification across backend & frontend suites |
| **API & Contract Tests** | Jest + Supertest + Zod | `src/projects/<service>/*.api.spec.ts` | Fast, isolated service endpoint & schema contract enforcement |
| **Cross-Service Integration** | Jest + Service Clients | `src/projects/<service>/*.integration.spec.ts` | Multi-service workflows, inventory/state propagation, error boundaries |
| **Frontend E2E** | Cypress + POM + `cy.session` | `cypress/e2e/<portal>/*.cy.ts` | Critical user journeys using Page Objects & cached auth sessions |

## 2. Design Patterns Enforced
- **Service Object Pattern (`src/services/`)**: Abstracts HTTP routes, headers, and correlation IDs (`X-Correlation-Id`) out of spec files.
- **Contract Validation (`src/core/contractValidator.ts`)**: Uses Zod schemas (`src/contracts/apiContracts.ts`) to catch breaking API payload drift early.
- **Multi-Environment Resolution (`config/environments/*.json`)**: Switch seamlessly between `local`, `dev`, `qa`, and `staging` via `TEST_ENV` or the Dashboard topbar.
- **Page Object Model + `cy.session()` (`cypress/support/pages/`)**: Keeps E2E specs readable and fast without duplicating login steps.
- **Seamless Jenkins Integration (`src/dashboard/services/jenkinsClient.ts`)**: Triggers parameterized `Jenkinsfile` builds (`PROJECT`, `ENVIRONMENT`, `TEST_LAYER`, `TAGS`, `GIT_BRANCH`) via Jenkins REST API (with CSRF crumb handling) or built-in local pipeline simulator.
