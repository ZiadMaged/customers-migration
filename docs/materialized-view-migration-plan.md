# Future Implementation Plan: Materialized View + Event-Driven Architecture with Kafka
 
**Supersedes:** Current cache-aside / read-time merge architecture

---

## 1. Executive Summary

This document outlines the migration plan from the current **read-time merge** architecture (query both systems on every request) to a **materialized view** architecture powered by an **event-driven pipeline using Apache Kafka**. The goal is to eliminate per-request dual lookups, reduce response latency, and enable near-real-time synchronization between System A and System B.

### Current vs. Target Architecture

```
CURRENT (Read-Time Merge):
  Client → API → [System A query + System B query] → Merge → Response
  Latency: ~200-500ms (bounded by slowest system)

TARGET (Materialized View):
  Client → API → [Local Materialized View query] → Response
  Latency: ~5-20ms (single local read)
  Background: System A/B → Kafka → Sync Worker → Materialized View
```

---

## 2. Architecture Overview

### 2.1 High-Level Diagram

```
┌──────────────┐          ┌──────────────┐
│  System A    │          │  System B    │
│  (SQLite)    │          │  (REST API)  │
└──────┬───────┘          └──────┬───────┘
       │                         │
       │  CDC (Debezium)         │  Polling Connector
       │                         │
       ▼                         ▼
┌──────────────────────────────────────────┐
│              Apache Kafka                 │
│                                          │
│  Topics:                                 │
│    • customer.changes.system-a           │
│    • customer.changes.system-b           │
│    • customer.merged (compacted)         │
│    • customer.dlq (dead letter)          │
└──────────────────┬───────────────────────┘
                   │
                   ▼
          ┌────────────────┐
          │  Sync Worker   │
          │  (Consumer)    │
          │                │
          │  • Consumes    │
          │  • Merges      │
          │  • Writes MV   │
          └────────┬───────┘
                   │
                   ▼
          ┌────────────────┐
          │  Materialized  │
          │  View (DB)     │
          │  (PostgreSQL)  │
          └────────┬───────┘
                   │
                   ▼
          ┌────────────────┐
          │  Customer API  │
          │  (NestJS)      │
          │  Single-read   │
          └────────────────┘
```

### 2.2 Component Responsibilities

| Component | Technology | Purpose |
|-----------|-----------|---------|
| CDC Connector | Debezium + Kafka Connect | Captures row-level changes from System A |
| Polling Connector | Custom NestJS worker | Polls System B API for changes periodically |
| Kafka Cluster | Apache Kafka (3 brokers) | Event streaming and decoupling |
| Sync Worker | NestJS Microservice | Consumes events, applies merge logic, writes materialized view |
| Materialized View | PostgreSQL | Pre-merged customer data for fast reads |
| Customer API | NestJS (existing) | Reads from materialized view instead of querying both systems |

---

## 3. Implementation Phases

### Phase 1: Infrastructure Setup (Week 1-2)

#### 3.1.1 Kafka Cluster Provisioning

```yaml
# docker-compose.kafka.yml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka-1:
    image: confluentinc/cp-kafka:7.6.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092
      KAFKA_NUM_PARTITIONS: 6
      KAFKA_DEFAULT_REPLICATION_FACTOR: 2
      KAFKA_LOG_RETENTION_HOURS: 168  # 7 days

  kafka-2:
    image: confluentinc/cp-kafka:7.6.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9092

  schema-registry:
    image: confluentinc/cp-schema-registry:7.6.0
    depends_on: [kafka-1]
    environment:
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:9092
```

#### 3.1.2 Topic Configuration

```bash
# Customer change events — partitioned by email for ordering guarantees
kafka-topics --create --topic customer.changes.system-a \
  --partitions 6 --replication-factor 2 \
  --config cleanup.policy=delete --config retention.ms=604800000

kafka-topics --create --topic customer.changes.system-b \
  --partitions 6 --replication-factor 2 \
  --config cleanup.policy=delete --config retention.ms=604800000

# Merged view — compacted topic (keeps latest state per key)
kafka-topics --create --topic customer.merged \
  --partitions 6 --replication-factor 2 \
  --config cleanup.policy=compact --config min.cleanable.dirty.ratio=0.3

# Dead letter queue for failed events
kafka-topics --create --topic customer.dlq \
  --partitions 1 --replication-factor 2 \
  --config retention.ms=2592000000  # 30 days
```

