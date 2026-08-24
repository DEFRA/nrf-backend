# Quote database ERD

Entity-relationship diagram of the backend **`nrf_backend`** Postgres database
(schema `public`) — the quote domain.

- **Source:** live `nrf_backend` Postgres instance (`docker compose` service `postgres`), cross-checked against the Liquibase changelog under `backend/changelog/`.
- **Generated:** 2026-08-13
- **Scope:** application domain tables only. Liquibase bookkeeping (`databasechangelog`, `databasechangeloglock`) and the PostGIS reference table (`spatial_ref_sys`) are excluded.

```mermaid
erDiagram
    users ||--o{ quotes : "owns"
    quotes ||--o{ quote_access_tokens : "granted via"
    quotes ||--o{ quote_edp_results : "produces"
    quotes ||--o{ quote_email_notifications : "tracked by"

    users {
        uuid id PK "default gen_random_uuid()"
        citext email UK
        timestamptz created_at "default now()"
    }

    quotes {
        integer id PK "identity"
        varchar reference UK "generated: NRL-NNNNNN"
        uuid user_id FK "nullable"
        varchar planning_type "nullable"
        varchar boundary_entry_type
        geometry boundary_geodata
        varchar boundary_filename "nullable"
        integer residential_building_count "nullable"
        boolean disable_analytics_audit "default false"
        timestamptz created_at
    }

    quote_access_tokens {
        text token_hash PK
        integer quote_id FK
        timestamptz created_at "default now()"
        timestamptz expires_at "default now() + 7 days"
        integer max_sessions "default 5"
        integer session_count "default 0"
        timestamptz first_viewed_at "nullable"
        timestamptz last_viewed_at "nullable"
    }

    quote_edp_results {
        integer id PK "identity"
        integer quote_id FK
        integer edp_id "unique with quote_id"
        varchar edp_name
        varchar edp_type
        numeric levy_gbp_min
        numeric levy_gbp_max
        jsonb impact
        timestamptz created_at "default now()"
        timestamptz updated_at "nullable"
    }

    quote_email_notifications {
        integer id PK "identity"
        integer quote_id FK
        uuid notification_id UK "GOV.UK Notify id"
        varchar email_type "default quote_result"
        varchar status "nullable, GOV.UK Notify delivery status"
        timestamptz status_checked_at "nullable"
        timestamptz sent_at "nullable"
        timestamptz completed_at "nullable"
        timestamptz created_at "default now()"
    }
```

## Tables

| Table                       | Purpose                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `users`                     | Account holders, keyed by UUID and unique (case-insensitive) email.                                                       |
| `quotes`                    | Core quote records: development boundary, type, counts, and the spatial boundary geometry. Optionally linked to a `user`. |
| `quote_access_tokens`       | Hashed access tokens granting time-limited, session-capped access to a quote.                                             |
| `quote_edp_results`         | Per-EDP levy results computed for a quote (unique per `quote_id` + `edp_id`).                                             |
| `quote_email_notifications` | One row per GOV.UK Notify email sent for a quote, holding the Notify id and its polled delivery status.                   |

## Notes

- `quotes.reference` is a generated column (`NRL-` + a hashed, zero-padded id) defined via raw SQL in the Liquibase changelog.
- `quote_access_tokens`, `quote_edp_results` and `quote_email_notifications` foreign keys to `quotes` are `ON DELETE CASCADE`.
- `quotes.user_id` is nullable — a quote can exist without an associated user.
- `quote_email_notifications.notification_id` is unique; a quote accumulates several rows over its lifetime (the initial quote-result send plus any resends, distinguished by `email_type`). `status` is null until the Notify status poller first fetches it.
- This is the backend quote database, not the impact-assessor DB (`nrf_impact`, schema `nrf_reference`).
