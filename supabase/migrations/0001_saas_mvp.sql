-- ---------------------------------------------------------------------------
-- CloneCinema SaaS MVP — Supabase schema
-- Aplicar en el SQL Editor de Supabase o con `supabase db push`.
-- Requiere que Auth esté habilitado (proveedores Email y Google).
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
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

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
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
-- Alta de usuario: perfil + 10 créditos de bienvenida
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

-- Relleno para usuarios que ya existían antes de esta migración.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

insert into public.user_credits (user_id, balance)
select id, 10 from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Operaciones de saldo (solo service role)
-- ---------------------------------------------------------------------------

-- Descuenta de forma atómica. Devuelve NULL si el saldo es insuficiente.
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

  return v_balance; -- NULL => insuficiente
end;
$$;

-- Devuelve créditos de un job fallido.
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

-- Registra la compra y acredita, de forma idempotente por referencia.
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

  -- El saldo se relee aquí para no chocar con la columna de salida `balance`.
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
-- RLS: el usuario lee lo suyo; nadie escribe saldo ni transacciones
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_credits enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_jobs enable row level security;

drop policy if exists "profiles: leer propio" on public.profiles;
create policy "profiles: leer propio" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: editar propio" on public.profiles;
create policy "profiles: editar propio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "credits: leer propio" on public.user_credits;
create policy "credits: leer propio" on public.user_credits
  for select using (auth.uid() = user_id);

drop policy if exists "transactions: leer propias" on public.transactions;
create policy "transactions: leer propias" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "jobs: leer propios" on public.ai_jobs;
create policy "jobs: leer propios" on public.ai_jobs
  for select using (auth.uid() = user_id);

-- Sin políticas de INSERT/UPDATE: esas operaciones solo las hace la
-- service role desde el backend (debit_credits, refund_credits, credit_purchase).

-- ---------------------------------------------------------------------------
-- Storage: buckets de medios
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('keyframes', 'keyframes', true, 20971520),
  ('videos', 'videos', true, 104857600)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "media: subir en carpeta propia" on storage.objects;
create policy "media: subir en carpeta propia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('keyframes', 'videos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media: borrar en carpeta propia" on storage.objects;
create policy "media: borrar en carpeta propia" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('keyframes', 'videos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
