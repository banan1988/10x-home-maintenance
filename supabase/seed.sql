-- Seed for the local-only real-RLS integration tier (test-plan.md §3 Phase 1).
-- Loaded automatically by `supabase db reset`. Two fixed, stable users with known
-- email/password, each with one maintenance_tasks row, so integration tests never
-- need an admin/service-role key to create fixtures.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'isolation-test-user-a@example.com',
    crypt('isolation-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'isolation-test-user-b@example.com',
    crypt('isolation-test-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

-- auth.identities is required alongside auth.users for password sign-in to succeed locally
-- (a users-only seed fails silently at signInWithPassword time) — see plan.md Key Discoveries.
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"isolation-test-user-a@example.com"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"isolation-test-user-b@example.com"}'::jsonb,
    'email',
    now(),
    now(),
    now()
  );

insert into maintenance_tasks (
  id, user_id, name, category, importance, frequency_value, frequency_unit, last_done_date
) values
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'User A seeded task',
    'hvac',
    'medium',
    3,
    'month',
    '2026-01-01'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'User B seeded task',
    'plumbing',
    'medium',
    6,
    'month',
    '2026-01-01'
  );