**Partitioning strategy:** Use `customer email` as the partition key. This guarantees that all events for the same customer are processed in order within a single partition.

#### 3.1.3 PostgreSQL Materialized View Schema

```sql
CREATE TABLE unified_customers (
  email            VARCHAR(255) PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  address          TEXT,
  phone            VARCHAR(50),
  contract_start   DATE,
  contract_type    VARCHAR(50),

  -- Identifiers from both systems
  system_a_id      VARCHAR(50),
  system_b_uuid    UUID,

  -- Source tracking
  sources          JSONB NOT NULL DEFAULT '[]',
  is_partial       BOOLEAN NOT NULL DEFAULT false,
  conflicts        JSONB NOT NULL DEFAULT '{}',
  field_metadata   JSONB NOT NULL DEFAULT '{}',

  -- Versioning
  version          BIGINT NOT NULL DEFAULT 1,
  last_merged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  system_a_updated TIMESTAMPTZ,
  system_b_updated TIMESTAMPTZ,

  -- Indexing
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for search and lookup
CREATE INDEX idx_unified_name ON unified_customers USING gin (name gin_trgm_ops);
CREATE INDEX idx_unified_sources ON unified_customers USING gin (sources);
CREATE INDEX idx_unified_last_merged ON unified_customers (last_merged_at);
```

---

### Phase 2: Change Data Capture — System A (Week 2-3)

#### 3.2.1 Debezium Connector for System A

When System A is migrated from SQLite to PostgreSQL (required for CDC), deploy a Debezium connector:

```json
{
  "name": "system-a-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "system-a-db",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${DEBEZIUM_PASSWORD}",
    "database.dbname": "system_a",
    "table.include.list": "public.customers_a",
    "topic.prefix": "customer.changes",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": ".*",
    "transforms.route.replacement": "customer.changes.system-a",
    "slot.name": "system_a_cdc_slot",
    "publication.name": "system_a_publication"
  }
}
```

#### 3.2.2 Event Schema (System A)

```typescript
interface SystemAChangeEvent {
  eventId: string;          // UUID — idempotency key
  source: 'system_a';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  timestamp: string;        // ISO 8601
  payload: {
    email: string;          // Partition key
    id: string;
    name: string;
    address: string;
    contractStartDate: string | null;
    contractType: string | null;
    lastUpdated: string;
  };
  before?: Record<string, unknown>;  // Previous state (for UPDATEs)
}
```

#### 3.2.3 SQLite Interim Solution

Since SQLite doesn't support CDC natively, use a **polling-based approach** until System A migrates to PostgreSQL:

```typescript
// src/infrastructure/kafka/producers/system-a-poller.service.ts
@Injectable()
export class SystemAPollerService implements OnModuleInit {
  private lastPolledAt: Date = new Date(0);

  @Cron('*/5 * * * *')  // Every 5 min
  async pollChanges(): Promise<void> {
    const changes = await this.systemARepo
      .createQueryBuilder('c')
      .where('c.lastUpdated > :since', { since: this.lastPolledAt })
      .getMany();

    for (const customer of changes) {
      await this.kafkaProducer.send({
        topic: 'customer.changes.system-a',
        messages: [{
          key: customer.email,
          value: JSON.stringify({
            eventId: randomUUID(),
            source: 'system_a',
            operation: 'UPDATE',
            timestamp: new Date().toISOString(),
            payload: CustomerAMapper.toEvent(customer),
          }),
        }],
      });
    }

    this.lastPolledAt = new Date();
  }
}
```

---

### Phase 3: Change Data Capture — System B (Week 3-4)

#### 3.3.1 Polling-Based Event Producer

System B is an external REST API we do not control, so we use a **polling-based approach** to detect changes and publish them as events to Kafka. The poller queries System B for records updated since the last poll cycle and produces a change event for each modified customer.

