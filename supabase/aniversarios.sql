-- Aniversários dos atletas
-- ------------------------------------------------------------------
-- Correr no SQL Editor do Supabase (depois de `schema.sql`).
--
-- A ficha do atleta só guardava o ANO de nascimento (`birth_year`, texto):
-- chega para o escalão e para a idade aproximada, mas não diz quando é o
-- aniversário — que é a única coisa que se faz com esta data no dia a dia de
-- um clube de formação.
--
-- `birth_date` é a data completa. `birth_year` NÃO é apagado: é o que existe
-- em todas as fichas já preenchidas e continua a servir quem só sabe o ano
-- (uma importação antiga, um atleta que chegou a meio da época). A app usa a
-- data quando existe e recorre ao ano quando não existe.
alter table players add column if not exists birth_date date;

-- Nada é preenchido automaticamente: de um ano não se inventa um dia. As
-- fichas ficam sem data até alguém a escrever — e é essa lista ("quem falta
-- preencher") que a app mostra nos Plantéis e no Painel.

-- Coerência entre as duas colunas: quem tem data completa tem o ano a
-- condizer. Sem isto, editar a data e esquecer o ano deixava a ficha a dizer
-- duas coisas diferentes — e o escalão é calculado pelo ano.
create or replace function sync_birth_year() returns trigger
language plpgsql as $$
begin
  if new.birth_date is not null then
    new.birth_year := to_char(new.birth_date, 'YYYY');
  end if;
  return new;
end;
$$;

drop trigger if exists players_sync_birth_year on players;
create trigger players_sync_birth_year
  before insert or update of birth_date on players
  for each row execute function sync_birth_year();

-- Alinha as fichas que já tenham data (caso a coluna tenha sido criada à mão).
update players set birth_year = to_char(birth_date, 'YYYY')
 where birth_date is not null
   and (birth_year is null or birth_year <> to_char(birth_date, 'YYYY'));
