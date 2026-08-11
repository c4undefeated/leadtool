`20260811_init` is applied — for real, live-verified, not a guess. It was
generated from `prisma/schema.prisma` via `prisma migrate diff
--from-empty`, then applied to the `intentscout` Supabase project
(`dalywukhftxlopskrtaq`) through the Supabase connector's `apply_migration`,
and verified afterward with `list_tables`. The `_prisma_migrations` history
table was then baselined by hand (create table + insert row with the
matching sha256 checksum of `migration.sql`) to match exactly what `prisma
migrate resolve --applied 20260811_init` would have produced, since that
command needs a direct `DATABASE_URL` this session didn't have — Supabase's
DB password isn't exposed through the MCP tools, only through the project
dashboard.

Once `DATABASE_URL` / `DIRECT_URL` are set from that project's real
connection strings, `npx prisma migrate deploy` will see this migration as
already applied and do nothing, exactly as intended. Any *new* schema
change from here on should go through the normal `npx prisma migrate dev`
workflow.
