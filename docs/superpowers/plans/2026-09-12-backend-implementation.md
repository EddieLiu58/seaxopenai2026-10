# Backend Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the isolated core task and final review. The controller implements build, AI transport and integration checks alongside that task.

**Goal:** Deliver the complete backend in `backend/spec.md`, bootstrapped with the supplied software-company organization example.

**Architecture:** One Spring Boot process serves REST and a durable PostgreSQL job worker. Transactions protect project/report versions, idempotency and audit events; AI HTTP calls run outside transactions with fenced leases.

**Tech Stack:** Java 26, Gradle 9.5.1, Spring Boot 4.1.1, Spring JDBC, Flyway, PostgreSQL 17, springdoc 3.1.1, direct OpenAI Responses HTTP API.

**Spec:** `backend/spec.md` (authoritative; older design and feedback examples are superseded).

## Global Constraints

- All IDs UUID, timestamps UTC ISO 8601, JSON camelCase, API base `/api/v1` and at most three resource path segments.
- UNKNOWN is valid with null departmentId and AI/USER source; UNASSIGNED uses null departmentId/source.
- Workflow dependencies form a same-report DAG with canonical UUID ordering and restrictive deletion.
- Every report change, immutable diff and corresponding job update commits atomically under project locking.
- All POST requests require permanent transactional canonical-body idempotency.
- Jobs allow 3 attempts per batch, 5/30 second backoff, 120 second total attempt timeout, 150 second lease and 15 second heartbeat; stale execution tokens cannot commit.
- Initialize the example only on an empty memory table, configurable off for API initialization/testing.
- Do not edit frontend or existing examples. Keep implementation in the shared workspace; no Git mutations or publishing required.

## Interfaces

`com.seax.backend.ai.AiClient.generate(String operation, Map<String,Object> input, Duration timeout)` returns a decoded object. Operations: `split` takes `{content}` and returns `{workflows:[{key,name,description,dependsOnKeys}]}`; `classify` takes `{workflows:[{id,name,description}],globalMemory}` and returns `{assignments:[{workflowId,assignmentStatus,departmentId}]}`; `feedback` takes `{report,reportDiffs,globalMemory}` and returns `{departments:[{id,name,description}]}`. The core validates every semantic result. `AiFailure` exposes `code()`, `retryable()`, `retryAfter()` and a sanitized message. `Json` provides static read/write/copy helpers using Jackson 2. Build/application/AI/HTTP transport tests belong to the controller; core API/database/worker and corresponding unit tests belong to the implementer. Controller adds end-to-end API tests once core compiles.

### Task 1: Core API, persistence and durable worker

Files: `backend/src/main/java/com/seax/backend/core/**`, `backend/src/main/resources/db/migration/**`, `backend/src/test/java/com/seax/backend/core/**`.

- [x] Write and run failing DAG tests (stable diamond ordering; cycle, cross-report and duplicate rejection; reorder equality).
- [x] Implement relational schema, memory initialization, API validation, report graph/audits and all 14 API operations, idempotency and state/version locking.
- [x] Implement durable worker with snapshots, fenced claim/apply, attempt history, bounded retry, recovery, feedback serialization/CAS.
- [x] Test meaningful graph/validation/worker behavior and report exact commands and results. Expose worker scheduling disable config for deterministic integration tests.

### Task 2: Build and OpenAI transport (controller, alongside Task 1)

Files: Gradle wrapper/build, application properties/main, `ai/**`, `Json.java`, `ai/OpenAiClientTest.java`.

- [x] Scaffold pinned build and shared interface.
- [x] Write transport tests using local HTTP server: structured-output request and parsing; 429 Retry-After; 401 permanent; malformed/refused output retryable; timeout.
- [x] Run failing tests, then implement one-request Java HTTP transport with strict response schemas and purpose-limited prompts.
- [x] Run passing transport tests and produce bootable JAR.

### Task 3: Integration and delivery

Files: `BackendIntegrationTest.java`, `openapi.json`, `README.md`, `.env.example`, `compose.yaml`.

- [x] Exercise the real PostgreSQL schema through HTTP with a deterministic fake at the AI boundary; include initial split, dependency changes, unknown, clear/apply, close/feedback, idempotency, stale writes, retry and lease recovery.
- [x] Serve complete OpenAPI schemas with Chinese endpoint descriptions, Swagger UI, configurable CORS/body limit and bootstrap seed.
- [x] Run build/tests and boot smoke test against the example; inspect all failures before fixes.
- [x] Obtain independent whole-change review; fix material findings and verify affected checks.
- [x] Document startup, migrations, initialization switch, polling/retry APIs and actual verification limitations.
