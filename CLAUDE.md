# CLAUDE.md — Arquitetura da Rumia

Guia para quem (humano ou IA) trabalhar neste projeto. Para instruções de
instalação e setup, ver [`README.md`](README.md).

## Visão geral

Aplicação web **vanilla JavaScript** (sem framework) servida pelo **Vite**.
A persistência e a autenticação são do **Supabase**.

**Modelo multi-tenant (SaaS):** cada clube é uma **organização** (`organizations`)
com os dados totalmente isolados dos outros. Todas as tabelas de dados têm
`org_id` (com `default current_org_id()`) e uma política **RESTRICTIVE** de
isolamento por clube, que se combina (AND) com as políticas de papel já
existentes — um clube nunca vê linhas de outro. Dentro de cada clube mantém-se
o modelo **partilhado por papel**: os utilizadores desse clube veem/editam
conforme o `role` + RLS. Ver `supabase/multitenant.sql` (corre DEPOIS de
`schema.sql` e `notifications.sql`).

- **Onboarding**: quem se regista sem convite fica "pendente" (perfil com
  `org_id` nulo) e cria o seu clube em `onboarding.js` (RPC `create_club`,
  arranca em período de demonstração/trial).
- **Convites**: o coordenador gera um link `?invite=<token>` (RPC
  `create_invitation`); o convidado regista-se e o token é resgatado no arranque
  (RPC `redeem_invitation`, ver `app-shell.js`), ligando a conta ao clube.
- **Convite de atleta** (`supabase/convite-atleta.sql`):
  `org_invitations.player_id` deixa o convite nascer **já ligado a uma ficha**.
  Gera-se no perfil do atleta ("Acesso ao portal"), onde o coordenador o escolhe
  pelo NOME; o resgate preenche `players.user_id` sozinho. Isto existe porque
  `profiles` **não guarda nome** — só email: sem isto o coordenador tinha de
  adivinhar, por um `familia.costa@sapo.pt`, qual das contas era a Maria, e um
  vínculo errado dá ao atleta as presenças, quotas e o **cartão QR** de outro.
  O servidor força `role='atleta'`, valida que a ficha é do clube e substitui
  qualquer convite pendente do mesmo atleta.
- **Subscrições**: `organizations.status` (`trial`/`ativa`/`suspensa`/
  `cancelada`) + `trial_ends_at`. O *gate* em `app-shell.js` (`orgAccess()`)
  bloqueia clubes inativos (`subscription-blocked.js`).
- **Planos** (tabela `plans`, ver `supabase/plans.sql`): 3 níveis (Treinador,
  Clube, Clube+) via `organizations.plan`. Eram cinco — o nível de entrada mais
  barato ancorava o preço de todos os outros, e escolher entre "Essencial" e
  "Clube" obrigava o clube a decidir, antes de experimentar, se ia querer
  departamento médico. Os planos antigos (`solo`, `treinador_plus`,
  `essencial`) mapeiam sempre PARA CIMA em `PLAN_ALIASES`, e
  `supabase/plans-consolidacao.sql` move os clubes na base de dados: tirar um
  módulo a quem já o usava é a forma mais rápida de o perder. São
  **editáveis** pelo admin da plataforma em `admin.js` (Plataforma → Planos):
  módulos premium incluídos (`quotas`, `medico`, `fisica`, `equipamentos`,
  `encomendas`, `documentos`, `financeiro`, `ia` — catálogo em
  `PLAN_FEATURE_CATALOG`) e limites (`max_escaloes`, `max_users`). A app
  carrega-os em `state.plans`; `plans.js` lê daí (com `DEFAULT_PLANS` como
  recurso se a tabela ainda não existir). `canAccess()` combina papel +
  `planAllowsFeature`; os limites têm avisos de upgrade em `planteis.js`
  (escalões) e `utilizadores.js` (utilizadores). Planos legados (`pro`/`trial`)
  mapeiam para acesso total (fail-open). Gating é de UI — enforcement por plano
  no RLS/triggers é follow-up (os módulos sensíveis já têm RLS por papel).
- **Admin da plataforma** (o vendedor): tabela `platform_admins`, ACIMA do
  coordenador. A vista `admin.js` (entrada "Plataforma" no rodapé, só para
  `is_platform_admin()`) lista os clubes e gere planos/estados por billing
  manual (RPCs `admin_list_orgs`, `admin_set_org_status`).
- **Eliminar clubes e contas** (`supabase/eliminar-clubes.sql`): quem
  experimentou a demonstração e não ficou ficava para sempre na lista, a contar
  como cliente. Suspender esconde o problema; eliminar é decisão comercial
  normal e tem de existir na app — se só existir no SQL Editor, ou não se faz,
  ou faz-se à mão, que é onde se apaga o clube errado.
  - **Não é o arquivar (`archived_at`) das entidades do clube**: isto é
    irreversível. `admin_delete_org` apaga a linha de `organizations` e o
    `ON DELETE CASCADE` do `org_id` leva atrás TODOS os dados desse clube. Por
    isso o ficheiro começa por **acrescentar a FK em cascata** a qualquer tabela
    com `org_id` que ainda não a tenha: um `org_id` sem cascata deixava linhas
    órfãs de um cliente já apagado.
  - **As contas dos membros são uma decisão à parte** (`p_delete_users`): um
    clube de demonstração que nunca arrancou não deixa contas úteis; um clube
    que fechou mas cujo coordenador vai abrir outro deve manter a conta —
    `profiles.org_id` é `on delete set null`, por isso a pessoa volta ao
    onboarding em vez de ficar sem nada.
  - **Nunca apaga quem está a apagar**: a função recusa o clube do próprio admin
    e, ao limpar as contas, salta a sua e as dos outros `platform_admins`.
    Eliminar um clube não pode ser a forma de perder o acesso ao painel.
  - `admin_delete_user` trata das contas soltas (registou-se, espreitou e nunca
    voltou — perfil sem clube). Se for a dona de um clube, o clube fica sem dono
    (`owner_id` é `set null`) mas **não** é eliminado por arrasto.
  - **Fica registo** (`platform_deletions`, leitura só para admin, sem política
    de escrita): apagar sem deixar rasto é a única forma de nunca se saber o que
    aconteceu a um cliente. Guarda nome, contagens e quem apagou.
  - **Confirma-se escrevendo o nome do clube**, não com um `confirmDialog`: a
    lista tem os clubes todos lado a lado e um clique não distingue nomes
    parecidos. `admin_list_orgs` passou a devolver `last_activity` (último
    início de sessão dos membros) e há uma secção **Contas** com filtros "sem
    clube" e "sem entrar há 30+ dias" — sem isso o painel não distingue o clube
    que trabalha todos os dias do que entrou uma vez em março, e é essa
    diferença que decide o que se elimina.
- **Convites (UI)**: em `utilizadores.js` o coordenador cria convites (papel +
  acessos), copia o link `?invite=<token>` e revoga-os. A lista vem de
  `state.invitations`.
- **Trabalhos com chave de serviço**: o `attendance-reminder` (Edge Function e
  versão pg_cron) e o `send_weekly_digest` correm sem `auth.uid()`, por isso
  **não passam pelo RLS**: cada um define o `org_id` à mão a partir da linha de
  origem (o evento, o clube). É a mesma regra do `check_in_by_qr` — num job com
  chave de serviço, o isolamento entre clubes é escrito à mão ou não existe.

## Estrutura de pastas

