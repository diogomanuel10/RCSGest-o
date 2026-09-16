-- =====================================================================
-- Rumia — A família confirma os dados da encomenda
-- =====================================================================
-- Corre DEPOIS de schema.sql, multitenant.sql e artigos-configuraveis.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: a tabela das Encomendas é a lista que vai ao fornecedor, e o que
-- lá está não foi confirmado por ninguém. O número, o nome a estampar na
-- camisola e os tamanhos foram escritos pelo treinador de memória, ou saíram
-- de uma medição de setembro do ano passado — e o erro só aparece quando a
-- caixa chega: uma camisola com "MARIA" em vez de "MARIANA", um M que devia
-- ser S. Uma camisola estampada não se troca.
--
-- A confirmação já se fazia — por WhatsApp, atleta a atleta, e ficava no
-- histórico da conversa. O que faltava era saber, olhando para a lista,
-- QUEM já respondeu: sem isso, à vigésima família ninguém sabe em qual ia.
--
-- O que cria:
--   1. `player_sizes.confirmed_at` / `confirmed_by` — quem já respondeu
--   2. Nada mais: o RLS de `player_sizes` já decide quem escreve aqui
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A marca de confirmado
-- ---------------------------------------------------------------------
-- É uma MARCA na linha e não uma tabela de respostas: a resposta em si
-- chega por WhatsApp ou por email, fora da app, e guardá-la aqui seria um
-- segundo sítio para a mesma conversa. O que a app precisa de saber é uma
-- coisa só — esta linha já foi confirmada por quem a veste?
--
-- `confirmed_by` é quem CARIMBOU (o coordenador), não quem confirmou: quem
-- confirma é a família, do outro lado da mensagem, e essa não tem
-- necessariamente conta na app. Serve para saber a quem perguntar.
alter table player_sizes add column if not exists confirmed_at timestamptz;
alter table player_sizes add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. Uma confirmação é sobre VALORES concretos
-- ---------------------------------------------------------------------
-- Mudar o tamanho ou o nome a estampar depois de confirmado deixa a linha a
-- dizer "confirmado" sobre dados que ninguém viu — que é pior do que não
-- ter marca nenhuma, porque ninguém volta a perguntar. A app limpa a marca
-- a cada gravação de tamanhos (ver `upsertPlayerSizes` no store), e o
-- trigger fecha a porta a quem escreva por fora da app.
--
-- Só olha para o que foi CONFIRMADO: o `updated_at` muda a cada gravação,
-- incluindo a que carimba a própria confirmação.
create or replace function public.clear_sizes_confirmation()
returns trigger
language plpgsql
as $$
begin
  if NEW.confirmed_at is not distinct from OLD.confirmed_at
     and (NEW.sizes            is distinct from OLD.sizes
       or NEW.nome_camisola    is distinct from OLD.nome_camisola
       or NEW.nome_camisola_alt is distinct from OLD.nome_camisola_alt)
  then
    NEW.confirmed_at := null;
    NEW.confirmed_by := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_clear_sizes_confirmation on player_sizes;
create trigger trg_clear_sizes_confirmation before update on player_sizes
  for each row execute function public.clear_sizes_confirmation();