```typescript
// src/infrastructure/kafka/producers/system-b-poller.service.ts
@Injectable()
export class SystemBPollerService implements OnModuleInit {
  private lastPolledAt: Date = new Date(0);

  constructor(
    private readonly httpService: HttpService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    // On startup, initialize from the last known checkpoint (persisted in Redis/DB)
    // to avoid re-processing the full history after a restart.
    this.loadCheckpoint();
  }

  @Cron('*/5 * * * *')  // Every 5 minutes
  async pollChanges(): Promise<void> {
    const response = await this.httpService
      .get('/customers', { params: { updatedSince: this.lastPolledAt.toISOString() } })
      .toPromise();

    if (!response.data.length) {
      this.logger.debug('System B poll: no changes since ' + this.lastPolledAt.toISOString());
      return;
    }

    for (const customer of response.data) {
      await this.kafkaProducer.send({
        topic: 'customer.changes.system-b',
        messages: [{
          key: customer.email,
          value: JSON.stringify({
            eventId: randomUUID(),
            source: 'system_b',
            operation: 'UPDATE',
            timestamp: customer.updatedAt,
            payload: CustomerBMapper.toEvent(customer),
          }),
        }],
      });
    }

    this.lastPolledAt = new Date();
    await this.saveCheckpoint(this.lastPolledAt);

    this.logger.log(`System B poll: published ${response.data.length} change events`);
  }

  private async loadCheckpoint(): Promise<void> {
    // Load last poll timestamp from Redis or database to survive restarts
    const saved = await this.checkpointStore.get('system-b-poller');
    if (saved) this.lastPolledAt = new Date(saved);
  }

  private async saveCheckpoint(timestamp: Date): Promise<void> {
    await this.checkpointStore.set('system-b-poller', timestamp.toISOString());
  }
}
```

#### 3.3.2 Event Schema (System B)

```typescript
interface SystemBChangeEvent {
  eventId: string;          // UUID — idempotency key
  source: 'system_b';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  timestamp: string;        // ISO 8601
  payload: {
    email: string;          // Partition key
    uuid: string;
    name: string;
    address: string;
    phone: string | null;
    lastUpdated: string;
  };
}
```

#### 3.3.3 Design Considerations

- **Why polling over webhooks:** System B is an external API we do not control. We cannot guarantee webhook support, endpoint registration, or signature verification. Polling keeps the integration entirely within our boundary and avoids a dependency on System B's notification infrastructure.
- **Poll interval:** 5 minutes balances freshness against API rate limits. Since System B updates near-real-time but our materialized view tolerates sub-minute staleness, this is acceptable. The interval can be tuned via configuration.
- **Checkpoint persistence:** The `lastPolledAt` timestamp is persisted to Redis so that restarts do not trigger a full re-poll. On first boot (no checkpoint), the poller processes all records as an implicit backfill.
- **Idempotency:** Each event carries a `randomUUID()` as its `eventId`. The downstream sync worker deduplicates via the Redis-backed `DeduplicationStore` (see Phase 4).

---

### Phase 4: Sync Worker — Kafka Consumer (Week 4-5)

#### 3.4.1 Consumer Service

