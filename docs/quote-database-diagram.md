# Quote database ERD

Entity-relationship diagram of the backend **`nrf_backend`** Postgres database
(schema `public`) — the quote domain.

- **Source:** live `nrf_backend` Postgres instance (`docker compose` service `postgres`), cross-checked against the Liquibase changelog under `backend/changelog/`.
- **Generated:** 2026-06-19
- **Scope:** application domain tables only. Liquibase bookkeeping (`databasechangelog`, `databasechangeloglock`) and the PostGIS reference table (`spatial_ref_sys`) are excluded.

```mermaid
erDiagram
    users ||--o{ quotes : "owns"
    quotes ||--o{ quote_access_tokens : "granted via"
    quotes ||--o{ quote_edp_results : "produces"

    users {
        uuid id PK "gen_random_uuid()"
        citext email UK
        timestamptz created_at
    }

    quotes {
        integer id PK "identity"
        varchar reference UK "generated: NRF-NNNNNN"
        varchar boundary_entry_type
        text_array development_types "text[]"
        integer residential_building_count "nullable"
        integer people_count "nullable"
        geometry boundary_geodata
        timestamptz created_at
        timestamptz email_send_request_at "nullable"
        varchar waste_water_treatment_works_id "nullable"
        varchar waste_water_treatment_works_name "nullable"
        varchar boundary_filename "nullable"
        uuid user_id FK "nullable"
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
        timestamptz created_at "default now()"
        integer quote_id FK
        integer edp_id
        varchar edp_name
        varchar edp_type
        numeric levy_gbp_min
        numeric levy_gbp_max
        jsonb impact
        timestamptz updated_at "nullable"
    }
```

## Tables

| Table                 | Purpose                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `users`               | Account holders, keyed by UUID and unique (case-insensitive) email.                                                       |
| `quotes`              | Core quote records: development boundary, type, counts, and the spatial boundary geometry. Optionally linked to a `user`. |
| `quote_access_tokens` | Hashed access tokens granting time-limited, session-capped access to a quote.                                             |
| `quote_edp_results`   | Per-EDP levy results computed for a quote (unique per `quote_id` + `edp_id`).                                             |

## Notes

- `quotes.reference` is a generated column (`NRF-` + a hashed, zero-padded id) defined via raw SQL in the Liquibase changelog.
- `quote_access_tokens` and `quote_edp_results` foreign keys to `quotes` are `ON DELETE CASCADE`.
- `quotes.user_id` is nullable — a quote can exist without an associated user.
- This is the backend quote database, not the impact-assessor DB (`nrf_impact`, schema `nrf_reference`).
