-- =====================================================================
-- Rumia — ELIMINAR utilizadores do clube (coordenador)
-- =====================================================================
-- Corre DEPOIS de multitenant.sql e de eliminar-clubes.sql (usa
-- current_org_id(), app_role(), platform_admins e platform_deletions).
-- É seguro re-executar.
--
-- Porquê: a lista de Utilizadores só CRESCIA. O treinador que saiu em
-- dezembro, a conta de teste criada num convite que se colou duas vezes, a
-- atleta que mudou de clube — ficavam todos lá, com papel e acessos, a ocupar
-- lugares do plano e a aparecer nos seletores de vínculo. Baixar o papel para
-- "Leitura" não é o mesmo: continua a ser uma conta com entrada no clube.
--
-- Isto é IRREVERSÍVEL, e de propósito: apaga a linha de `auth.users`, ou
-- seja, a própria conta de login. Não é o arquivar (`archived_at`) das
-- entidades do clube. Por isso:
--   * a FICHA não morre com a conta. `coaches.user_id` e `players.user_id`
--     são `on delete set null` — o histórico do treinador e as presenças,
--     quotas e cartão QR da atleta ficam intactos; o que se perde é o acesso.
--     Apagar a conta de uma atleta não pode apagar a atleta.
--   * fica registo em `platform_deletions` (leitura só do admin da
--     plataforma): apagar sem deixar rasto é a única forma de nunca se saber
--     o que aconteceu a uma conta.
--
-- Três contas que a função recusa sempre, porque cada uma delas é uma forma
-- de o clube ficar sem ninguém a poder repor o engano:
--   * a própria (um coordenador não se elimina a si mesmo);
--   * a DONA do clube (`organizations.owner_id`);
--   * um admin da plataforma.
-- =====================================================================

create or replace function public.delete_org_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_email   text;
  v_role    text;
  v_coaches int := 0;
  v_players int := 0;
begin
  v_org := current_org_id();
  if v_org is null or app_role() <> 'coordenador' then
    raise exception 'Só o coordenador do clube pode eliminar utilizadores.';
  end if;
  if p_user is null or p_user = auth.uid() then
    raise exception 'Não podes eliminar a tua própria conta.';
  end if;

  -- O alvo tem de ser do MEU clube. Sem este filtro, um coordenador com o id
  -- de outra conta apagava um utilizador de outro clube — a mesma regra de
  -- isolamento que o RLS faz nas tabelas, escrita à mão porque
  -- `security definer` não passa pelo RLS.
  select p.role, coalesce(p.email, u.email)
    into v_role, v_email
    from profiles p
    left join auth.users u on u.id = p.id
   where p.id = p_user
     and p.org_id = v_org;
  if not found then
    raise exception 'Utilizador não encontrado neste clube.';
  end if;

  if exists (select 1 from organizations o where o.id = v_org and o.owner_id = p_user) then
    raise exception 'Esta conta é a dona do clube e não pode ser eliminada.';
  end if;
  if exists (select 1 from platform_admins pa where pa.user_id = p_user) then
    raise exception 'Esta conta é administradora da plataforma.';
  end if;

  -- Desliga as fichas antes de apagar. A FK já faria isto sozinha
  -- (`on delete set null`); fazê-lo aqui é o que permite CONTAR e dizer ao
  -- coordenador o que ficou sem conta ligada — uma atleta que deixa de ter
  -- acesso ao portal é precisamente o efeito que ele tem de perceber.
  update coaches set user_id = null where user_id = p_user and org_id = v_org;
  get diagnostics v_coaches = row_count;
  update players set user_id = null where user_id = p_user and org_id = v_org;
  get diagnostics v_players = row_count;

  -- Convites por usar dirigidos a esta pessoa deixam de fazer sentido: um
  -- link pendente para uma conta que já não existe volta a dar-lhe entrada.
  delete from org_invitations
   where org_id = v_org
     and used_at is null
     and (used_by = p_user
          or (v_email is not null and email is not null and lower(email) = lower(v_email)));

  -- A conta. Leva atrás o perfil, as notificações dirigidas a ela e as
  -- subscrições de push (todas `on delete cascade`).
  delete from auth.users where id = p_user;

  -- O registo é desejável, não essencial: se `platform_deletions` ainda não
  -- existir (eliminar-clubes.sql por correr), a eliminação não pode falhar
  -- por causa do histórico.
  begin
    insert into platform_deletions (kind, ref_id, label, details, deleted_by)
    values ('user', p_user, v_email,
            jsonb_build_object(
              'org_id', v_org,
              'role', v_role,
              'by', 'coordenador',
              'unlinked_coaches', v_coaches,
              'unlinked_players', v_players),
            auth.uid());
  exception when others then
    raise notice 'platform_deletions indisponível: %', sqlerrm;
  end;

  return jsonb_build_object(
    'email', v_email,
    'role', v_role,
    'unlinked_coaches', v_coaches,
    'unlinked_players', v_players);
end;
$$;

revoke all on function public.delete_org_member(uuid) from public;
grant execute on function public.delete_org_member(uuid) to authenticated;
