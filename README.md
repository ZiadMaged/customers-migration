# Unified Customer Service

A NestJS microservice that provides a **unified view of customer data** from two independent systems, resolving duplicates, surfacing conflicts, and handling degradation gracefully.

## Architecture

Built with **Clean Architecture** — four layers with dependencies pointing inward:

| Layer          | Contents                                              |
|----------------|-------------------------------------------------------|
| Domain         | `Customer` entity, `Email` value object, merge service |
| Application    | Use cases, repository interfaces                       |
| Infrastructure | TypeORM (SQLite), HTTP client, mappers                 |
| Presentation   | REST controllers, Swagger DTOs                         |

See [`docs/ADR.md`](docs/ADR.md) for detailed architecture decisions and [`docs/consistency-writeup.md`](docs/consistency-writeup.md) for the consistency model analysis.

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install & Run

```bash
npm install
npm run start:dev
```

The service starts at **http://localhost:3000**.  
Swagger UI is available at **http://localhost:3000/api/docs**.

### Docker

```bash
docker compose up --build
```

## API Endpoints

### Get Customer by Email

```bash
curl http://localhost:3000/customer/max.mustermann@example.de
```

Returns a merged customer record with field-level provenance metadata.

### Search Customers by Name

```bash
curl "http://localhost:3000/customer/search?q=Mustermann"
```

Case-insensitive name search across both systems. Results are deduplicated by email and cross-referenced for complete merges.

### Sync / Conflict Detection

```bash
curl -X POST http://localhost:3000/customer/sync \
  -H "Content-Type: application/json" \
  -d '{"email": "sophie.mueller@example.de"}'
```

Returns `in_sync`, `conflicts_found`, or `single_source_only` with field-by-field conflict details.

### Health Check

```bash
curl http://localhost:3000/health
```

Reports per-system health (SQLite connectivity + System B API reachability).

## Response Format

All customer endpoints return a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-02-22T10:30:00.000Z"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "statusCode": 404,
    "message": "Customer with email 'x@y.de' not found in any system"
  },
  "timestamp": "2025-02-22T10:30:00.000Z"
}
```

## Merge Rules

| Field              | Priority   | Rationale                           |
|--------------------|------------|-------------------------------------|
| `name`             | Newer      | Whichever system has the most recent `lastUpdated` |
| `address`          | System B   | More frequently updated             |
| `phone`            | System B   | System A lacks phone data           |
| `contractStartDate`| System A   | Authoritative for contracts         |
| `contractType`     | System A   | Authoritative for contracts         |

Conflicts are flagged in `_metadata.fields` with both values exposed.

## Test Data

### System A (SQLite)

| Email                          | Name              |
|--------------------------------|-------------------|
| max.mustermann@example.de      | Max Mustermann    |
| erika.muster@example.de        | Erika Muster      |
| jan.schmidt@example.de         | Jan Schmidt       |
| sophie.mueller@example.de      | Sophie Muller     |

### System B (Mock API)

| Email                          | Name              |
|--------------------------------|-------------------|
| max.mustermann@example.de      | Max Mustermann    |
| erika.muster@example.de        | Erika Muster      |
| lisa.neu@example.de            | Lisa Neu          |
| sophie.mueller@example.de      | Sophie Mueller    |

## Testing

```bash
# Unit tests (42 tests)
npm test

# E2E tests (14 tests)
npm run test:e2e

# Coverage
npm run test:cov
```

## Project Structure

```
src/
├── customer/
│   ├── domain/
│   │   ├── entities/          # Pure domain entity
│   │   ├── enums/             # SourceSystem enum
│   │   ├── value-objects/     # Email VO with validation
│   │   ├── services/          # Merge logic (zero deps)
│   │   └── exceptions/        # Domain exceptions
│   ├── application/
│   │   ├── interfaces/        # Repository contracts (abstract class)
│   │   └── use-cases/         # Business orchestration + health check
│   ├── infrastructure/
│   │   ├── persistence/       # TypeORM (System A)
│   │   └── http/              # HTTP client (System B)
│   └── presentation/
│       ├── controllers/       # REST + health endpoints
│       └── dto/               # Request/response DTOs
├── mock-api/                  # Embedded System B mock
└── shared/                    # Filters, interceptors, constants
```

## Technology Stack

- **NestJS 11** — Framework
- **TypeORM + SQLite** — System A persistence
- **Axios** — System B HTTP client
- **Swagger/OpenAPI** — API documentation (auto-generated)
- **Jest** — Testing (unit + E2E)
- **nestjs-pino** — Structured logging
- **class-validator** — Request validation
