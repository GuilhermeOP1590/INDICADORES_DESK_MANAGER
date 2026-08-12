-- RLS (Row Level Security) está DESLIGADO de propósito nas duas tabelas abaixo.
-- Todo o acesso a este banco acontece a partir do backend via service_role key
-- (nunca exposta ao navegador/frontend) — não há client Supabase no frontend
-- nem acesso direto do navegador a este projeto. Não é descuido: como não
-- existe caminho de acesso do cliente, políticas de RLS não têm o que proteger
-- aqui e só adicionariam complexidade sem benefício.

create table if not exists cache_kv (
  key text primary key,
  payload jsonb not null,
  meta jsonb,
  fetched_at timestamptz not null default now()
);

comment on table cache_kv is
  'Cache descartável populado só pelo job de sincronização (endpoint /api/cron/sync). Guarda os datasets hoje cacheados em memória no backend (chamados, usuários, clientes×UF, subcategorias), uma linha por dataset (key = nome do dataset). Pode ser truncada/recriada a qualquer momento sem perda real: a fonte da verdade é sempre a API externa DeskManager.';

create table if not exists app_config (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table app_config is
  'Dado editado por humano, escrito só pelas rotas PUT/POST/DELETE do backend. Substitui os 3 arquivos JSON hoje gravados localmente: config de agrupamento de equipamentos, config de classificação de status e lista de chamados marcados como prioritários.';
