# CLAUDE.md — Arquitetura da Central RCS

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
  assets/logo.svg       Logótipo do clube (emblema SVG)
  views/
    config-help.js      Ecrã quando faltam as variáveis do Supabase
    login.js            Ecrã de login
    app-shell.js        Layout (barra lateral + router) e carregamento inicial
    painel.js           Vista Painel
    patrocinios.js      Vista Patrocínios
    planteis.js         Vista Plantéis
    calendario.js       Vista Calendário
    treinadores.js      Vista Treinadores
    definicoes.js       Vista Definições (época, meta, backup)
    utilizadores.js     Vista Utilizadores (gestão de papéis — só coordenador)
supabase/schema.sql     Tabelas, índices, RLS e dados iniciais (correr no Supabase)
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
  `coordenador` (tudo), `treinador` (edita Plantéis e Calendário; vê o resto)
  ou `leitura` (só vê). Quem se regista começa em `leitura`.
- O **RLS** no Supabase é a fonte de verdade (ver `schema.sql`): leitura para
  todos os autenticados; escrita conforme o papel via a função `app_role()`.
- Na interface, `src/permissions.js` (`canEdit`, `canManageUsers`,
  `canManageSettings`) esconde/mostra ações. É só conveniência de UI — mesmo
  que algo escapasse, o RLS recusa a operação.
- `store.js` carrega o perfil atual em `state.profile` e (se coordenador) todos
  os perfis em `state.profiles`. A vista `utilizadores.js` permite ao
  coordenador mudar papéis. As entradas Definições e Utilizadores na barra
  lateral só aparecem ao coordenador.

## Regras de negócio

- **Total angariado** = soma do valor do nível dos patrocínios com
  `status = 'confirmado'` (Ouro 3000 / Prata 1500 / Bronze 500).
- **Confirmar exige nível**: validado em `patrocinios.js` no `onSubmit`.
- **Contactos em curso** = estados `email`, `telefone`, `conversacao`.
- Apagar uma equipa apaga os atletas (cascade) e liberta os eventos
  (`team_id` → null); apagar um treinador liberta as equipas. Refletido na
  base de dados (FKs) e na cache local em `deleteRow`.

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
