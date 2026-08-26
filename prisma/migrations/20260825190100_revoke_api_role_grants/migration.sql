-- The app reaches Postgres directly through Prisma; nothing goes through the
-- Supabase Data API. Supabase nonetheless sets default privileges that make
-- every new table in `public` fully readable and writable by `anon` and
-- `authenticated`, which would expose tenant COGS costs and quote contents to
-- anyone holding the project's publishable key. Revoke at the table level —
-- column-level revokes leave the implying table grant intact — and stop the
-- default from applying to tables added by later migrations.
DO $$
DECLARE
  api_role text;
  obj record;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);

    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
    EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', api_role);
  END LOOP;

  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', obj.tablename);
  END LOOP;
END
$$;