```typescript
// src/infrastructure/kafka/consumers/sync-worker.service.ts
@Injectable()
export class SyncWorkerService {
  constructor(
    private readonly mergeService: CustomerMergeService,
    private readonly materializedViewRepo: MaterializedViewRepository,
    private readonly dedupStore: DeduplicationStore,
  ) {}

  @KafkaListener({
    topics: ['customer.changes.system-a', 'customer.changes.system-b'],
    groupId: 'sync-worker-group',
  })
  async handleChangeEvent(message: KafkaMessage): Promise<void> {
    const event: ChangeEvent = JSON.parse(message.value.toString());

    // Step 1: Idempotency check
    if (await this.dedupStore.hasProcessed(event.eventId)) {
      return; // Already processed
    }

    // Step 2: Fetch current state from both systems
    const [systemA, systemB] = await Promise.allSettled([
      this.systemARepo.findByEmail(event.payload.email),
      this.systemBClient.findByEmail(event.payload.email),
    ]);

    const customerA = systemA.status === 'fulfilled' ? systemA.value : null;
    const customerB = systemB.status === 'fulfilled' ? systemB.value : null;

    // Step 3: Apply merge logic (reuse existing domain service)
    if (!customerA && !customerB) {
      // Customer deleted from both systems — remove from MV
      await this.materializedViewRepo.delete(event.payload.email);
    } else {
      const merged = this.mergeService.merge(customerA, customerB);
      await this.materializedViewRepo.upsert(merged);
    }

    // Step 4: Publish to compacted topic for downstream consumers
    await this.kafkaProducer.send({
      topic: 'customer.merged',
      messages: [{
        key: event.payload.email,
        value: JSON.stringify(merged),
      }],
    });

    // Step 5: Mark as processed
    await this.dedupStore.markProcessed(event.eventId);
  }
}
```

#### 3.4.2 Error Handling & Dead Letter Queue

```typescript
@Injectable()
export class SyncWorkerErrorHandler {
  private readonly MAX_RETRIES = 3;

  async handleWithRetry(message: KafkaMessage): Promise<void> {
    let attempt = 0;
    while (attempt < this.MAX_RETRIES) {
      try {
        await this.syncWorker.handleChangeEvent(message);
        return;
      } catch (error) {
        attempt++;
        if (attempt >= this.MAX_RETRIES) {
          // Send to DLQ after exhausting retries
          await this.kafkaProducer.send({
            topic: 'customer.dlq',
            messages: [{
              key: message.key,
              value: JSON.stringify({
                originalTopic: message.topic,
                originalMessage: message.value.toString(),
                error: error.message,
                failedAt: new Date().toISOString(),
                attempts: attempt,
              }),
            }],
          });
          this.logger.error(
            `Event sent to DLQ after ${attempt} attempts: ${error.message}`,
          );
        }
        // Exponential backoff
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
}
```

#### 3.4.3 Idempotency Store

```typescript
// Redis-based deduplication
@Injectable()
export class DeduplicationStore {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async hasProcessed(eventId: string): Promise<boolean> {
    return (await this.redis.exists(`dedup:${eventId}`)) === 1;
  }

  async markProcessed(eventId: string): Promise<void> {
    // TTL of 7 days — matches Kafka retention
    await this.redis.set(`dedup:${eventId}`, '1', 'EX', 7 * 24 * 3600);
  }
}
```

---

### Phase 5: API Layer Migration (Week 5-6)

#### 3.5.1 Switch Read Path to Materialized View

The existing use cases change from dual-query to single-read:

```typescript
// BEFORE: Get customer by email (current)
async execute(email: string): Promise<UnifiedCustomerOutput> {
  const [resultA, resultB] = await Promise.allSettled([
    this.systemA.findByEmail(email),
    this.systemB.findByEmail(email),
  ]);
  return this.mergeService.merge(customerA, customerB);
}

// AFTER: Get customer by email (materialized view)
async execute(email: string): Promise<UnifiedCustomerOutput> {
  const customer = await this.materializedViewRepo.findByEmail(email);
  if (!customer) throw new CustomerNotFoundException(email);
  return customer;
}
```

#### 3.5.2 Feature Flag for Gradual Rollout

Run both paths in parallel during migration:

```typescript
@Injectable()
export class GetCustomerByEmailUseCase {
  async execute(email: string): Promise<UnifiedCustomerOutput> {
    if (this.featureFlags.isEnabled('use-materialized-view')) {
      return this.readFromMaterializedView(email);
    }
    return this.readFromBothSystems(email);  // Current behavior
  }
}
```

#### 3.5.3 Shadow Mode Validation

Before fully switching, run both paths and compare:

```typescript
async executeWithShadowValidation(email: string): Promise<UnifiedCustomerOutput> {
  const [mvResult, liveResult] = await Promise.allSettled([
    this.readFromMaterializedView(email),
    this.readFromBothSystems(email),
  ]);

  // Log discrepancies without affecting the response
  if (mvResult.status === 'fulfilled' && liveResult.status === 'fulfilled') {
    const diff = this.compareResults(mvResult.value, liveResult.value);
    if (diff.hasDifferences) {
      this.logger.warn('MV/Live mismatch detected', { email, diff });
      this.metrics.increment('mv.shadow.mismatch');
    }
  }

  // Return live result during shadow period
  return liveResult.status === 'fulfilled'
    ? liveResult.value
    : mvResult.value;
}
```

---

### Phase 6: Monitoring & Observability (Week 6-7)

#### 3.6.1 Kafka Metrics

| Metric | Alert Threshold | Purpose |
|--------|-----------------|---------|
| `kafka.consumer.lag` | > 10,000 messages | Sync worker falling behind |
| `kafka.consumer.lag.seconds` | > 60s | Stale materialized view |
| `kafka.dlq.messages.total` | > 0 (alert on any) | Failed event processing |
| `kafka.producer.errors.total` | > 5/min | CDC pipeline broken |

#### 3.6.2 Materialized View Metrics

| Metric | Alert Threshold | Purpose |
|--------|-----------------|---------|
| `mv.staleness.seconds` | > 120s | View not being updated |
| `mv.shadow.mismatch.rate` | > 5% | View diverging from live |
| `mv.query.latency.p99` | > 50ms | Read performance regression |
| `mv.record.count` | Anomaly detection | Unexpected deletes or duplicates |

#### 3.6.3 Grafana Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│                  Kafka Pipeline Health               │
│  [Consumer Lag]  [Throughput/s]  [DLQ Depth]        │
├───────────────────────┬─────────────────────────────┤
│  System A CDC         │  System B Connector          │
│  [Events/s] [Errors]  │  [Events/s] [Poll Latency]  │
├───────────────────────┴─────────────────────────────┤
│              Materialized View                       │
│  [Staleness]  [Record Count]  [Query Latency P99]   │
├─────────────────────────────────────────────────────┤
│              Shadow Validation                       │
│  [Mismatch Rate]  [Comparison Count]  [Diff Log]    │
└─────────────────────────────────────────────────────┘
```

---

## 4. Data Migration: Initial Backfill

Before switching reads to the materialized view, backfill all existing records:

```typescript
@Injectable()
export class BackfillService {
  async backfillAll(): Promise<BackfillReport> {
    const allSystemA = await this.systemARepo.findAll();
    const allSystemB = await this.systemBClient.fetchAll();

    // Build email index
    const allEmails = new Set([
      ...allSystemA.map(c => c.email),
      ...allSystemB.map(c => c.email),
    ]);

    let merged = 0, failed = 0;
    for (const email of allEmails) {
      try {
        const a = allSystemA.find(c => c.email === email) ?? null;
        const b = allSystemB.find(c => c.email === email) ?? null;
        const result = this.mergeService.merge(a, b);
        await this.materializedViewRepo.upsert(result);
        merged++;
      } catch (error) {
        this.logger.error(`Backfill failed for ${email}`, error);
        failed++;
      }
    }

    return { total: allEmails.size, merged, failed };
  }
}
```

---

## 5. Updated docker-compose for Full Stack

```yaml
# docker-compose.full.yml
services:
  # Existing
  customers-service:
    build: .
    ports: ["3000:3000"]
    environment:
      - USE_MATERIALIZED_VIEW=true
      - KAFKA_BROKERS=kafka-1:9092,kafka-2:9092
      - POSTGRES_URL=postgresql://app:password@postgres:5432/unified
      - REDIS_URL=redis://redis:6379
    depends_on: [postgres, kafka-1, redis]

  # New infrastructure
  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka-1:
    image: confluentinc/cp-kafka:7.6.0
    depends_on: [zookeeper]
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092

  kafka-2:
    image: confluentinc/cp-kafka:7.6.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9092

  schema-registry:
    image: confluentinc/cp-schema-registry:7.6.0
    depends_on: [kafka-1]
    ports: ["8081:8081"]
    environment:
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:9092

  kafka-connect:
    image: confluentinc/cp-kafka-connect:7.6.0
    depends_on: [kafka-1, schema-registry]
    ports: ["8083:8083"]
    environment:
      CONNECT_BOOTSTRAP_SERVERS: kafka-1:9092
      CONNECT_GROUP_ID: connect-cluster
      CONNECT_KEY_CONVERTER: org.apache.kafka.connect.json.JsonConverter
      CONNECT_VALUE_CONVERTER: org.apache.kafka.connect.json.JsonConverter

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: unified
      POSTGRES_USER: app
      POSTGRES_PASSWORD: password
    volumes:
      - pg-data:/var/lib/postgresql/data
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    depends_on: [kafka-1]
    ports: ["8080:8080"]
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:9092

