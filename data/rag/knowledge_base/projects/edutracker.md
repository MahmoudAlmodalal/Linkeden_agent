# Project Dossier: EduTracker

## Metadata
- **Project Name**: EduTracker (إديوتراكر)
- **Slug**: edutracker
- **Domain**: Multi-Tenant School Operations SaaS
- **Region**: Middle East (40+ Schools across 5 regional districts)
- **Live URL**: https://edutracker.site/
- **Role**: Co-Founder & Principal Backend Developer
- **Scale**: 64 Relational Entities across 15 domain apps, 40+ schools, 665 automated CI tests (green)
- **Tech Stack**: Python, Django, Django REST Framework, PostgreSQL 16, React 19, Celery, Redis, Docker, WeasyPrint

---

## Architecture Overview
EduTracker is an enterprise-grade multi-tenant school operations platform unifying attendance, student registration, tuition and fee collection, messaging, and academic grading. It provides strict tenant isolation across dozens of schools, handles unreliable networks with offline-oriented caching, and compiles heavy district-wide gradebooks asynchronously.

```
[Wildcard DNS *.edutracker.site] ---> [Cloudflare SSL Termination] ---> [Nginx Reverse Proxy]
                                                                                |
                                                      [Django Multi-Tenant Core Engine]
                                                      - Host Header Subdomain Router
                                                      - Row-Level Workstream Policy Filter
                                                                        |
                                         +------------------------------+-----------------------------+
                                         |                                                            |
                                 [PostgreSQL 16]                                              [Celery Worker Pool]
                                 - 64 Relational Entities                                     + Redis Broker
                                 - Scoped work_stream_id                                      - Bulk PDF Gradebooks
                                 - GIN Arabic Search Index                                    - Mass Tuition Billing
```

---

## Architectural Challenges, Dilemmas & Production Solutions

### Challenge 1: Row-Level Multi-Tenancy vs Database-per-Tenant Sprawl
- **The Dilemma**: Orchestrating 40+ schools across multiple districts. Creating a separate PostgreSQL database per tenant would have introduced severe DevOps sprawl, migration overhead across dozens of databases, and resource starvation on container clusters. Conversely, a naive shared database risked disastrous cross-tenant data leaks.
- **The Chosen Solution**: Implemented a shared PostgreSQL database enforced by strict row-level policy scoping layers on `work_stream_id` across all 64 relational entities:
  ```python
  class WorkstreamPolicy:
      @staticmethod
      def scope_queryset(queryset, user):
          if user.is_superuser:
              return queryset
          return queryset.filter(work_stream_id=user.work_stream_id)

  def list_attendances_for_school(user, school_id, date):
      WorkstreamPolicy.verify_school_access(user, school_id)
      return Attendance.objects.filter(
          class_room__school_id=school_id,
          class_room__school__work_stream_id=user.work_stream_id,
          date=date,
          is_active=True
      )
  ```
- **Trade-off**:
  - *Chosen*: Shared database with row-level policy enforcement in Django service layers.
  - *Rejected*: Database-per-tenant architecture with high operational complexity and container bloat.
- **Production Metric**: 100% policy-scoped queries; validated by 665 automated unit and integration tests passing in CI.

### Challenge 2: Origin-Scoped Subdomain Isolation vs Shared Global Cookie Bleeding
- **The Dilemma**: Tenants access the platform via customized subdomains (e.g. `al-huda.edutracker.site`). Storing authentication tokens in global cookies spanning all subdomains (`.edutracker.site`) exposed the system to cross-tenant privilege escalation or session hijacking between rival institutions.
- **The Chosen Solution**: Combined wildcard DNS host header resolution with client-side origin-scoped `sessionStorage` for JWT tokens.
  - Subdomain resolution SLA: Host header inspection resolves tenant identity in P95 < 2.8ms.
  - A user authenticated in `school-a.edutracker.site` cannot send credentials to `school-b.edutracker.site` because the browser's origin boundary strictly isolates storage.
- **Trade-off**:
  - *Chosen*: Subdomain DNS with origin-scoped sessionStorage JWTs.
  - *Rejected*: Global SSO cookies shared across the root domain.
- **Production Metric**: Zero cross-tenant session bleeding or token leakage across all 40 institutional instances.

### Challenge 3: Asynchronous District Gradebook Compilation vs Gateway Timeouts
- **The Dilemma**: At the end of academic semesters, school administrators generate hundreds of detailed student gradebook PDFs simultaneously. Synchronously compiling student grades, attendance, and tuition balances over HTTP caused 504 Gateway Timeouts and blocked the web server event loop.
- **The Chosen Solution**: Offloaded heavy report generation to a dedicated Celery worker pool backed by Redis.
  - Generation requests return an immediate HTTP 202 Accepted with a task UUID.
  - Dedicated Celery queues (`reports`, `billing`) compile WeasyPrint PDFs with exponential backoff retries and notify the user via WebSockets when ready for download.
- **Trade-off**:
  - *Chosen*: Celery worker pool with Redis queue segregation.
  - *Rejected*: Synchronous HTTP request processing.
- **Production Metric**: Zero HTTP gateway timeouts during peak semester-end report compilation.
