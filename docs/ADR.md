# ADR-001: Unified Customer Service Architecture

**Status:** Accepted  
**Date:** 2025-02-22  
**Decision Makers:** Engineering Team

---

## Context

We need to build a **Unified Customer Service** that provides a single view of customer data currently split across two independent systems:

| Aspect           | System A (Legacy)                  | System B (External API)                |
|------------------|------------------------------------|----------------------------------------|
| Storage          | SQLite database                    | REST API (JSON)                        |
| Identifiers      | Numeric IDs                        | UUIDs                                  |
| Strength         | Contract data (type, start date)   | Contact data (phone, address)          |
| Weakness         | Stale addresses, no phone numbers  | No contract information                |
| Update frequency | Batch updates (nightly)            | Near-real-time                         |

Customers may exist in one or both systems. Data quality varies — the same customer may have different name spellings, addresses, or missing fields. The service must handle duplicates, conflicts, and graceful degradation.

## Decision

### 1. Clean Architecture (Standard Layered)

We adopt **Standard Clean Architecture** with four layers, dependency direction always pointing inward:

```
┌─────────────────────────────────────────────┐
│              Presentation Layer              │
│  Controllers · DTOs · Swagger Decorators     │
├─────────────────────────────────────────────┤
│              Application Layer               │
│  Use Cases · Repository Interfaces           │
├─────────────────────────────────────────────┤
│                Domain Layer                  │
│  Entities · Value Objects · Merge Service    │
├─────────────────────────────────────────────┤
│             Infrastructure Layer             │
│  TypeORM Repo · HTTP Client · Mappers        │
└─────────────────────────────────────────────┘
```
**Key rule:** Domain and Application layers have zero framework imports. NestJS decorators only appear in Infrastructure and Presentation.

### 2. Cache-Aside / Read-Through Merge Strategy

We chose **query-time merging** (cache-aside) over data replication:

```
Client → GET /customer/:email
  ├── System A (SQLite)  ──→ Customer | null
  ├── System B (HTTP)    ──→ Customer | null
  └── Merge Service      ──→ Unified result with metadata
```

**Rationale:**
- **Freshness:** Every response reflects current state — no replication lag
- **Simplicity:** No synchronization workers, CDC pipelines, or shared write models
- **Resilience:** If one system is down, we degrade to partial results instead of failing entirely
- **Auditability:** The `_metadata` block documents exactly where each field came from

**Trade-off:** Higher latency per request (two parallel fetches) — mitigated by `Promise.all()` for parallel I/O and a 5-second timeout on System B.

### 3. Merge Priority Rules

| Field              | Winner     | Rationale                                   |
|--------------------|------------|---------------------------------------------|
| `email`            | Join key   | Must match for merge to occur               |
| `name`             | Newer      | System with the most recent `lastUpdated` wins |
| `address`          | System B   | More frequently updated                     |
| `phone`            | System B   | System A typically lacks phone data         |
| `contractStartDate`| System A   | Authoritative for contract data             |
| `contractType`     | System A   | Authoritative for contract data             |

When both systems have a field but values differ, the `_metadata.fields[field]` block flags `conflict: true` and includes both values for transparency.

### 4. NestJS as Framework

**Why NestJS?**
- First-class TypeScript support with decorator-driven DI
- Modular architecture aligns with Clean Architecture boundaries
- Built-in Swagger generation via `@nestjs/swagger` CLI plugin
- Industry-standard HTTP client (`@nestjs/axios`), ORM (`@nestjs/typeorm`), and health checks (`@nestjs/terminus`)

### 5. Embedded Mock API

System B is simulated as an in-process NestJS controller at `/mock-api/*`:

- Avoids Docker networking complexity during development/review
- Adds 200–500 ms random latency to simulate real API behavior
- Returns static data consistent with the test fixtures
- Health-checkable via `/mock-api/ping`

### 6. Response Envelope Pattern

All customer endpoints return a consistent envelope:

```json
// Success
{ "success": true, "data": { ... }, "timestamp": "..." }

// Error
{ "success": false, "error": { "statusCode": 404, "message": "...", "details": [...] }, "timestamp": "..." }
```

Implemented via a global `ResponseWrapperInterceptor` (success path) and `AllExceptionsFilter` (error path). The health endpoint uses `@nestjs/terminus` standard format.

### 7. Resilience Approach

- **`Promise.all()`** for parallel system lookups — both systems queried concurrently
- **5-second HTTP timeout** on System B to prevent cascading hang
- **`isPartial: true`** metadata flag when data is incomplete (one system returns null while the other has data)
- **Graceful null handling** throughout mapper and merge layers
- **`CheckHealthUseCase`** — dedicated use case calling `isHealthy()` on both repository implementations
- **Health endpoint** (`/health`) using `@nestjs/terminus` `HealthCheckService` with per-system status via the `CheckHealthUseCase`

## Consequences

### Positive
- Clear separation of concerns — merge logic is pure, testable domain code
- Field-level provenance makes debugging data issues straightforward
- Partial results prevent total outage when one system is degraded
- Tests run fast (42 unit tests in ~20s, no database required)

### Negative
- Every request makes two outgoing calls — latency is bounded by the slower system
- No caching layer — repeated lookups for the same customer aren't deduplicated (acceptable for current scale)
- Merge rules are hardcoded — changing priority requires a code change (could be externalized to config if needed)

### Risks
- If System B response format changes, the `CustomerBMapper` breaks — mitigated by strict typing and E2E tests
- SQLite is not suitable for production concurrency — the infrastructure layer can be swapped to PostgreSQL without touching domain/application code