volumes:
  pg-data:
```

---

## 6. NestJS Module Changes

### 6.1 New Dependencies

```bash
npm install @nestjs/microservices kafkajs
npm install @nestjs/typeorm pg          # Switch from SQLite to PostgreSQL
npm install ioredis @nestjs-modules/ioredis
npm install @nestjs/schedule            # For polling connectors
```

### 6.2 New Module Structure

```
src/
├── customer/
│   ├── domain/                         # UNCHANGED — merge logic stays pure
│   ├── application/
│   │   ├── interfaces/
│   │   │   ├── customer-repository.interface.ts    # Existing
│   │   │   └── materialized-view.interface.ts      # NEW
│   │   └── use-cases/                  # Updated to read from MV
│   ├── infrastructure/
│   │   ├── persistence/                # Existing System A repo
│   │   ├── http/                       # Existing System B client
│   │   ├── kafka/                      # NEW
│   │   │   ├── producers/
│   │   │   │   ├── system-a-poller.service.ts
│   │   │   │   └── system-b-poller.service.ts
│   │   │   ├── consumers/
│   │   │   │   └── sync-worker.service.ts
│   │   │   └── kafka.module.ts
│   │   ├── materialized-view/          # NEW
│   │   │   ├── materialized-view.repository.ts
│   │   │   └── materialized-view.module.ts
│   │   └── redis/                      # NEW
│   │       └── deduplication.store.ts
│   └── presentation/                   # UNCHANGED
```

**Key principle:** The domain layer (`CustomerMergeService`) remains completely unchanged. The merge logic is reused in the sync worker — it was already pure business logic with zero framework dependencies.

---

## 7. Rollback Plan

If the materialized view pipeline shows issues:

1. **Flip feature flag** `use-materialized-view` → `false` to revert to live dual-query
2. Stop Kafka consumers (sync workers) to halt writes to the MV
3. Investigate via DLQ messages and Kafka UI
4. Fix and replay failed events from the Kafka topics (events retained for 7 days)

The current read-time merge code remains in the codebase throughout migration and serves as the fallback path.

---

## 8. Timeline Summary

| Phase | Description | Duration | Dependencies |
|-------|-------------|----------|-------------|
| 1 | Infrastructure setup (Kafka, PostgreSQL, Redis) | 2 weeks | DevOps approval |
| 2 | System A CDC / polling producer | 1 week | Phase 1 |
| 3 | System B polling producer | 1 week | Phase 1 |
| 4 | Sync worker (consumer + merge + MV write) | 2 weeks | Phase 2, 3 |
| 5 | API migration + shadow validation | 1 week | Phase 4 + backfill |
| 6 | Monitoring, alerting, Grafana dashboards | 1 week | Phase 4 |
| 7 | Shadow validation period | 2 weeks | Phase 5, 6 |
| 8 | Full cutover + deprecate live merge | 1 week | Phase 7 success |

**Total estimated timeline: 8-10 weeks**

---

## 9. Success Criteria

- [ ] Consumer lag < 5 seconds during normal operation
- [ ] Zero DLQ messages over 7-day shadow period
- [ ] Shadow mismatch rate < 0.1%
- [ ] API P99 latency reduced from ~400ms to < 30ms
- [ ] All existing unit and E2E tests continue to pass
- [ ] Backfill completes with 0 failures
