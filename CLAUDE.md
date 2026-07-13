# CLAUDE.md — Arquitetura da Rumia

Guia para quem (humano ou IA) trabalhar neste projeto. Para instruções de
instalação e setup, ver [`README.md`](README.md).

## Visão geral

Aplicação web **vanilla JavaScript** (sem framework) servida pelo **Vite**.
A persistência e a autenticação são do **Supabase**. Modelo de dados de
**clube único, partilhado**: qualquer utilizador autenticado vê e edita os
mesmos dados. O controlo de acesso é o login + o RLS do Supabase, não filtros
por utilizador.

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
  modal.js              Modal de formulário reutilizável + diálogo de confirmação
  style.css             Design system completo (tokens + componentes)
  players-xlsx.js       Importar atletas de .xlsx + gerar modelo (SheetJS lazy)
  assets/logo.svg       Logótipo do clube (emblema SVG)
  views/
    config-help.js      Ecrã quando faltam as variáveis do Supabase
    login.js            Ecrã de login
    app-shell.js        Layout (top bar + barra lateral colapsável + router)
    painel.js           Vista Painel
    patrocinios.js      Vista Patrocínios
    planteis.js         Vista Plantéis (CRUD + importar atletas via .xlsx)
    athlete-profile.js  Perfil do Atleta (modal unificado com separadores)
    avaliacao.js        Vista Avaliação de plantel (Mantém/Sai/Pendente)
    medico.js           Vista Departamento Médico (atletas + agenda de fisioterapia)
    clinical-file.js    Área de Fisioterapia do perfil (episódios, sessões, atendimentos)
    preparacao.js       Vista Preparação Física (atletas + periodização + mapa de jogos)
    physical-file.js    Área de Prep. física do perfil (dados físicos, avaliações, controlo)
    calendario.js       Vista Calendário
    treinadores.js      Vista Treinadores
    definicoes.js       Vista Definições (época, meta, escalões, backup)
    utilizadores.js     Vista Utilizadores (gestão de papéis — só coordenador)
    arquivados.js       Vista Arquivados (registos inativos + repor — só coordenador)
supabase/schema.sql     Tabelas, índices, RLS e dados iniciais (correr no Supabase)
public/                 Ficheiros estáticos (modelo-atletas-rumia.xlsx)
```

## Fluxo de arranque (`main.js`)

1. Sem variáveis do Supabase → `renderConfigHelp` (ecrã de ajuda).
2. Sem sessão → `renderLogin`.
3. Com sessão → `renderAppShell`, que carrega todos os dados e mostra as vistas.

`onAuthChange` reage a login/logout (inclusive noutros separadores).

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
   para remover usa `confirmDialog(...)`.
4. Após uma operação no `store`, a notificação re-desenha a vista — por isso
   as vistas **não** atualizam o DOM manualmente após guardar.

Filtros e estados locais de UI (ex.: equipas expandidas) vivem em variáveis no
topo do módulo da vista.

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
- **Credenciação do treinador**: `coaches.license_number` (Nº da Licença) e
  `coaches.tptd` são texto livre, opcionais; mostrados na ficha do treinador.
- **Importar atletas (.xlsx)**: nos Plantéis, cada equipa tem "Importar (xlsx)".
  `players-xlsx.js` lê o ficheiro com SheetJS (carregado dinamicamente) e mapeia
  as colunas por cabeçalho (Nome, Número, Ano de nascimento, Posição; aceita
  variações). Linhas sem nome são ignoradas. Insere em lote via `createRows`.
  O modelo descarrega-se por "Descarregar modelo" (ou de `public/`).
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
