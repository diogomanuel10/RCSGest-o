-- =====================================================================
-- Rumia — Acesso fechado: os clubes são criados pelo admin da plataforma
-- =====================================================================
-- Corre DEPOIS de multitenant.sql. É seguro re-executar.
--
-- A Rumia deixa de ter registo aberto. Quem quer usá-la fala contigo, tu
-- crias-lhe a conta e o clube, e mandas o acesso na conversa que já existe.
-- A alternativa — deixar qualquer pessoa com o endereço criar o seu clube —
-- enchia a base de dados de clubes-fantasma e tirava-te precisamente aquilo
-- que queres nesta fase: saber quem entrou e acompanhar cada arranque.
--
-- O que NÃO muda: os convites. Um treinador, atleta ou fisioterapeuta
-- convidado para um clube que já existe continua a registar-se sozinho pelo
-- link `?invite=` — é o clube que decide quem entra nele, e essa porta
-- continua aberta. O que fecha é só a criação de clubes NOVOS.
--
-- Por isso o interruptor "Allow new users to sign up" do Supabase deve
-- ficar LIGADO: desligá-lo impedia também os convidados de criar conta. O
-- controlo está aqui, no create_club, e não no registo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Criar clube passa a ser exclusivo do admin da plataforma
-- ---------------------------------------------------------------------
-- Mantém-se a função (o admin usa-a para o seu próprio clube), mas passa a
-- recusar toda a gente. A mensagem é escrita para ser lida por um treinador
-- que caiu aqui sem perceber porquê, não por um programador.
create or replace function public.create_club(
  p_name text,
  p_trial_days int default 30,
  p_sport text default 'voleibol'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sport text := coalesce(nullif(trim(p_sport), ''), 'voleibol');
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;
  if not is_platform_admin() then
    raise exception 'A criação de clubes é feita por nós. Fala com quem te apresentou a Rumia.';
  end if;
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Já pertences a um clube.';
  end if;

  insert into public.organizations (name, owner_id, plan, status, trial_ends_at)
  values (coalesce(nullif(trim(p_name), ''), 'O meu clube'), auth.uid(),
          'trial', 'trial', now() + make_interval(days => greatest(p_trial_days, 0)))
  returning id into v_org;

  update public.profiles
     set org_id = v_org, role = 'coordenador'
   where id = auth.uid();

  insert into public.settings (org_id, sport) values (v_org, v_sport)
  on conflict (org_id) do update set sport = excluded.sport;

  return v_org;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Criar um clube PARA outra pessoa (o fluxo normal de venda)
-- ---------------------------------------------------------------------
-- Fluxo: crias a conta em Supabase → Authentication → Add user (com uma
-- palavra-passe temporária e "auto confirm"), e depois chamas isto em
-- Plataforma → Clubes → Novo clube. O trigger `on_auth_user_created` já criou
-- o perfil; aqui só se lhe dá um clube e o papel de coordenador.
--
-- Recebe o EMAIL e não o id: é o que tens à frente quando estás a criar a
-- conta, e é o que o treinador te deu na conversa. Um id de utilizador não
-- existe em lado nenhum da conversa.
create or replace function public.admin_create_club(
  p_email text,
  p_name text,
  p_sport text default 'voleibol',
  p_trial_days int default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_user uuid;
  v_has  uuid;
  v_sport text := coalesce(nullif(trim(p_sport), ''), 'voleibol');
  v_email text := lower(trim(p_email));
begin
  if not is_platform_admin() then
    raise exception 'Sem permissão.';
  end if;
  if v_email = '' or v_email is null then
    raise exception 'Indica o email do coordenador.';
  end if;

  -- O utilizador tem de existir. Não o criamos aqui de propósito: criar contas
  -- exige a chave de serviço, que nunca pode andar no browser.
  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is null then
    raise exception 'Não há nenhuma conta com o email %. Cria-a primeiro em Authentication → Add user.', v_email;
  end if;

  select org_id into v_has from public.profiles where id = v_user;
  if v_has is not null then
    raise exception 'Essa conta já pertence a um clube.';
  end if;

  insert into public.organizations (name, owner_id, plan, status, trial_ends_at)
  values (coalesce(nullif(trim(p_name), ''), 'Clube'), v_user,
          'trial', 'trial', now() + make_interval(days => greatest(p_trial_days, 0)))
  returning id into v_org;

  -- O perfil pode ainda não existir se a conta for anterior ao trigger.
  insert into public.profiles (id, email, org_id, role)
  values (v_user, v_email, v_org, 'coordenador')
  on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;

  insert into public.settings (org_id, sport) values (v_org, v_sport)
  on conflict (org_id) do update set sport = excluded.sport;

  return v_org;
end;
$$;

revoke all on function public.admin_create_club(text, text, text, int) from public, anon;
grant execute on function public.admin_create_club(text, text, text, int) to authenticated;