```
index.html              Ponto de entrada HTML; carrega as fontes e src/main.js
src/
  main.js               Arranque: config -> login -> app shell (router de sessão)
  supabase.js           Cria o cliente Supabase e deteta variáveis em falta
  auth.js               Login/logout/sessão + mensagens de erro em PT
  store.js              Camada de dados: cache em memória, CRUD, eventos
  compute.js            Cálculos derivados (totais, próximos eventos, nomes…)
  permissions.js        Papéis e capacidades (canEdit, canManageUsers…)
  constants.js          Valores partilhados (níveis, estados, escalões, etc.)
  ui.js                 Utilitários de UI (esc, euros, loading/erro/vazio, logo)
  toast.js              Avisos efémeros de confirmação/erro (toastOk/toastError)
  modal.js              Modal de formulário reutilizável + diálogo de confirmação
  style.css             Design system completo (tokens + componentes)
  players-xlsx.js       Importar atletas de .xlsx + gerar modelo (SheetJS lazy)
  demo-data.js          Clube de exemplo: semear e limpar (marca em settings.demo_seed)
  push.js               Web Push: subscrever o dispositivo, iOS/instalação, logout
  qrcode.js             Cartões QR: gerar, ler pela câmara, traduzir (libs lazy)
  players-qr.js         Folha de cartões QR imprimíveis (A4, tamanho cartão)
  offline-card.js       Cartão QR guardado no dispositivo (ecrã de recurso sem rede)
  tactical-court.js     Campo em SVG + exercício de decisão (todas as posições)
  report-sheet.js       Folha A4 imprimível: janela, estilos e blocos comuns
  athlete-report.js     Ficha do atleta imprimível (usa report-sheet)
  game-report.js        Resumo pós-jogo imprimível (usa report-sheet)
  assets/logo.svg       Logótipo do clube (emblema SVG)
  views/
    config-help.js      Ecrã quando faltam as variáveis do Supabase
    login.js            Ecrã de login
    app-shell.js        Layout (top bar + barra lateral colapsável + router)
    inicio.js           Secção Painel (separadores Resumo + Objetivos)
    painel.js           Vista Painel (o resumo, diferente por papel)
    patrocinios.js      Separador Patrocínios (dentro do Financeiro)
    planteis.js         Vista Plantéis (CRUD + importar atletas via .xlsx)
    athlete-profile.js  Perfil do Atleta (modal unificado com separadores)
    avaliacao.js        Vista Avaliação de plantel (Mantém/Sai/Pendente)
    saude.js            Vista Saúde & Física (orquestra Médico + Prep. Física)
    medico.js           Separador Fisioterapia (atletas + agenda + histórico de lesões)
    clinical-file.js    Área de Fisioterapia do perfil (episódios, sessões, atendimentos)
    preparacao.js       Separador Prep. física (atletas + periodização + mapa de jogos)
    physical-file.js    Área de Prep. física do perfil (dados físicos, avaliações, controlo)
    calendario.js       Vista Calendário
    presencas.js        Quem vem a um evento: presenças (treino) ou convocatória (jogo)
    portal.js           Portal do atleta (a sua página pessoal, mobile-first)
    quiosque.js         Modo quiosque: câmara à entrada regista presenças por QR
    resultado.js        Registo do resultado de um jogo (parciais + participação)
    treino.js           Secção Treino (separadores Exercícios + Decisão Tática)
    tatica.js           Decisão Tática (cenários por posição; atleta responde no portal)
    exercicios.js       Biblioteca de exercícios do clube (+ escolher da biblioteca)
    treinadores.js      Vista Treinadores
    definicoes.js       Vista Definições (época, meta, escalões, limiares)
    nova-epoca.js       Assistente de viragem de época (só coordenador)
    utilizadores.js     Vista Utilizadores (gestão de papéis — só coordenador)
    arquivados.js       Vista Arquivados (registos inativos + repor — só coordenador)
supabase/schema.sql     Tabelas, índices, RLS e dados iniciais (correr no Supabase)
supabase/qrcode-presencas.sql  Presenças por QR: token do atleta + RPCs de check-in
supabase/portal-atleta.sql     Portal: o atleta lê a sua própria disponibilidade
supabase/comunicacao.sql       Respostas do atleta a eventos + avisos do clube
supabase/resultados.sql        Resultado dos jogos (final + parciais) e pontos jogados
supabase/tatica.sql            Decisão Tática: cenários de leitura de jogo + respostas
supabase/exercicios.sql        Biblioteca de exercícios (tabela + ligação ao plano de treino)
supabase/painel-avisos.sql     Limiares do clube + avisos escolhidos por utilizador
supabase/resumo-semanal.sql    Resumo semanal (notificação + push) e limiares de queda
supabase/web-push.sql          Web Push: trigger em notifications -> Edge Function send-push
supabase/dados-exemplo.sql     Marca do clube de exemplo (settings.demo_seed)
public/                 Ficheiros estáticos (modelo-atletas-rumia.xlsx)
```

## Fluxo de arranque (`main.js`)

1. Sem variáveis do Supabase → `renderConfigHelp` (ecrã de ajuda).
2. Sem sessão → `renderLogin`.
3. Com sessão → `renderAppShell`, que carrega todos os dados e mostra as vistas.

`onAuthChange` reage a login/logout (inclusive noutros separadores).

## Navegação (rotas no endereço)

A secção atual vive no **hash do endereço** (`#/planteis`), e o perfil de um
atleta em `#/atleta/<id>[/<separador>]`. O `app-shell` trata o endereço como a
fonte de verdade: `go()` e `setHash()` **escrevem** no hash e é o `hashchange`
que desenha (`applyHash`). Assim, recarregar mantém o sítio, o botão "voltar" do
browser desfaz o último passo e os links são partilháveis.

- Uma rota desconhecida ou sem permissão cai na primeira secção permitida.
- Quando o `paint()` muda de rota por sua conta, `syncHash()` corrige o endereço
  com `replaceState` (sem criar passo no histórico).
- O `renderAppShell` pode ser montado mais do que uma vez (ex.: fim do
  onboarding); `disposeGlobals` limpa os listeners de `window`/`document` e a
  subscrição ao store da montagem anterior.

## Camada de dados (`store.js`)

- `state` — objeto em memória com `settings`, `coaches`, `teams`, `players`,
  `sponsors`, `events` e `loaded`.
- `loadAll()` — vai buscar tudo ao Supabase em paralelo (uma vez).
- `createRow / updateRow / deleteRow` — operações genéricas que atualizam o
  Supabase **e** a cache local, e depois notificam.
- `saveSettings`.
  Não há exportar/importar backup em `.json`: existiu, exportava seis das mais
  de quarenta tabelas e a importação apagava eventos, atletas, equipas,
  patrocínios e treinadores (com tudo o que deles dependia, em cascata). Um
  ficheiro chamado "backup" que restaura um quinto dos dados e destrói o resto
  é pior do que não existir. A exportação dos dados de um titular (RGPD) é
  coisa à parte, por atleta, e está por fazer.
- `subscribe(fn)` — padrão observador. O `app-shell` subscreve e re-desenha a
  vista atual sempre que os dados mudam. **Não há estado de UI na base de
  dados** — só dados.

### Padrão de uma vista

Cada `views/*.js` exporta `renderXxx(container)` que:
1. Lê de `state` (e de `compute.js`) e escreve HTML em `container`.
2. Liga os eventos (cliques, filtros) depois de inserir o HTML.
3. Para criar/editar usa `openModal({ fields, onSubmit })` de `modal.js`;
   para remover usa `confirmDialog(...)`. Cada campo aceita `hint` (texto de
   ajuda por baixo, ligado por `aria-describedby`) e `reactive: true` — este
   avisa por `onFieldChange(nome, valores)` assim que muda, para a vista poder
   reconstruir o formulário (ex.: mudar o tipo de objetivo troca os campos
   seguintes). Reconstruir na gravação não serve: os campos obrigatórios ainda
   vazios fazem a validação nativa bloquear o submit antes de lá chegar.
4. Após uma operação no `store`, a notificação re-desenha a vista — por isso
   as vistas **não** atualizam o DOM manualmente após guardar.
