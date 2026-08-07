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
- **Planos** (tabela `plans`, ver `supabase/plans.sql`): 5 níveis (Solo,
  Treinador+, Essencial, Clube, Clube+) via `organizations.plan`. São
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
- **Convites (UI)**: em `utilizadores.js` o coordenador cria convites (papel +
  acessos), copia o link `?invite=<token>` e revoga-os. A lista vem de
  `state.invitations`.
- **Pendente (follow-up)**: a Edge Function `attendance-reminder` corre com
  chave de serviço (sem `auth.uid()`), por isso as notificações que cria ficam
  com `org_id` nulo — precisa de iterar por clube e definir `org_id`.

## Estrutura de pastas

```
index.html              Ponto de entrada HTML; carrega as fontes e src/main.js
src/
  main.js               Arranque: config -> login -> app shell (router de sessão)
  supabase.js           Cria o cliente Supabase e deteta variáveis em falta
  auth.js               Login/logout/sessão + mensagens de erro em PT
  store.js              Camada de dados: cache em memória, CRUD, backup, eventos
  compute.js            Cálculos derivados (totais, próximos eventos, nomes…)
  permissions.js        Papéis e capacidades (canEdit, canManageUsers…)
  constants.js          Valores partilhados (níveis, estados, escalões, etc.)
  ui.js                 Utilitários de UI (esc, euros, loading/erro/vazio, logo)
  toast.js              Avisos efémeros de confirmação/erro (toastOk/toastError)
  modal.js              Modal de formulário reutilizável + diálogo de confirmação
  style.css             Design system completo (tokens + componentes)
  players-xlsx.js       Importar atletas de .xlsx + gerar modelo (SheetJS lazy)
  qrcode.js             Cartões QR: gerar, ler pela câmara, traduzir (libs lazy)
  players-qr.js         Folha de cartões QR imprimíveis (A4, tamanho cartão)
  offline-card.js       Cartão QR guardado no dispositivo (ecrã de recurso sem rede)
  assets/logo.svg       Logótipo do clube (emblema SVG)
  views/
    config-help.js      Ecrã quando faltam as variáveis do Supabase
    login.js            Ecrã de login
    app-shell.js        Layout (top bar + barra lateral colapsável + router)
    painel.js           Vista Painel
    patrocinios.js      Separador Patrocínios (dentro do Financeiro)
    planteis.js         Vista Plantéis (CRUD + importar atletas via .xlsx)
    athlete-profile.js  Perfil do Atleta (modal unificado com separadores)
    avaliacao.js        Vista Avaliação de plantel (Mantém/Sai/Pendente)
    saude.js            Vista Saúde & Física (orquestra Médico + Prep. Física)
    medico.js           Separador Fisioterapia (atletas + agenda)
    clinical-file.js    Área de Fisioterapia do perfil (episódios, sessões, atendimentos)
    preparacao.js       Separador Prep. física (atletas + periodização + mapa de jogos)
    physical-file.js    Área de Prep. física do perfil (dados físicos, avaliações, controlo)
    calendario.js       Vista Calendário
    presencas.js        Vista Presenças (marcar + estatísticas de comparência)
    quiosque.js         Modo quiosque: câmara à entrada regista presenças por QR
    resultado.js        Registo do resultado de um jogo (parciais + participação)
    treinadores.js      Vista Treinadores
    definicoes.js       Vista Definições (época, meta, escalões, backup)
    utilizadores.js     Vista Utilizadores (gestão de papéis — só coordenador)
    arquivados.js       Vista Arquivados (registos inativos + repor — só coordenador)
supabase/schema.sql     Tabelas, índices, RLS e dados iniciais (correr no Supabase)
supabase/qrcode-presencas.sql  Presenças por QR: token do atleta + RPCs de check-in
supabase/portal-atleta.sql     Portal: o atleta lê a sua própria disponibilidade
supabase/comunicacao.sql       Respostas do atleta a eventos + avisos do clube
supabase/resultados.sql        Resultado dos jogos (final + parciais) e pontos jogados
supabase/painel-avisos.sql     Limiares do clube + avisos escolhidos por utilizador
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
- `saveSettings`, `replaceAllData` (importar backup), `snapshot` (exportar).
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
| `financeiro`   | Livro-razão (`financeiro`) · Patrocínios (`patrocinios`) · Quotas (`quotas`) |
| `saude`        | Fisioterapia (`medico`) · Prep. física (`fisica`)                    |
| `equipamentos` | Inventário (`equipamentos`) · Encomendas (`encomendas`)              |

A entrada só aparece se **alguma** das suas permissões passar (ver `can` no
`NAV`). `openFinanceiroTab()` / `openSaudeTab()` deixam outra vista escolher o
separador antes de navegar (usado pelos cartões do Painel).

- **Endereços antigos**: `LEGACY_ROUTES` no `app-shell` redirecciona `#/medico`,
  `#/fisica`, `#/quotas` e `#/patrocinios` para a secção que os absorveu, já no
  separador certo — links partilhados e favoritos continuam a funcionar.
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
- **Comunicação clube ↔ atleta** (`supabase/comunicacao.sql`): o portal deixa
  de ser só de leitura.
  - **Atleta → clube**: `event_responses` (`vou`|`nao_vou`|`duvida` + motivo)
    serve tanto para confirmar uma convocatória como para avisar que falta a um
    treino — para quem treina o problema é o mesmo: saber com quem conta. Só se
    escreve pela RPC `respond_to_event` (`security definer`), que valida que é o
    próprio, que o evento é da sua equipa e que ainda não passou; a tabela não
    tem política de escrita.
  - **Uma resposta NÃO é uma presença.** Quem regista o que aconteceu continua a
    ser o treinador ou o cartão QR. Se um "não vou" marcasse falta justificada
    sozinho, o atleta justificava-se a si próprio — e isso é decisão de quem
    treina. A vista Presenças mostra os avisos por cima da lista, para o
    treinador decidir.
  - **Notifica só o que interessa**: a equipa técnica é avisada quando alguém
    passa a "não vou" (e não a cada "vou", que seria ruído).
  - **Clube → atleta**: RPC `send_team_announcement` cria uma notificação por
    atleta COM CONTA (reaproveita `notifications` + Web Push). Devolve quantos
    foram avisados — o número mostra ao treinador quantos ainda não têm conta.
    Enviado dos Plantéis ("Enviar aviso"); o treinador só avisa as suas equipas.
- **Avaliação de plantel**: `players.review_status` ∈ `pendente|mantem|sai`
  (omissão `pendente`). A vista `avaliacao.js` deixa o coordenador/treinador
  decidir, por equipa, quem fica na próxima época, com contadores. Não apaga
  ninguém — é só planeamento. Editável por quem tem `canEdit('players')`.
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
