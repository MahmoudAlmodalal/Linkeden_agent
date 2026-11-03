# Project Dossier: 2Wash

## Metadata
- **Project Name**: 2Wash (تو واش)
- **Slug**: 2wash
- **Domain**: On-demand car care marketplace & Partner SaaS
- **Region**: Saudi Arabia (Riyadh & Jeddah)
- **Live URL**: https://2wash.app/
- **Role**: Backend Engineer & Systems Architect
- **Scale**: 20+ Partner Service Centers, 500+ commercial bookings
- **Tech Stack**: Python, Django REST Framework, Next.js, PostgreSQL 15, PostGIS, Redis 7, Celery, TypeScript

---

## Architecture Overview
2Wash is a bilingual on-demand car care marketplace connecting vehicle owners with partner service centers across Saudi Arabia. It features customer OTP mobile authentication, high-throughput geospatial center discovery, real-time physical wash bay queueing via Finite State Machines (FSM), and automated asynchronous partner financial settlements.

```
[Customer PWA / Next.js] ---> [Nginx / Cloudflare Ingress] ---> [Django REST API Core]
                                                                        |
                                         +------------------------------+-----------------------------+
                                         |                              |                             |
                                 [PostgreSQL 15]                  [Redis 7 Cluster]             [Celery Workers]
                                 + PostGIS Spatial                - Distributed Locks           - Async Settlements
                                 - GiST Index              - Bay Queue TTL               - Bank Payouts
```

---

## Architectural Challenges, Dilemmas & Production Solutions

### Challenge 1: Sub-100ms Geospatial Hub Lookup at Scale
- **The Dilemma**: When a customer requests car care, the system must search all partner service centers whose dynamic service radius polygon encompasses the customer's coordinates. In-memory Haversine distance filtering on unindexed rows quickly caused latency spikes and CPU throttling under high concurrent searches.
- **The Chosen Solution**: Integrated PostgreSQL `postgis` extension with `ST_DWithin` spatial operators evaluated directly against spatial geometries indexed with GiST indexes:
  ```sql
  CREATE INDEX idx_partner_centers_location_gist ON partner_centers USING GIST (location);
  
  SELECT id, name, commission_rate,
         ST_Distance(location, ST_SetSRID(ST_MakePoint(46.6753, 24.7136), 4326)::geography) AS distance_meters
  FROM partner_centers
  WHERE is_active = TRUE
    AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(46.6753, 24.7136), 4326)::geography, service_radius_m)
  ORDER BY distance_meters ASC
  LIMIT 1;
  ```
- **Trade-off**:
  - *Chosen*: PostGIS Spatial Indexing (`ST_DWithin` + GIST) achieving P95 < 12ms.
  - *Rejected*: In-memory Haversine filtering on unindexed database rows.
- **Production Metric**: Spatial lookup P95 latency dropped from 340ms to 11.4ms.

### Challenge 2: Zero Double-Booking in Physical Wash Bays (High Concurrency Clashes)
- **The Dilemma**: During peak hours in Riyadh, multiple vehicle owners frequently selected the same available bay at a partner center simultaneously. Relying on optimistic database checks or late application-layer validations resulted in race conditions, double-bookings, and physical operational chaos at the center.
- **The Chosen Solution**: A two-tiered locking pattern combining atomic Redis distributed locks with database row locks:
  1. Acquire an atomic distributed lock in Redis with a 180-second TTL during payment authorization: `SET lock:bay:{bay_id} {customer_id} NX PX 180000`.
  2. If the customer abandons the checkout or payment gateway times out, the Redis lock auto-expires, restoring bay availability immediately without manual intervention.
  3. Upon payment capture, a database row-level lock (`SELECT ... FOR UPDATE`) finalizes the booking in a transactional ACID block.
- **Trade-off**:
  - *Chosen*: Redis Atomic Lock (`SET NX PX`) + `SELECT FOR UPDATE`.
  - *Rejected*: Optimistic timestamp checks with late rollback after payment capture.
- **Production Metric**: Zero concurrency clashes or double-bookings across 500+ commercial transactions.

### Challenge 3: Idempotent Automated Financial Settlements
- **The Dilemma**: Upon service completion, the platform must split the gross service revenue between the partner's share and platform commission fees, then queue partner payouts. Network retries, Celery worker restarts, or webhook duplicates risked issuing duplicate payouts to partner bank accounts.
- **The Chosen Solution**: Decoupled financial settlement ledger with strict database idempotency keys executed asynchronously via Celery:
  ```sql
  INSERT INTO partner_settlements (
    id, partner_id, booking_id, gross_sar, platform_fee_sar, partner_net_sar, idempotency_key
  ) VALUES (
    gen_random_uuid(), 'p-012', 'c74a9-8812', 120.00, 18.00, 102.00, 'IDEMP-2WASH-c74a9-8812-COMPLETED'
  ) ON CONFLICT (booking_id) DO NOTHING;
  ```
- **Trade-off**:
  - *Chosen*: Asynchronous Celery worker with unique idempotency ledger constraints.
  - *Rejected*: Synchronous HTTP webhooks during customer checkout.
- **Production Metric**: 100% financial ledger reconciliation accuracy; zero duplicate payouts.