5. A **confirmação visível** da gravação vem do `store`, não da vista: as
   operações genéricas (`createRow`, `updateRow`, `deleteRow`, `archiveRow`,
   `restoreRow`, `saveSettings`) mostram um toast com o nome da entidade
   (`ENTITY_LABEL` em `store.js`). Uma vista só chama `toastOk`/`toastError`
   diretamente para ações que não passem por estas funções.

O `modal.js` fecha com guarda: sair de um formulário com alterações por gravar
pede confirmação. Os diálogos formam uma **pilha** (só o do topo reage ao
Escape), prendem o foco (Tab não sai do modal) e devolvem-no ao elemento de
origem. No `confirmDialog` o foco começa no **Cancelar**, para o Enter reflexo
nunca confirmar uma ação destrutiva.

Filtros e estados locais de UI (ex.: equipas expandidas) vivem em variáveis no
topo do módulo da vista.

## Objetivos / KPIs

`objectives` guarda as metas da época. Cada objetivo cruza um **tipo** com um
**âmbito**:

| Tipo | O que é |
|------|---------|
| `auto`   | a app calcula o valor (ver `OBJECTIVE_METRICS` em `compute.js`) |
| `manual` | o coordenador escreve o alvo e vai atualizando `current` |
| `marco`  | binário, sem alvo nem barra — `done_at` nulo = por atingir |

| Âmbito | O que faz |
|--------|-----------|
| `clube`  | um número para todo o clube (é o valor por omissão, e o dos registos antigos) |
| `equipa` | uma equipa concreta (`team_id`) |
| `todas`  | a MESMA definição medida em CADA plantel — o cartão abre numa linha por equipa (`objectiveRows`) |

- **Indicadores** declaram `scope` (`clube` ou `ambos`) e recebem `teamId`;
  `metricsForScope()` filtra os que sabem medir uma equipa. Declaram também
  `cumulative` — ver a seguir.
- **Estado** (`objectiveStatus`): `atingido`, `falhado` (prazo passou),
  `risco`, `abaixo`, `progresso`. A distinção que importa é entre indicadores
  que **acumulam** (dinheiro angariado) e **taxas** (retenção, presenças):
  num acumulável o risco compara o progresso com o tempo já gasto; numa taxa
  isso não faz sentido — estar a 75% de um alvo de 90% a meio da época não é ir
  atrasado, é estar `abaixo`. Só sobe a `risco` no último quarto do prazo.
  Sem `deadline` não há ritmo que se meça.
- **Retenção do plantel** (`squad_retention`) lê `players.review_status`:
  `mantem ÷ total`. Os `pendente` contam para o denominador de propósito, e o
  cartão mostra quantos faltam decidir. Mede a **decisão** do coordenador, não a
  inscrição efetiva na época seguinte.
- O Painel mostra os que estão em `risco`/`falhado` na lista "A precisar da tua
  atenção" (`objectivesNeedingAttention`).
- **Quem vê o quê**: o treinador vê os objetivos de `clube` e de `todas`, e os
  de `equipa` só das SUAS equipas (`canSeeObjective`). Num cartão de `todas` vê
  apenas a linha do seu plantel e o alvo — sem as outras equipas nem a contagem
  "X de Y a cumprir": o alvo é partilhado, a comparação entre treinadores não.
  Os papéis de âmbito de clube (`isClubWide`) veem tudo. Isto **não é só UI**:
  a política `obj_read` cruza `team_coaches`, por isso o servidor recusa os
  objetivos de outras equipas.

## Secções que orquestram separadores

Três entradas da barra lateral não desenham conteúdo próprio: montam uma barra
de separadores e delegam o corpo a outras vistas, que mantêm o seu cabeçalho e
o seu botão de ação. Cada separador tem a **sua** permissão, e a barra só
aparece quando há mais do que um visível — quem tem acesso a um só não ganha
camada extra.

| Secção         | Separadores (permissão)                                             |
|----------------|---------------------------------------------------------------------|
| `painel`       | Resumo (`painel`) · Objetivos (`objetivos`)                          |
| `treino`       | Exercícios (`exercicios`) · Decisão tática (`tatica`)                |
| `financeiro`   | Livro-razão (`financeiro`) · Patrocínios (`patrocinios`) · Quotas (`quotas`) |
| `saude`        | Fisioterapia (`medico`) · Prep. física (`fisica`)                    |
| `equipamentos` | Inventário (`equipamentos`) · Encomendas (`encomendas`)              |

A entrada só aparece se **alguma** das suas permissões passar (ver `can` no
`NAV`). `openFinanceiroTab()` / `openSaudeTab()` deixam outra vista escolher o
separador antes de navegar (usado pelos cartões do Painel).

- **Endereços antigos**: `LEGACY_ROUTES` no `app-shell` redirecciona `#/medico`,
  `#/fisica`, `#/quotas`, `#/patrocinios`, `#/exercicios`, `#/tatica` e
  `#/objetivos` para a secção que os absorveu, já no separador certo — links
  partilhados e favoritos continuam a funcionar. Pelo mesmo motivo, o `navTo()`
  do Painel escreve no hash quando a rota já não tem botão na barra lateral.
- **Pesquisa**: cada entrada do `NAV` pode ter `alias` com o que vive lá dentro
  (ex.: "quotas patrocínios" no Financeiro), para quem procura pelo nome da
  coisa e não pelo da secção.

## Permissões (papéis)

- Cada utilizador tem um perfil na tabela `profiles` com um `role`:
  `coordenador` (tudo), `direcao` (órgão diretivo: supervisão de todo o clube +
  gestão de patrocínios, financeiro e definições — sem trabalho técnico nem
  gestão de utilizadores), `treinador` (edita Plantéis e marca presenças; vê o
  Calendário mas só o coordenador cria/edita eventos),
  `seccionista` (secretariado da secção: gestão administrativa de atletas,
  quotas, equipamentos e recrutamento; acessos por secção configuráveis como o
  `leitura`), `fisioterapeuta` (Departamento Médico + calendário de treinos),
  `preparador` (preparador físico: Preparação Física + mapa de jogos),
  `atleta` (portal pessoal) ou `leitura` (só vê). Quem se regista começa em
  `leitura`.
- A **Direção** (`direcao`) vê todas as secções de gestão e técnicas (exceto o
  detalhe confidencial do Dept. Médico e da Prep. Física, as Encomendas e o
  portal do atleta) e edita a área de gestão (`sponsors`, `finances`,
  `settings`); não arquiva/repõe registos nem gere utilizadores (fica no
  coordenador). O **Seccionista** (`seccionista`) tem acessos por secção
  escolhidos pelo coordenador (como o `leitura`) e escreve, ao nível do clube,
  nas entidades administrativas (`players`, `quotas`, `equipment`, `prospects`,
  `sizes`); não arquiva registos (decisão do coordenador). `isClubWide()` em
  `permissions.js` marca os papéis que veem todas as equipas/escalões (todos
  menos o treinador e o atleta).
- O **Departamento Médico** (`medico`) não é uma secção configurável: é
  exclusivo do coordenador e do fisioterapeuta (ver `canAccess` em
  `permissions.js`). Os dados clínicos têm o seu próprio RLS (`med_rw`):
  leitura/escrita só para esses dois papéis.
- A **Preparação Física** (`fisica`) é exclusiva do coordenador e do
  preparador físico (também `canAccess`). O perfil físico e a periodização têm
  RLS próprio (`phys_*`/`prep_*`). A **história clínica** é editada pela
  fisio/coordenador (`mh_write`) e o preparador só a consulta (`mh_read`).
- O **RLS** no Supabase é a fonte de verdade (ver `schema.sql`): leitura para
  todos os autenticados; escrita conforme o papel via a função `app_role()`.
