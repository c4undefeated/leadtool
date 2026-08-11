No migrations are committed yet. The schema was developed and verified
against SQLite during initial V1 development; it has since been switched
to the `postgresql` provider for Supabase (see schema.prisma) but has not
been run against a real Postgres instance from this session — Supabase
project provisioning wasn't available here (see main README).

First step once `DATABASE_URL` / `DIRECT_URL` point at a real Supabase
project:

    npx prisma migrate dev --name init

That generates and applies the actual initial migration SQL against the
real database, which is safer than hand-authoring Postgres DDL that was
never run against a live Postgres engine.
