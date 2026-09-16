-- RLS desligado de propósito, mesmo racional de 0001_init.sql: só o backend acessa via
-- service_role key, nunca exposta ao navegador — não há caminho de acesso do cliente.

create table pcm_grupos (
  nome text primary key,
  criado_em timestamptz not null default now()
);

comment on table pcm_grupos is
  'Grupos de pessoas usados no painel PCM (ex: Manutenção, Engenharia, SESMT). Editável pela aba "Pessoas/Grupos" — não é uma lista fixa, o PCM pode criar novos grupos a qualquer momento.';

insert into pcm_grupos (nome) values ('Manutenção'), ('Engenharia'), ('SESMT');

create table pcm_pessoas_grupo (
  chave_pessoa text primary key,
  grupo text not null references pcm_grupos (nome),
  atualizado_em timestamptz not null default now()
);

comment on table pcm_pessoas_grupo is
  'Mapeia cada pessoa (nome completo do operador, como vem de NomeOperador+SobrenomeOperador no Desk Manager — não há ID numérico disponível no endpoint de lista) para um único grupo. Editável pela aba "Pessoas/Grupos" do painel PCM.';

create table pcm_atribuicoes_chamados (
  cod_chamado text primary key,
  grupo text not null references pcm_grupos (nome),
  pessoa text not null,
  urgencia text not null check (urgencia in ('Crítica', 'Alta', 'Média', 'Baixa')),
  observacao text,
  data_prevista_solucao date,
  atualizado_em timestamptz not null default now()
);

comment on table pcm_atribuicoes_chamados is
  'Só existe uma linha aqui quando o PCM edita algo (urgência/observação/data prevista) num chamado — chamados intocados não geram linha e continuam mostrando a distribuição automática do Desk. pessoa/grupo são sempre a pessoa/grupo efetivos no momento da edição (snapshot, sem histórico).';