- Na interface, `src/permissions.js` (`canEdit`, `canManageUsers`,
  `canManageSettings`) esconde/mostra ações. É só conveniência de UI — mesmo
  que algo escapasse, o RLS recusa a operação.
- `store.js` carrega o perfil atual em `state.profile` e (se coordenador) todos
  os perfis em `state.profiles`. A vista `utilizadores.js` permite ao
  coordenador mudar papéis. As entradas Definições e Utilizadores na barra
  lateral só aparecem ao coordenador.

## Perfil do Atleta (vista unificada)

- `athlete-profile.js` (`openAthleteProfile`) é o ponto único de entrada para
  ver um atleta (abre dos Plantéis, do Dept. Médico e da Preparação Física).
  Tem separadores mostrados conforme as permissões de quem vê:
  - **Geral** — sempre. Dados pessoais, equipa, avaliação, **disponibilidade**
    (estado + limitações ao treino, de `athlete_availability`), resumo de dados
    físicos + última avaliação, presenças e quotas.
  - **Fisioterapia** — só `canAccess('medico')` (coordenador + fisioterapeuta);
    renderizada por `renderClinicalInto` (`clinical-file.js`).
  - **Prep. física** — só `canAccess('fisica')` (coordenador + preparador);
    renderizada por `renderPhysicalInto` (`physical-file.js`).
- O **treinador** vê só o separador Geral, com o resumo de disponibilidade e
  limitações (sem o detalhe clínico) e a última avaliação física —
  `athlete_availability` e `physical_tests` têm leitura para a equipa técnica
  (não para o atleta); o detalhe clínico continua reservado (`med_rw`).

## Regras de negócio

- **Arquivar em vez de apagar (soft-delete)**: as entidades principais
  (`players`, `teams`, `coaches`, `sponsors`, `events`, `prospects`) **nunca
  são apagadas** — ficam inativas via `archived_at` (timestamp). A app só
  carrega registos ativos (`archived_at is null`); `pruneOrphans` em `store.js`
  esconde da cache os filhos de pais arquivados (ex.: atletas de uma equipa
  arquivada). `archiveRow`/`restoreRow` marcam/limpam `archived_at` e recarregam
  tudo. Arquivar/repor é **decisão do coordenador**: `canDelete()` na UI e o
  trigger `guard_archive` no Supabase impedem o treinador de arquivar atletas/
  recrutamentos (que ainda pode editar). A vista `arquivados.js` (só
  coordenador) lista os inativos e permite repô-los. Converter um prospeto em
  atleta também o arquiva (`status='inscrito'`), preservando o funil.
- **Total angariado** = soma do valor do nível dos patrocínios com
  `status = 'confirmado'` (Ouro 3000 / Prata 1500 / Bronze 500).
- **Confirmar exige nível**: validado em `patrocinios.js` no `onSubmit`.
- **Contactos em curso** = estados `email`, `telefone`, `conversacao`.
- Arquivar uma equipa esconde também os seus atletas das listas ativas
  (`pruneOrphans`), sem os apagar; repor a equipa repõe-nos. As FKs em cascata
  (`deleteRow`) só atuam nas entidades que continuam a ser apagadas de vez
  (equipamentos, dados clínicos/físicos, presenças, etc.).
- **Escalões configuráveis**: guardados em `settings.escaloes` (JSON). A lista
  em vigor obtém-se por `compute.escaloes()` (recorre a `DEFAULT_ESCALOES` se
  vazio). Geridos nas Definições; usados no formulário de equipa dos Plantéis.
- **Modalidade e posições configuráveis**: a modalidade do clube vive em
  `settings.sport` (voleibol/futebol/futsal/andebol/basquetebol/outro — catálogo
  `SPORTS` em `constants.js`) e as posições em `settings.positions` (JSON). A
  lista em vigor obtém-se por `compute.positions()`: usa `settings.positions` se
  for personalizada, senão deriva as posições por omissão da modalidade
  (`SPORT_POSITIONS`). Assim, mudar de modalidade muda logo as posições sem seed.
  Escolhida no onboarding (RPC `create_club` aceita `p_sport`) e editável nas
  Definições; usada nos Plantéis, Recrutamento e Avaliação.
- **Credenciação do treinador**: `coaches.license_number` (Nº da Licença) e
  `coaches.tptd` são texto livre, opcionais; mostrados na ficha do treinador.
- **Importar atletas (.xlsx)**: nos Plantéis, cada equipa tem "Importar (xlsx)".
  `players-xlsx.js` lê o ficheiro com SheetJS (carregado dinamicamente) e mapeia
  as colunas por cabeçalho (Nome, Número, Ano de nascimento, Posição; aceita
  variações). Linhas sem nome são ignoradas. Insere em lote via `createRows`.
  O modelo descarrega-se por "Descarregar modelo" (ou de `public/`).
- **Presenças por QR (modo quiosque)**: cada atleta tem um `players.qr_token`
  (ver `supabase/qrcode-presencas.sql`). Um tablet à entrada fica em modo
  quiosque (`quiosque.js`, aberto das Presenças) com a câmara ligada; o atleta
  passa o cartão e a presença é registada sozinha.
  - **O QR não leva o `id` do atleta**, leva o `qr_token` — que se regenera no
    perfil do atleta quando um cartão se perde, sem tocar no registo.
  - **A decisão é toda do servidor** (RPC `check_in_by_qr`, `security definer`):
    que treino, se conta como `presente` ou `atraso`, e se o atleta é mesmo
    daquela equipa e clube. O quiosque nunca escreve na tabela. Como o
    `security definer` **não passa pelo RLS**, a função filtra `org_id` à mão —
    incluindo ao ler as definições, senão herdava a tolerância de outro clube.
  - **Sem treino escolhido**, a RPC procura o treino da equipa DO ATLETA mais
    próximo de agora, dentro da janela configurada. É o que permite um só
    quiosque à entrada a servir vários escalões ao mesmo tempo.
  - **A decisão humana ganha à câmara**: um estado já marcado como `presente`,
    `atraso` ou `justificado` não é sobreposto (passar o cartão duas vezes
    devolve "já registado"); uma `falta` é corrigida pela leitura.
  - `attendances.source` (`manual`|`qr`) e `checked_in_at` guardam a origem; a
    lista de presenças mostra "Cartão QR" e a hora da passagem.
  - **Fechar sessão** (`close_attendance_session`) marca `falta` a quem ficou
    sem registo nenhum — sem isso os ausentes ficavam só "sem registo", que não
    conta para a taxa de comparência.
  - **Cartões**: `players-qr.js` gera uma folha A4 imprimível por equipa (nos
    Plantéis, "Cartões QR"), para os escalões sem telemóvel; quem tem conta vê
    o mesmo código no portal do atleta. As bibliotecas (`qrcode`, `jsqr`) são
    carregadas dinamicamente — o quiosque e os cartões são chunks à parte.
  - **Sem rede** (pavilhão com wifi fraca) as leituras ficam numa fila em
    `localStorage` e são enviadas quando a ligação volta.
  - **O cartão do atleta sobrevive à falta de rede** (`offline-card.js`): o
    portal guarda o SVG já desenhado no dispositivo, e se os dados não
    carregarem o `app-shell` mostra um ecrã só com o cartão. Guarda-se o SVG e
    não só o token para não depender de a biblioteca do QR estar em cache. O
    service worker (`public/sw.js`) faz cache do próprio site (rede primeiro,
    cache como recurso) e assume o controlo logo na 1.ª visita
    (`skipWaiting`+`clients.claim`) — sem isso a primeira visita não guardava
    nada. Sair da conta apaga o cartão guardado.
  - **O palco do quiosque é desenhado uma vez.** Trocar de sessão ou de câmara
    atualiza pontos concretos do DOM — reescrever o `innerHTML` destruía o
    `<video>` e obrigava a repedir a câmara. O seletor da barra lista os treinos
    de HOJE (lidos a cada abertura), para cada treinador que chega escolher o
    seu sem sair do quiosque.
  - **Os diálogos do quiosque vivem dentro do próprio quiosque** (`kioskPanel`),
    e não via `confirmDialog`: em ecrã inteiro só é desenhado o que está dentro
    do elemento em ecrã inteiro. O `.kiosk` está em `z-index: 90` — acima do
    layout, abaixo dos modais (100) e dos toasts (400).
  - Definições do clube: ligar/desligar, tolerância e janela do quiosque. A UI
    só as mostra depois de a migração correr (`'qr_checkin_enabled' in
    state.settings`).
