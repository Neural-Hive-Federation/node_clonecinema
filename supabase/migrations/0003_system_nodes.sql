-- ===========================================================================
-- 🎬 CLONECINEMA — SYSTEM NODES & TÚNELES DINÁMICOS
-- Tabla para registrar la URL del túnel Cloudflare expuesto por Kaggle (Wan 2.2)
-- ===========================================================================

create table if not exists public.system_nodes (
  node_id text primary key,
  node_type text not null default 'kaggle_worker',
  url text not null,
  status text not null default 'online' check (status in ('online', 'offline', 'busy', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  last_heartbeat timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists system_nodes_status_idx on public.system_nodes (node_id, status);

alter table public.system_nodes enable row level security;

-- Política de lectura pública/autenticada
create policy "Lectura de nodos para usuarios autenticados"
  on public.system_nodes for select
  using (true);

-- Política de escritura solo para service role
create policy "Escritura de nodos solo service role"
  on public.system_nodes for all
  using (auth.role() = 'service_role');
