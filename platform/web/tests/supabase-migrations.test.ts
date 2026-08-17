import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = path.resolve(process.cwd(), "../..");

test("all Supabase migrations and the deterministic showcase seed execute", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      instance_id uuid,
      aud text,
      role text,
      email text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE auth.identities (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      identity_data jsonb NOT NULL,
      provider text NOT NULL,
      provider_id text NOT NULL,
      last_sign_in_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE (provider_id, provider)
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text UNIQUE NOT NULL, public boolean NOT NULL DEFAULT false);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
      SELECT string_to_array(name, '/')
    $$;
  `);
  const migrationRoot = path.join(root, "supabase/migrations");
  for (const filename of readdirSync(migrationRoot).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(migrationRoot, filename), "utf8"));
  }
  await db.exec(readFileSync(path.join(root, "supabase/seed.sql"), "utf8"));
  const evidence = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM career_evidence_items");
  const media = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM career_evidence_media WHERE exif_stripped");
  const sources = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM career_evidence_sources WHERE connection_state='connected'");
  assert.equal(evidence.rows[0].count, 3);
  assert.equal(media.rows[0].count, 3);
  assert.equal(sources.rows[0].count, 3);
  await db.exec(`
    INSERT INTO career_evidence_items (user_id,evidence_kind,label,normalized_value,title)
    VALUES ('00000000-0000-4000-8000-000000000101','project','Private other-user item','private','Private other-user item');
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT ON career_evidence_items TO authenticated;
    GRANT SELECT ON career_evidence_sources, career_evidence_media, career_evidence_ai_proposals TO authenticated;
    SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
    SET ROLE authenticated;
  `);
  const visible = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM career_evidence_items");
  assert.equal(visible.rows[0].count, 3);
  const detail = await db.query<{ payload: { items: unknown[]; sources: unknown[] } }>("SELECT career_evidence_detail('00000000-0000-4000-8000-000000000001') AS payload");
  assert.equal(detail.rows[0].payload.items.length, 3);
  assert.equal(detail.rows[0].payload.sources.length, 3);
  await assert.rejects(() => db.exec(`INSERT INTO career_evidence_items (user_id,evidence_kind,label,normalized_value,title) VALUES ('00000000-0000-4000-8000-000000000001','project','Browser write','blocked','Browser write')`));
  await db.exec("RESET ROLE");
  await db.close();
});
