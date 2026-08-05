-- =====================================================================
-- Rumia — Convite ligado a um atleta
-- =====================================================================
-- Até aqui, dar acesso ao portal a um atleta era um percurso de dois passos
-- com um palpite pelo meio: convidá-lo como "Leitura" (o papel Atleta nem
-- aparecia nos convites), esperar que se registasse, e depois adivinhar, PELO
-- EMAIL, qual das contas era ele — para só então mudar o papel e vinculá-lo.
--
-- O problema é que `profiles` não guarda nome nenhum: o coordenador vê
-- `familia.costa@sapo.pt` e tem de decidir de cabeça que aquilo é a Maria. Na
-- formação o email é quase sempre o do encarregado de educação, por isso o
-- palpite falha. E falhar não é cosmético: um vínculo errado dá ao atleta as
-- presenças, as quotas e o CARTÃO QR de outro — com o qual passa a registar
-- presença em nome do colega.
--
-- Este guião tira o palpite do caminho. O convite passa a poder nascer JÁ
-- ligado a uma ficha de atleta; quem o resgata fica ligado a essa ficha, sem
-- passo de correspondência nenhum.
--
-- Como usar:
--   1. Corre primeiro schema.sql, notifications.sql, multitenant.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar (idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O convite pode apontar para uma ficha de atleta
-- ---------------------------------------------------------------------
-- Nulo = convite normal (treinador, direção, leitura…), como até aqui.
-- Preenchido = convite de atleta: ao ser resgatado liga a conta a esta ficha.
-- `on delete cascade`: se a ficha do atleta desaparecer, o convite deixa de
-- fazer sentido.
alter table org_invitations
  add column if not exists player_id uuid references players(id) on delete cascade;
create index if not exists idx_org_invitations_player on org_invitations (player_id);

-- ---------------------------------------------------------------------
-- 2. Criar convite (agora aceita o atleta)
-- ---------------------------------------------------------------------
-- Mantém a assinatura antiga a funcionar: `p_player_id` é o último parâmetro e
-- tem omissão. Com atleta indicado, o papel é FORÇADO a 'atleta' — um convite
-- ligado a uma ficha não faz sentido com outro papel qualquer.
create or replace function public.create_invitation(
  p_role text default 'leitura',
  p_permissions jsonb default '[]'::jsonb,
  p_email text default null,
  p_player_id uuid default null
)
returns org_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid := current_org_id();
  v_role text := coalesce(p_role, 'leitura');
  v_row  org_invitations%rowtype;
begin
  if v_org is null or app_role() <> 'coordenador' then
    raise exception 'Apenas o coordenador do clube pode convidar.';
  end if;

  if p_player_id is not null then
    -- A ficha tem de ser deste clube e estar ativa. Sem este filtro, um id
    -- vindo do cliente podia apontar para o atleta de outro clube.
    if not exists (
      select 1 from players
       where id = p_player_id and org_id = v_org and archived_at is null
    ) then
      raise exception 'Atleta não encontrado neste clube.';
    end if;

    -- Um convite pendente por atleta: evita links antigos a circular.
    delete from org_invitations
     where player_id = p_player_id and org_id = v_org and used_at is null;

    v_role := 'atleta';
  end if;

  insert into public.org_invitations (org_id, email, role, permissions, created_by, player_id)
  values (v_org, p_email, v_role, coalesce(p_permissions, '[]'::jsonb), auth.uid(), p_player_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Resgatar convite (liga a conta à ficha do atleta)
-- ---------------------------------------------------------------------
create or replace function public.redeem_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv org_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;

  select * into v_inv from public.org_invitations
   where token = p_token
   for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;
  if v_inv.used_at is not null then
    raise exception 'Este convite já foi usado.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Este convite expirou.';
  end if;
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Já pertences a um clube.';
  end if;

  update public.profiles
     set org_id = v_inv.org_id, role = v_inv.role, permissions = v_inv.permissions
   where id = auth.uid();
  if not found then
    insert into public.profiles (id, org_id, role, permissions)
    values (auth.uid(), v_inv.org_id, v_inv.role, v_inv.permissions)
    on conflict (id) do update
      set org_id = excluded.org_id, role = excluded.role, permissions = excluded.permissions;
  end if;

  -- Convite de atleta: liga a conta à ficha. É este passo que substitui a
  -- correspondência manual por email — quem abriu ESTE link é ESTE atleta.
  if v_inv.player_id is not null then
    -- Uma conta só pode estar ligada a um atleta (o inverso também).
    update public.players
       set user_id = null
     where user_id = auth.uid()
       and org_id = v_inv.org_id
       and id <> v_inv.player_id;

    update public.players
       set user_id = auth.uid()
     where id = v_inv.player_id
       and org_id = v_inv.org_id;
  end if;

  update public.org_invitations
     set used_at = now(), used_by = auth.uid()
   where id = v_inv.id;

  return v_inv.org_id;
end;
$$;

grant execute on function public.create_invitation(text, jsonb, text, uuid) to authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;

-- A versão antiga de 3 argumentos deixa de ser precisa (a nova tem omissão no
-- 4.º). Removê-la evita que uma chamada ambígua caia na errada.
drop function if exists public.create_invitation(text, jsonb, text);
