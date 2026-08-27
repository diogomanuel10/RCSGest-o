-- =====================================================================
-- Rumia — Convites de atleta em LOTE
-- =====================================================================
-- O `convite-atleta.sql` resolveu o vínculo errado: o convite nasce ligado a
-- uma ficha e quem o abre passa a ser AQUELE atleta. Ficou por resolver a
-- escala. Dar acesso ao portal a um escalão de vinte atletas era abrir vinte
-- fichas, carregar vinte vezes em "Convidar para o portal" e copiar vinte
-- links um a um — com o link anterior a ser substituído no clipboard a cada
-- clique. Na prática ninguém o fazia, e o portal ficava por usar.
--
-- Esta função gera os convites de uma lista de atletas numa só chamada. Vinte
-- links de uma vez, prontos a distribuir.
--
-- Como usar:
--   1. Corre primeiro schema.sql, notifications.sql, multitenant.sql e
--      convite-atleta.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar (idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Criar convites para vários atletas de uma vez
-- ---------------------------------------------------------------------
-- Devolve uma linha de `org_invitations` por atleta convidado. As regras são
-- exatamente as do `create_invitation` com `p_player_id` — não há aqui uma
-- segunda versão da verdade:
--   * só o coordenador do clube convida;
--   * cada ficha tem de ser DESTE clube e estar ativa;
--   * o papel é forçado a 'atleta';
--   * um convite pendente por atleta (o anterior é substituído).
--
-- A diferença está no que se faz com os casos que não servem: um id de outro
-- clube ou de um atleta que já tem conta é IGNORADO em silêncio, em vez de
-- rebentar a operação toda. Num lote de vinte, falhar tudo porque um atleta já
-- tinha conta obrigaria o coordenador a descobrir qual e a repetir a seleção —
-- e o resultado devolvido já diz quantos convites saíram mesmo.
create or replace function public.create_invitations_bulk(
  p_player_ids uuid[]
)
returns setof org_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
begin
  if v_org is null or app_role() <> 'coordenador' then
    raise exception 'Apenas o coordenador do clube pode convidar.';
  end if;

  if p_player_ids is null or array_length(p_player_ids, 1) is null then
    return;
  end if;

  -- Tudo numa só instrução (CTEs): os atletas elegíveis, a limpeza dos links
  -- antigos e os convites novos. Uma tabela temporária partia se a função
  -- fosse chamada duas vezes dentro da mesma transação.
  return query
  with targets as (
    -- Deste clube, ativos e ainda SEM conta ligada. Convidar quem já entra na
    -- app não é um erro do coordenador (a lista pode ter mudado entretanto) —
    -- é só um convite que não faz falta nenhum.
    select p.id, p.guardian_contact
      from players p
     where p.id = any(p_player_ids)
       and p.org_id = v_org
       and p.archived_at is null
       and p.user_id is null
  ),
  -- Links antigos deixam de circular: um atleta tem um convite pendente, e é
  -- o mais recente. Sem isto, um link entregue há um mês continuava a valer.
  purge as (
    delete from org_invitations i
     using targets t
     where i.player_id = t.id
       and i.org_id = v_org
       and i.used_at is null
    returning i.id
  )
  insert into public.org_invitations (org_id, email, role, permissions, created_by, player_id)
  select
    v_org,
    -- `email` é só informativo (o convite vale pelo token, não pelo email),
    -- mas guardar o contacto do encarregado quando ele É um email poupa ao
    -- coordenador ter de ir à ficha saber a quem enviou cada link.
    case when t.guardian_contact like '%@%' then lower(trim(t.guardian_contact)) end,
    'atleta',
    '[]'::jsonb,
    auth.uid(),
    t.id
  from targets t
  returning *;
end;
$$;

grant execute on function public.create_invitations_bulk(uuid[]) to authenticated;