- **Decisão Tática** (`supabase/tatica.sql`, `tactical-court.js`): treino de
  DECISÃO — não de execução — para TODAS as posições. O treinador monta o
  cenário arrastando as peças (`views/tatica.js`); a atleta responde no portal
  com **um só gesto**.
  - **Uma forma serve todas as posições.** Todas as decisões de voleibol são:
    um campo, qualquer coisa que se move e congela, um conjunto de opções
    classificadas, e um token que se arrasta. O que muda é só o token e as
    opções — daí `TACTICAL_ROLES` em `constants.js` ter apenas `token`
    (`bola`|`atleta`) e `optionKind` (`jogadora`|`zona`|`posicao`):

    | Família | Posições | Pergunta | Gesto |
    |---|---|---|---|
    | para onde vai a bola | distribuidora, atacante, serviço | para quem / que zona? | arrasta a **bola** |
    | onde me coloco | bloco, defesa, receção | fecho ou fico? | arrasta a **sua peça** |

  - **As opções são MARCADAS pelo treinador**, também nas de posicionamento.
    Medir a distância a um sítio "certo" reintroduzia uma resposta única com
    tolerância — e uma central 40 cm ao lado não errou nada.
  - **O cenário move-se e congela.** QUALQUER peça tem posição inicial (`x`,`y`)
    e final (`x2`,`y2`); animam 1,5 s e param. É o MOVIMENTO que se lê em jogo:
    duas centrais podem ocupar o mesmo sítio numa fotografia e significar coisas
    opostas. Não há lista de "blocadoras": numa jogada de central quem se desloca
    é o distribuidor adversário, numa receção é a própria bola — uma lista com
    nome de posição fixava a ferramenta numa só pergunta.
  - **Não há resposta certa**: cada opção é `otima|aceitavel|ma` com uma razão
    escrita, e a atleta vê-as todas depois de responder. Por isso
    `tactical_answers` **não tem coluna de pontuação** e o resumo
    (`answerSummary`) conta por OPÇÃO e nunca por atleta: meio plantel a jogar
    na ponta com a central livre é um problema de treino, não uma nota.
  - **Só a primeira resposta é dado**: `unique (scenario_id, player_id)` e
    nenhuma política de UPDATE. Repetir depois de ver a correção é treino
    legítimo (a app deixa), mas já não é uma leitura — o conflito é engolido em
    silêncio, que o atleta não fez nada de errado.
  - **A fatia de campo é calculada, não configurada** (`viewWindow`): o viewBox
    ajusta-se às peças do cenário, com a rede sempre visível. Desenhar os 18 m
    encolhia o que interessa, mas uma janela fixa por posição partia-se assim
    que o treinador arrastasse uma peça para fora dela — foi o que aconteceu
    com o serviço, que atravessa o campo todo.
  - **As peças ligam-se a fichas reais** (`player_id`) e mostram a altura de
    `physical_profiles`: é o que faz o matchup deixar de ser abstrato, e o que
    justifica isto viver na Rumia em vez de ser uma app de tática à parte.
    Mudar a equipa do cenário desliga as fichas (são de outro plantel).
  - **Rascunho vs publicado**: só `published` chega ao portal. Um cenário meio
    feito ensinaria o erro. O RLS reforça-o — o atleta só lê publicados da sua
    equipa.
  - **Quem escreve o quê**: o treinador cria cenários SÓ nas suas equipas
    (`team_coaches`); um cenário sem equipa é do clube — chega a todos os
    escalões — e é exclusivo do coordenador. A política `tsc_write` é por isso
    assimétrica em relação à `tsc_read`: o treinador **lê** os de clube mas não
    os pode escrever. Sem isso, um treinador de séniores publicava um cenário
    aos infantis.
  - **No portal a atleta vê primeiro os da SUA posição** (`TACTICAL_ROLE_MATCH`
    cruza `players.position` por palavra-chave, porque `settings.positions` é
    configurável pelo clube), com um botão para abrir os restantes: perceber a
    decisão de quem lhe joga a bola é dos usos mais valiosos.
  - **Posições em METROS** do campo real (largura 0–9, rede em y=3, o nosso
    campo a crescer para y maior) e não em píxeis, para o mesmo cenário desenhar
    bem no telemóvel e no projetor.
  - O arrasto usa **pointer events** e não `dragstart` do HTML5 — tem de
    funcionar ao toque, que é onde vai ser usado.
  - A gravação é automática e **silenciosa** (`saveScenario` no `store.js`,
    exceção deliberada à regra dos toasts): montar um cenário são dezenas de
    escritas em segundos, e um aviso por gesto tornava o ecrã ilegível.
- **Resultados de jogo** (`supabase/resultados.sql`): `game_results` (final em
  sets, na perspetiva do clube) + `game_sets` (parciais). Quem regista é o
  **treinador**, depois do jogo — e é por isso que o resultado NÃO vive em
  `events`, que só o coordenador pode editar: as tabelas novas têm política
  própria (coordenador, ou treinador nos jogos das suas equipas).
  - **Os parciais mandam no final**: um trigger (`sync_game_result`) reconta
    `sets_for`/`sets_against` a partir deles. Sem parciais, fica o que o
    treinador escreveu à mão. Um valor com dois donos acaba em divergência.
  - **No voleibol não há relógio**: a participação mede-se em PONTOS
    (`game_minutes.points`), não em minutos. A coluna `minutes` mantém-se para
    as modalidades com cronómetro — a app é multi-modalidade e `settings.sport`
    decide qual aparece. O nome da tabela ficou herdado.
  - **Os parciais são o denominador**: "jogou 96 pontos" só significa alguma
    coisa contra os pontos disputados no jogo, que é a soma dos parciais. Sem
    eles, `playerGameShare` devolve `share: null` — prefere-se não mostrar nada
    a inventar uma percentagem.
  - Um jogo cuja participação NUNCA foi preenchida não entra no cálculo: contá-lo
    como "zero pontos" penalizava o atleta pelo registo que o treinador ainda não
    fez. Quando há registo de alguém, quem não tem linha é porque não jogou. Os
    pontos de um atleta são ainda limitados ao total do jogo — mais do que isso é
    engano de digitação (validado também no ecrã de registo).
- **Biblioteca de exercícios** (`supabase/exercicios.sql`, `views/exercicios.js`):
  o plano de treino escrevia-se de raiz todas as semanas. A biblioteca guarda
  cada exercício UMA vez e o plano passa a ser uma escolha ("Da biblioteca" no
  modal do plano; "Guardar" num bloco escrito à mão põe-no lá).
  - **É do CLUBE, não de cada treinador.** O exercício que o treinador de
    séniores afinou serve aos juvenis, e um clube que muda de equipa técnica não
    perde o trabalho de anos. `created_by` diz a quem perguntar; editar é de
    todos (RLS `ex_write`: coordenador + treinador, sem recorte por equipa —
    um exercício não pertence a um escalão).
  - **Copia-se para o plano, não se referencia.** Os campos são copiados para
    `training_plan_items`; guarda-se `exercise_id` só para saber o que se usa
    mesmo. Um treino que já aconteceu é um registo histórico: se apontasse para
    a biblioteca, editar o exercício amanhã reescrevia o que se treinou no mês
    passado.
  - **Filtra-se por número de atletas** (`min_players`/`max_players`): a
    pergunta real não é "que exercícios de receção tenho?", é "quais funcionam
    com os 9 que apareceram hoje?". Sem mínimo/máximo declarado, serve sempre —
    não se esconde um exercício por falta de dados. O seletor abre já com o
    tamanho do plantel preenchido.
  - O atleta não lê a biblioteca: é material de trabalho do treinador.
