-- ===========================================================================
-- 🎬 CLONECINEMA — FULL DATABASE & STORAGE MIGRATION (NODO FEDERADO)
-- Proyecto: CloneCinema SaaS & Viral Studio (Nodo de la Federación Neural Nexus)
-- Instrucciones: Pegar y ejecutar en el SQL Editor del nuevo proyecto de Supabase.
-- ===========================================================================

-- 1. Habilitar extensiones criptográficas
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. TABLA: PROFILES (Perfiles de Creadores y Directores)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. TABLA: USER_CREDITS (Bolsa de Créditos de Generación)
-- ---------------------------------------------------------------------------
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 10 check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. TABLA: TRANSACTIONS (Pasarela de Pagos Wompi / Recargas)
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  reference text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'COP',
  credits integer not null default 0 check (credits >= 0),
  status text not null default 'PENDING',
  package_id text,
  wompi_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. TABLA: AI_JOBS (Cola de Render y Generación en Kaggle / Gemini)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'speech', 'clone')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error')),
  provider text not null default 'kaggle',
  kernel_ref text,
  prompt text,
  input_url text,
  output_url text,
  credits_charged integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_jobs_user_idx on public.ai_jobs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. TABLA: PROJECTS (Persistencia Completa de Proyectos Cinematográficos)
-- Sincroniza Storyboard, Planos, Reparto, Sets, Props, Audios y Chat
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  title text not null default '',
  mode text not null default 'clone' check (mode in ('clone', 'ad', 'saga')),
  format text not null default '9:16' check (format in ('9:16', '16:9', '1:1')),
  duration integer not null default 15,
  style text not null default '',
  language text not null default 'es',
  logline text not null default '',
  brief text not null default '',
  source_url text,
  source_meta jsonb not null default '{}'::jsonb,
  viral_dna jsonb not null default '{}'::jsonb,
  "references" jsonb not null default '[]'::jsonb,
  shots jsonb not null default '[]'::jsonb,
  characters jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  props jsonb not null default '[]'::jsonb,
  audio jsonb not null default '{}'::jsonb,
  publish jsonb not null default '{}'::jsonb,
  chat jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 7. TRIGGER AUTOMÁTICO: ALTA DE USUARIO CON 10 CRÉDITOS
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_credits (user_id, balance)
  values (new.id, 10)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 8. FUNCIONES DE GESTIÓN ATÓMICA DE CRÉDITOS (Service Role Only)
-- ---------------------------------------------------------------------------

-- Descuenta créditos de forma atómica
create or replace function public.debit_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    select balance into v_balance from public.user_credits where user_id = p_user_id;
    return v_balance;
  end if;

  update public.user_credits
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = p_user_id
     and balance >= p_amount
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- Devuelve créditos si un render en Kaggle falla
create or replace function public.refund_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 or p_user_id is null then
    return null;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set balance = public.user_credits.balance + excluded.balance,
        updated_at = now()
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- Acredita compra exitosa de Wompi de forma idempotente
create or replace function public.credit_purchase(
  p_reference text,
  p_user_id uuid,
  p_amount_cents integer,
  p_credits integer,
  p_status text default 'APPROVED',
  p_package_id text default null,
  p_wompi_transaction_id text default null
)
returns table (balance integer, credited integer, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean := false;
  v_balance integer;
begin
  insert into public.transactions (
    user_id, reference, amount_cents, credits, status, package_id, wompi_transaction_id
  )
  values (
    p_user_id, p_reference, p_amount_cents, p_credits, p_status, p_package_id, p_wompi_transaction_id
  )
  on conflict (reference) do nothing;

  v_inserted := found;

  if v_inserted and p_status = 'APPROVED' then
    insert into public.user_credits (user_id, balance)
    values (p_user_id, p_credits)
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          updated_at = now();
  end if;

  select uc.balance into v_balance
    from public.user_credits uc
   where uc.user_id = p_user_id;

  return query
    select coalesce(v_balance, 0),
           case when v_inserted and p_status = 'APPROVED' then p_credits else 0 end,
           not v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. SEGURIDAD RLS (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_credits enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.projects enable row level security;

-- Profiles
drop policy if exists "profiles: ver propio" on public.profiles;
create policy "profiles: ver propio" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: editar propio" on public.profiles;
create policy "profiles: editar propio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Credits
drop policy if exists "credits: ver propio" on public.user_credits;
create policy "credits: ver propio" on public.user_credits
  for select using (auth.uid() = user_id);

-- Transactions
drop policy if exists "transactions: ver propias" on public.transactions;
create policy "transactions: ver propias" on public.transactions
  for select using (auth.uid() = user_id);

-- AI Jobs
drop policy if exists "jobs: ver propios" on public.ai_jobs;
create policy "jobs: ver propios" on public.ai_jobs
  for select using (auth.uid() = user_id);

-- Projects (CRUD completo para el dueño o anónimo público en lectura)
drop policy if exists "projects: select" on public.projects;
create policy "projects: select" on public.projects
  for select using (auth.uid() = user_id or user_id is null);

drop policy if exists "projects: insert" on public.projects;
create policy "projects: insert" on public.projects
  for insert with check (auth.uid() = user_id or user_id is null);

drop policy if exists "projects: update" on public.projects;
create policy "projects: update" on public.projects
  for update using (auth.uid() = user_id or user_id is null);

drop policy if exists "projects: delete" on public.projects;
create policy "projects: delete" on public.projects
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 10. STORAGE BUCKETS (Keyframes, Videos y Audios)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('keyframes', 'keyframes', true, 26214400),    -- 25 MB max por imagen 9:16
  ('videos', 'videos', true, 104857600),          -- 100 MB max por video renderizado
  ('audio', 'audio', true, 52428800)              -- 50 MB max por audio / MP3
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Acceso de LECTURA PÚBLICA para reproducción fluida en PWA y Móvil
drop policy if exists "media: lectura publica universal" on storage.objects;
create policy "media: lectura publica universal" on storage.objects
  for select using (bucket_id in ('keyframes', 'videos', 'audio'));

-- Permiso de subida: usuarios autenticados o backend service_role
drop policy if exists "media: subida de archivos" on storage.objects;
create policy "media: subida de archivos" on storage.objects
  for insert with check (bucket_id in ('keyframes', 'videos', 'audio'));

drop policy if exists "media: actualizacion de archivos" on storage.objects;
create policy "media: actualizacion de archivos" on storage.objects
  for update using (bucket_id in ('keyframes', 'videos', 'audio'));

drop policy if exists "media: eliminacion de archivos" on storage.objects;
create policy "media: eliminacion de archivos" on storage.objects
  for delete using (bucket_id in ('keyframes', 'videos', 'audio'));

-- ===========================================================================
-- ¡LISTO! Esquema 100% desplegado para el nodo CloneCinema en Supabase.
-- ===========================================================================
