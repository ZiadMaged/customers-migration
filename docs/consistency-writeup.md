# Consistency Model: Unified Customer Service

## Current State — Eventual Consistency via Read-Time Merge

The Unified Customer Service operates with **eventual consistency** by design. Each upstream system (A and B) is the authoritative source for its own data, and consistency between them is observed — not enforced — at read time.

```
System A (SQLite)  ──┐
                     ├──→  Merge Service  ──→  Unified View
System B (REST API) ─┘
```

### What this means in practice

1. **No shared write model.** The service is read-only — it never writes back to System A or B.
2. **Conflicts are detected, not resolved.** The `POST /customer/sync` endpoint surfaces field-level conflicts with `newerSource` metadata, but does not autonomously overwrite either system.
3. **Data freshness = min(System A freshness, System B freshness).** Since System A updates nightly via batch and System B updates near-real-time, the merged view is only as fresh as the stalest source.

### Consistency guarantees

| Guarantee | Status |
|-----------|--------|
| Read-your-writes (within one system) | ✅ Inherited from each system |
| Read-your-writes (across systems) | ❌ A write in System B won't appear in System A until its next batch |
| Monotonic reads | ✅ Within a single request — both systems queried at the same logical time |
| Conflict detection | ✅ Deterministic field-by-field diff with `lastUpdated` comparison |
| Conflict resolution | ⚠️ Automated via priority rules (merge); manual via sync endpoint |

---

## Production Evolution — Achieving Stronger Consistency

If the system evolves from read-only observation to write-back synchronization, several approaches become relevant:

### Option 1: Event-Driven Synchronization (Recommended)

```
System A  ──→  Polling  ──→  Kafka  ──→  Sync Worker  ──→  System B
System B  ──→  Polling  ──→  Kafka  ──→  Sync Worker  ──→  System A
```

**How it works:**
- **Change Data Capture (Polling)** on System A's SQLite/PostgreSQL detects row-level changes and publishes them to a Kafka topic (`customer.changes.system-a`).
- **System B** emits webhooks (or is polled) for changes, published to `customer.changes.system-b`.
- A **Sync Worker** consumes both topics, applies merge rules, and writes back to the other system.

**Consistency properties:**
- **Eventual consistency** with configurable lag (sub-second with Kafka, minutes with polling).
- **Ordering** guaranteed within a partition (partition by customer email as key).
- **Idempotency** — each event carries a version/timestamp; the worker skips stale updates.
- **Dead-letter queue (DLQ)** for events that fail repeatedly (schema mismatch, system down).

**Why Kafka over RabbitMQ?**
- Kafka retains events — useful for replaying history and building new consumers.
- Topic compaction gives the latest state per key, ideal for customer records.
- Kafka Connect + Debezium provides out-of-the-box CDC without custom triggers.

### Option 2: Two-Phase Commit (2PC)

```
Coordinator  ──→  Prepare(A)  ──→  Prepare(B)  ──→  Commit(A) + Commit(B)
```

**Trade-offs:**
- ✅ Strong consistency — both systems agree before either commits.
- ❌ **Distributed locking** — holds locks across network boundaries, increasing latency.
- ❌ **Availability sacrifice** — if either system is unreachable, the entire write blocks (violates partition tolerance per CAP theorem).
- ❌ **Not practical** when System B is an external API we don't control — external APIs don't implement XA/2PC protocols.

**Verdict:** 2PC is unsuitable for this use case. System B is an external service, and the priority is availability over strict consistency.

---

## Monitoring & Observability

To track consistency health in production:

| Metric | Purpose |
|--------|---------|
| `sync.conflicts.total` | Counter of detected conflicts per interval |
| `sync.lag.seconds` | Time between source change and merged view update |
| `sync.partial_results.total` | Counter of degraded responses (one system down) |
| `system_b.latency.p99` | Detect System B degradation before timeout |
| `sync.dlq.depth` | Dead-letter queue depth — rising means persistent failures |

An **alert** on `sync.partial_results.total` sustained above threshold indicates a system outage requiring attention.

---

## Summary

| Approach | Consistency | Availability | Complexity | Fit for this use case |
|----------|-------------|-------------|------------|----------------------|
| Read-time merge (current) | Eventual | High | Low | ✅ Current |
| Kafka CDC + Sync Worker | Eventual (sub-second) | High | Medium | ✅ Recommended next step |
| Saga (orchestrated) | Eventual (bounded) | High | Medium-High | ✅ If write-back needed |
| 2PC | Strong | Low | High | ❌ Not feasible |

The current implementation is deliberately simple — it maximizes availability and demonstrates the merge semantics. The path to stronger consistency is well-defined and incremental: add CDC, add Kafka, add a sync worker. Each step is additive, not a rewrite.