- **Painel do treinador** (`renderTreinadorPainel` em `painel.js`): o painel
  genérico é o resumo do CLUBE (angariado, quotas, inventário) — para quem
  treina, isso é informação de outra pessoa. O do treinador responde por ordem
  a: o que tenho hoje, o que ficou por fechar, o que tenho de preparar. Tudo
  recortado às suas equipas (`myTeams`/`isMyEvent` em `compute.js`, que também
  passaram a recortar `attendanceStats`/`attendanceTrend`/`trainingsToMark`).
  - **As presenças por marcar são o centro do ecrã**, não um cartão no fundo:
    é a tarefa que se acumula (um treino por marcar vira quinze em três
    semanas) e a única que, por ficar por fazer, estraga todos os números
    calculados a seguir — comparência, quedas individuais, "treina muito, joga
    pouco". Aparecem TODAS (não as primeiras seis), separadas entre hoje e
    atrasadas, com a idade de cada uma.
  - **Fechar em lote** (`closeAttendanceSessions` no `store.js`): marcar treino
    a treino de há um mês não é registo, é ficção — o que se sabe mesmo é quem
    não tem registo nenhum. Um botão fecha de uma vez as sessões com mais de 7
    dias, com uma escrita por treino e um só toast.
  - Mais três blocos que existiam mas estavam a três cliques: treinos dos
    próximos 7 dias **sem exercícios no plano** (uma linha de plano vazia é um
    plano por fazer), **jogos por registar** resultado, e quem **não está a
    100%** (disponibilidade, sem detalhe clínico).
- **Painel personalizável** (`supabase/painel-avisos.sql`): dois catálogos em
  `painel.js` — `METRIC_CATALOG` (os cartões de números) e `ALERT_CATALOG` (a
  lista "A precisar da tua atenção"). Cada entrada declara quem a **pode** ver
  (`can`). A permissão manda; a preferência só escolhe dentro do que já era
  permitido.
  - Guardam-se os **escondidos** (`profiles.hidden_alerts` /
    `profiles.hidden_metrics`) e não os visíveis: assim uma entrada nova aparece
    a toda a gente por omissão, em vez de ficar invisível a quem já tinha
    preferências gravadas.
  - Escreve-se pela RPC `set_painel_prefs`, **nunca** por update direto:
    `profiles` só é editável pelo coordenador, e abrir a auto-edição deixaria
    qualquer utilizador mudar o seu próprio `role`. A função toca só nessas
    colunas e só na linha de quem chama. (`set_hidden_alerts` mantém-se como
    invólucro, por compatibilidade.)
  - O botão ("Personalizar") está no **cabeçalho** do Painel e não no cartão dos
    avisos: quem escondesse tudo ficaria sem forma de voltar atrás.
  - **Cartões**: `clubRecord()` dá o balanço competitivo (V–D, taxa, forma
    recente) e `attendanceTrend()` dá a variação da comparência a 30 dias — um
    número sem direção é trivia, e o cartão passa a âmbar quando a queda excede
    10 pontos. Não há cartão de "Equipas": repetia o que já estava na legenda
    de "Atletas".
- **Treina muito, joga pouco** (`trainingVsPlayingGaps`): cruza a comparência
  nos treinos com a participação em jogo e assinala no Painel quem vai a tudo e
  quase não joga — dos sinais mais precoces de desistência na formação, e
  invisível se se olhar para os dois números em separado. Limiares configuráveis nas
  Definições (por omissão >=80% de presenças, <=25% de participação, mínimo 5
  treinos e 3 jogos, e as Definições recusam presenças <= participação, que
  inverteria o sentido do aviso): uma lista que assinala meio plantel deixa de
  ser lida. **Não é um
  juízo sobre o treinador** — é obrigar a que seja decisão consciente em vez de
  uma coisa que simplesmente acontece.
- **"Quem vem" é um ecrã só, por evento** (`presencas.js`): a convocatória era
  um modal do Calendário, a resposta do atleta decorava dois ecrãs diferentes e
  as presenças eram uma secção à parte que só via treinos. São três perguntas
  sobre o MESMO evento e as mesmas pessoas, e ninguém as faz em separado.
  Escolhe-se o evento e o ecrã adapta-se ao tipo:
  - **treino** → respostas + presenças (Presente / Atraso / Justificado / Falta),
    com o quiosque QR e o "fechar sessão";
  - **jogo** → respostas + convocatória (convocado / titular / suplente).

  A separação por tipo é deliberada: `attendanceStats` conta TODAS as presenças
  que existirem, por isso marcar presenças em jogos misturaria comparência ao
  treino com participação em jogo — os dois números que o
  `trainingVsPlayingGaps` cruza precisamente por serem diferentes. Quem jogou
  mede-se em pontos, no registo do resultado. O Calendário e o Painel deixam de
  abrir um modal: escolhem o evento (`setSelectedEvent`) e navegam para cá, e o
  botão só aparece a quem tem acesso à secção.

- **Portal do atleta** (`portal.js`): é o único ecrã da Rumia cujo utilizador
  não é do clube a trabalhar — é uma atleta, no telemóvel, trinta segundos.
  Estava desenhado como uma página de gestão: nove secções empilhadas, todas
  com o mesmo peso, cinco ou seis ecrãs de scroll. A estrutura responde agora
  às três perguntas por que alguém abre isto, por ordem:
  - **O que tenho a seguir** — um cabeçalho de ação com o próximo compromisso
    (dia relativo: "Hoje", "Amanhã"), hora, sítio e os botões de resposta já à
    mão. Vive ACIMA dos separadores, porque é a razão da visita e não uma das
    áreas; a pergunta mais frequente do portal não pode estar a meio de um
    scroll. Só o cartão QR e a disponibilidade lhe disputavam o topo — e a
    disponibilidade só aparece quando NÃO está tudo bem: dizer "Apto" a quem
    está apto é gastar o cimo do ecrã com uma não-notícia.
  - **Como vai a época** e **onde está o cartão** — separadores (`Hoje` ·
    `A época` · `Cartão`), no mesmo padrão do `saude.js`/`treino.js`. O cartão
    é guardado no dispositivo em TODAS as visitas, mesmo com o separador
    fechado: é à porta do pavilhão, sem rede, que ele faz falta, e aí já não
    há como o ir buscar.
  - **Não se desenham botões que só servem para dar erro** (`canRespondToEvent`
    em `compute.js`): um evento do clube (`team_id` nulo) é visível a toda a
    gente — o RLS de `events` deixa-o passar — mas o `respond_to_event`
    recusa-o. Onde havia "Vou"/"Não vou" a devolver *"Este evento não é da tua
    equipa"*, diz-se agora o que aquilo é. É a mesma regra da janela de
    resposta.
  - **O atleta é encontrado pelo `user_id` e por mais nada.** O recurso a
    `state.players[0]` que aqui esteve mostrava as presenças, as quotas e o
    **cartão QR** de outra pessoa a quem tivesse a conta ainda por ligar. Um
    portal vazio é mau; o portal de outra atleta é grave.
  - O motivo de um "não vou" pede-se no `openModal` e não no `prompt()` do
    browser — e a gravação corre DENTRO do `onSubmit`, para o erro aparecer no
    formulário e para cancelar não deixar os botões presos à espera.
  - **Moldura de quem só tem uma secção** (`.app--solo` no `app-shell`): sem
    sítios para onde ir não há navegação a mostrar. O atleta tem UMA rota
    permitida e ficava com barra lateral, hambúrguer e uma pesquisa que —
    filtrada por `canAccess` — só lhe podia devolver a página onde já estava,
    ocupando o elemento mais proeminente do telemóvel. Caem os três (e o
    atalho Ctrl+K com eles).

