-- =====================================================================
-- Desempenho do RLS: avaliar o utilizador UMA vez por consulta, não por linha
-- =====================================================================
-- Correr no SQL Editor do Supabase, DEPOIS das outras migrações. Pode
-- correr-se mais do que uma vez (e deve voltar a correr-se depois de uma
-- migração nova que crie políticas).
--
-- Porquê: as políticas chamam `current_org_id()`, `app_role()`,
-- `is_platform_admin()` e `auth.uid()` diretamente. Escritas assim, o Postgres
-- chama-as uma vez POR LINHA — e cada chamada é uma consulta a `profiles`.
-- Com as presenças de uma época (milhares de linhas) e 50 tabelas lidas no
-- arranque, era isso que fazia a app demorar a entrar, e demorava mais a cada
-- semana de presenças marcadas.
--
-- Embrulhadas num `(select …)`, o Postgres avalia-as uma vez por consulta
-- (initPlan) e reutiliza o valor. É a recomendação da própria Supabase, e o
-- resultado é EXATAMENTE o mesmo: o valor não muda a meio de uma consulta.
--
-- Não se reescreve política nenhuma à mão: lê-se a expressão de cada uma em
-- `pg_policies` e muda-se só a chamada, com `alter policy` (que mantém o nome,
-- o comando, os papéis e o permissive/restrictive). Uma chamada já embrulhada
-- não volta a ser embrulhada.
-- =====================================================================

do $$
declare
  pol record;
  -- Chamadas a embrulhar, desde que não venham já depois de um "SELECT ".
  pat constant text :=
    '(?<!SELECT )\m((auth\.uid|auth\.jwt|app_role|current_org_id|is_platform_admin)\(\))';
  new_qual text;
  new_check text;
  sql text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_qual  := regexp_replace(pol.qual,       pat, '(SELECT \1)', 'g');
    new_check := regexp_replace(pol.with_check, pat, '(SELECT \1)', 'g');

    if new_qual is not distinct from pol.qual
       and new_check is not distinct from pol.with_check then
      continue;
    end if;

    sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if new_qual is not null then
      sql := sql || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      sql := sql || format(' with check (%s)', new_check);
    end if;

    begin
      execute sql;
    exception when others then
      -- Uma política que não se deixe reescrever fica como estava: continua
      -- correta, só mais lenta. Não pode ser o que faz falhar as outras.
      raise notice 'Política % em %.% ficou como estava: %',
        pol.policyname, pol.schemaname, pol.tablename, sqlerrm;
    end;
  end loop;
end $$;