- **Comunicação clube ↔ atleta** (`supabase/comunicacao.sql`): o portal deixa
  de ser só de leitura.
  - **Atleta → clube**: `event_responses` (`vou`|`nao_vou` + motivo) serve
    tanto para confirmar uma convocatória como para avisar que falta a um
    treino — para quem treina o problema é o mesmo: saber com quem conta. Só se
    escreve pela RPC `respond_to_event` (`security definer`), que valida que é o
    próprio, que o evento é da sua equipa e que está dentro do prazo; a tabela
    não tem política de escrita.
  - **São duas respostas, não três.** Havia um "ainda não sei", e ele
    respondia-se exatamente como o silêncio: o treinador continuava sem saber
    com quem contava, mas via a linha como respondida e deixava de insistir.
    Ficar por responder já diz o mesmo, e diz a verdade.
  - **O treino fecha às respostas 6 horas antes de começar**
    (`RESPONSE_LEAD_HOURS` em `constants.js`, validado no servidor). Uma falta
    avisada à hora do treino não é um aviso — quem treina já saiu de casa com o
    plano feito e já não chama ninguém. O **jogo** aceita até começar: uma
    convocatória confirma-se até ao último momento e aí saber tarde é melhor do
    que não saber. `eventResponseWindow()` espelha o prazo no portal, para não
    haver um botão que existe só para dar erro.
  - **Uma resposta NÃO é uma presença.** Quem regista o que aconteceu continua a
    ser o treinador ou o cartão QR. Se um "não vou" marcasse falta justificada
    sozinho, o atleta justificava-se a si próprio — e isso é decisão de quem
    treina. A vista Presenças mostra os avisos por cima da lista, para o
    treinador decidir.
  - **Quem é avisado** (`event_response_audience`): o **treino é do
    treinador** — quem vai ao treino de sexta é trabalho de quem o dá, e um
    coordenador com dez escalões receberia centenas de respostas por semana
    sobre treinos a que não vai. O **jogo** é do clube: aí entra também o
    coordenador. A exceção é a equipa sem NENHUM treinador com conta ligada
    (`team_trainer_user_ids` sai de `team_coaches` → `coaches.user_id`, e é
    muitas vezes o próprio coordenador quem trata do plantel): sem essa
    salvaguarda a resposta não chegava a ninguém, que foi o sintoma original.
    Avisa-se cada resposta NOVA ou mudada, "vou" incluído: notificar só as
    faltas deixava quem está do outro lado sem forma de distinguir "ainda
    ninguém respondeu" de "não está a chegar nada". Repetir a mesma resposta não
    notifica.
  - **Clube → atleta**: RPC `send_team_announcement` cria uma notificação por
    atleta COM CONTA (reaproveita `notifications`). O **inbox é de toda a
    gente**: `setupNotifications` no `app-shell` estava reservado ao
    coordenador e ao treinador, e por isso o aviso chegava à base de dados mas
    nunca à secção "Avisos do clube" do portal. Quem vê o quê é decidido pelo
    RLS (cada um lê o que lhe é dirigido), não pelo papel de quem carrega a
    lista. Devolve quantos foram avisados — o número mostra ao treinador quantos ainda não têm conta.
    Enviado dos Plantéis ("Enviar aviso"); o treinador só avisa as suas equipas.
- **Notificações no telemóvel** (`supabase/web-push.sql`, `src/push.js`,
  `supabase/functions/send-push`): o sino só toca a quem tem a app ABERTA — um
  treino cancelado às 8h da manhã só era visto por quem calhasse de abrir a
  Rumia nesse dia. O Web Push entrega a notificação com a app fechada, no
  Android e no iOS.
  - **Nada muda no resto do código**: quem quer avisar alguém continua a
    inserir uma linha em `notifications`. Um trigger (`push_on_notification`)
    chama a Edge Function `send-push` por `pg_net`, que assina com VAPID e
    entrega. Há um sítio só a decidir o que é uma notificação; o push é a
    última perna do caminho, não um segundo sistema a manter em sincronia.
  - **O push é um extra e falha em silêncio**: a chamada vai dentro de um
    bloco de exceção e o `pg_net` é assíncrono. Uma função em baixo não pode
    atrasar — muito menos anular — o INSERT que a originou; a notificação fica
    na tabela e aparece no sino como sempre.
  - **A chave privada VAPID nunca sai do servidor** (segredo da Edge
    Function). A pública vai no `VITE_VAPID_PUBLIC_KEY` de propósito: só
    identifica o remetente. O URL e a `service_role` key do trigger vivem em
    `private.push_config`, num schema com RLS e **sem políticas**.
  - **Subscrições mortas apagam-se** (404/410 do servidor de push): quem
    desinstalou a app deixa de contar, senão cada envio arrastava para sempre
    endereços que já não existem.
  - **iOS só entrega push a uma PWA instalada** no ecrã principal (16.4+). Não
    é contornável — por isso `iosNeedsInstall()` troca o botão "Ativar" pelas
    instruções de instalação, em vez de pedir uma permissão que o Safari nem
    mostra.
  - **Re-subscrever é automático**: quem já deu permissão volta a ser inscrito
    em silêncio a cada arranque. O endereço de push muda sozinho (o browser
    renova-o, a app é reinstalada) e, quando muda, as notificações deixavam de
    chegar sem ninguém dar por isso.
  - **Sair da conta larga o push** deste dispositivo: num tablet partilhado, o
    aviso seguinte seria dirigido a outra pessoa.
- **Queda individual de comparência** (`attendanceDrops`): a taxa do clube é uma
  média, e uma média esconde precisamente o caso que interessa — o atleta que
  vinha a tudo e deixou de vir. Enquanto o resto do plantel compensa, o número
  global não mexe; quando mexe, já é tarde. Compara os últimos N treinos COM
  registo com os anteriores (treinos por fechar não contam, senão contariam como
  faltas) e assinala por dois motivos distintos: `queda` (o hábito quebrou-se) e
  `seguidas` (faltou às últimas N — assinala mesmo com média alta, porque a
  média demora a cair). Quando ambos se aplicam ganha a `queda`, que diz mais.
  Limiares nas Definições (`drop_*`, ver `supabase/resumo-semanal.sql`).
- **Histórico de lesões** (`injuryStats`, separador Histórico do Dept. Médico):
  lê em conjunto os episódios que já estavam registados um a um. Agrupa por
  `body_area` e responde a duas perguntas que ninguém conseguia responder ficha
  a ficha: quanto tempo demora a alta e que zonas voltam sempre. Uma
  **recidiva** é um atleta com mais do que um episódio na mesma zona — é o
  número que diz se a alta está a ser dada cedo demais. A média de dias só conta
  episódios com alta e com as duas datas: incluir os que ainda decorrem daria um
  tempo de retorno mais curto do que o real.
- **Evolução física** (`playerTestProgress`): mostrar só a última medição
  desperdiça o trabalho de medir — o que interessa não é "salta 41 cm", é
  "saltava 37 e agora salta 41". A **direção** da variação não é o sinal do
  número: cada teste declara `better` (`up`/`down`/`null`) em `constants.js`,
  porque subir 3 cm no CMJ é bom e subir 0,3 s no sprint é mau. Com `better`
  nulo (IMC) mostra-se a variação **sem juízo de valor**: um IMC que sobe pode
  ser massa muscular ganha, e chamar-lhe "pior" seria dizer uma coisa que os
  dados não sustentam.
- **Resumo semanal** (`supabase/resumo-semanal.sql`): documentos a caducar,
  quotas em dívida, atletas em tratamento e avaliações por decidir chegam ao
  coordenador e à direção por notificação + Web Push, à segunda de manhã. O
  Painel já calculava tudo isto, mas só quem o ABRE é que via — e um exame
  médico caducado é um risco legal, não um cartão bonito. Uma semana sem nada
  pendente **não gera notificação**: um resumo que chega sempre a dizer "está
  tudo bem" deixa de ser lido, e quando houver mesmo alguma coisa passa
  despercebido. Corre com chave de serviço, por isso filtra `org_id` à mão.
- **Dados de exemplo** (`demo-data.js`, `supabase/dados-exemplo.sql`): um clube
  novo arrancava vazio, e quem entra pela primeira vez — muitas vezes um
  treinador que clicou num link — fechava a app sem perceber o que ela faz. O
  onboarding oferece (ligado por omissão) semear dois escalões, os plantéis, um
  mês de treinos, jogos e quotas.
  - **Os dados são de mentira mas COERENTES**: os treinos têm presenças, os
    jogos têm parciais e participação, as quotas têm quem pagou e quem não
    pagou. É a coerência que faz o Painel calcular comparência, quedas
    individuais e "treina muito, joga pouco" — e são esses números, não as
    listas, que mostram o que a app vale. Pela mesma razão, três atletas
    deixam de aparecer na última quinzena: um clube de exemplo onde corre tudo
    bem não tem nada para assinalar.
  - **A marca do que foi semeado vive em `settings.demo_seed`** (os ids), e não
    numa coluna `is_demo` em cada tabela: assim limpar apaga exatamente aquilo
    e a marca desaparece com a limpeza, em vez de ficar em dezenas de tabelas
    para sempre. Presenças, quotas, convocatórias e resultados não são
    registados — caem em cascata com o evento ou o atleta.
  - **Escreve direto no Supabase**, não por `createRow`/`createRows`: são
    dezenas de inserções numa operação que é conceptualmente uma só (mesma
    razão do `applySeasonRollover`). E se falhar no onboarding, o clube já
    existe e o utilizador entra na mesma — vazio é mau, preso é pior.
  - Limpar é do coordenador, nas Definições → Estrutura.

- **Avaliação de plantel**: `players.review_status` ∈ `pendente|mantem|sai`
  (omissão `pendente`). A vista `avaliacao.js` deixa o coordenador/treinador
  decidir, por equipa, quem fica na próxima época, com contadores. Não apaga
  ninguém — é só planeamento. Editável por quem tem `canEdit('players')`.
- **Viragem de época** (`nova-epoca.js`, Definições → Estrutura, só coordenador):
  a Avaliação decide *quem* fica; o assistente aplica essa decisão a todo o
  clube de uma vez — sobe de equipa quem fica, arquiva quem sai, repõe as
  avaliações a `pendente` e grava a época nova.
  - **Propõe, não decide.** A equipa de destino sugerida é a do escalão seguinte
    (a ordem é a configurada nas Definições) com o mesmo género, quando essa
    equipa existe; caso contrário fica onde está. Tudo é mostrado antes de
    aplicar e o destino de cada equipa pode ser mudado.
  - **Quem está `pendente` não se mexe.** Uma decisão que não foi tomada não é
    uma decisão — subir ou arquivar por omissão seria decidir em nome de quem
    não decidiu.
  - **Vai em lote** (`applySeasonRollover` no `store.js`): uma escrita por grupo
    e um `loadAll()` no fim. Chamar `archiveRow` por atleta faria 200 idas à
    base de dados e 200 toasts numa operação que é conceptualmente uma só.
  - Nada é apagado: quem sai fica arquivado e pode ser reposto nos Arquivados.
- **Relatórios imprimíveis** (`report-sheet.js` + `athlete-report.js` /
  `game-report.js`): folhas A4 geradas no browser a partir do `state`, no molde
  do `players-qr.js` (janela nova, autónoma, com botão de imprimir). Servem
  para o que a app não consegue: entregar a ficha ao encarregado de educação,
  afixar o resumo do jogo no balneário, anexar um documento a um email.
  - **A folha respeita as permissões de quem a gera**: sem `canAccess('medico')`
    ou `canAccess('fisica')` as secções nem são construídas. Imprimir não pode
    ser uma porta lateral para dados reservados.
  - São chunks à parte, carregados só quando alguém pede o relatório.
- **Departamento Médico / Fisioterapia**: processo clínico digital do atleta.
  - `clinical_episodes` — episódios clínicos (ex.: lesões) com `status`
    (`ativo|recuperacao|alta`), avaliação inicial, diagnóstico funcional, plano
    de tratamento, evolução, restrições, previsão de retorno e data de alta.
  - `clinical_sessions` — sessões realizadas dentro de um episódio (data + notas).
  - `physio_appointments` — atendimentos agendados (`avaliacao|tratamento|
    reavaliacao`) com estado (`agendado|realizado|faltou|cancelado`), data/hora.
  - A vista `medico.js` lista todos os atletas (com o estado clínico) e a agenda;
    `clinical-file.js` é a ficha clínica (abre também a partir dos Plantéis para
    o coordenador/fisioterapeuta). `compute.appointmentConflicts()` avisa quando
    um atendimento se sobrepõe a um treino/jogo da equipa do atleta.
  - Editável por quem tem `canEdit('clinical')` / `canEdit('appointments')`
    (coordenador e fisioterapeuta), em linha com o RLS `med_rw`.
- **Preparação Física**: gestão do preparador físico (e coordenador).
  - `physical_profiles` (1:1 atleta) — altura, peso, mão dominante; o IMC é
    calculado (`compute.bmi`). `medical_history` (1:1) — limitações, lesões,
    cirurgias, doenças crónicas, medicação (editada pela fisio; lida também
    pelo preparador).
  - `physical_tests` — avaliações físicas (antropometria + testes: % massa
    gorda, 1RM, aperto de mão, saltos, CMJ…) por atleta e data; tipos em
    `constants.PHYSICAL_TEST_TYPES` (com `outro` de etiqueta livre).
  - Periodização por equipa: `training_phases` (macrociclo: pré-época, fases,
    paragens, off-season), `mesocycles` (mensais, com `objective`),
    `gym_sessions` (treinos) e `gym_exercises` (séries/carga/reps/OBS).
  - Controlo por atleta: `gym_attendance` (presenças nos treinos → treinos
    feitos, faltas, tempo) e `game_minutes` (minutos de jogo por jogo).
  - A vista `preparacao.js` tem três separadores (Atletas, Periodização, Mapa
    de jogos); `physical-file.js` é a ficha física do atleta (abre também dos
    Plantéis). Editável por quem tem `canEdit('physical')`.

## Convenções

- Interface 100% em **português europeu**, com acentos.
- As **chaves** guardadas na BD estão em `constants.js`; as **etiquetas**
  visíveis também. Manter alinhadas com `supabase/schema.sql`.
- Texto de utilizador é sempre passado por `esc()` antes de ir para HTML.
- Acessibilidade: foco visível, `aria-*` nos modais, `prefers-reduced-motion`.
- Erros mostrados ao utilizador em PT, via `authErrorMessage` / `dbErrorMessage`.

## Esquema da base de dados

Ver [`supabase/schema.sql`](supabase/schema.sql). Tabelas: `settings`
(linha única), `coaches`, `teams`, `players`, `sponsors`, `events`. Cada
tabela tem RLS ativo e uma política `auth_all` que permite tudo a utilizadores
autenticados.
