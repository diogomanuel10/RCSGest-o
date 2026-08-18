// Vista: Biblioteca de exercícios.
//
// O plano de treino escrevia-se de raiz todas as semanas. O exercício de
// side-out que resultou em setembro era reescrito de memória em outubro — e a
// variante que o treinador afinou à terceira repetição perdia-se. Aqui o
// exercício guarda-se UMA vez e o plano passa a ser uma escolha (ver o botão
// "Da biblioteca" em training-plan.js).
//
// A biblioteca é DO CLUBE, não de cada treinador: o que o treinador de
// séniores afinou serve aos juvenis, e um clube que muda de equipa técnica não
// perde o trabalho de anos.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';
import { toastError } from '../toast.js';
import { PLAN_CATEGORIES, PLAN_CATEGORY_LABEL, PLAN_CATEGORY_BADGE } from '../constants.js';

// Estado local de UI (persiste entre re-desenhos, como nas outras vistas).
let search = '';
let categoryFilter = '';
let playersFilter = '';  // nº de atletas disponíveis hoje
let page = 1;

// Quantas vezes cada exercício já foi levado para um plano de treino. É a
// única medida honesta de "isto presta": não é uma nota, é uso real.
function usageCount(exerciseId) {
  return state.trainingPlanItems.filter((i) => i.exercise_id === exerciseId).length;
}

// Serve para o número de atletas que apareceram hoje? Um exercício sem
// mínimo/máximo declarado serve sempre — não se esconde por falta de dados.
export function fitsPlayers(ex, n) {
  if (!n) return true;
  if (ex.min_players && n < ex.min_players) return false;
  if (ex.max_players && n > ex.max_players) return false;
  return true;
}

export function filteredExercises() {
  const q = search.trim().toLowerCase();
  const n = parseInt(playersFilter, 10) || 0;
  return state.exercises
    .filter((e) => !categoryFilter || e.category === categoryFilter)
    .filter((e) => fitsPlayers(e, n))
    .filter((e) => {
      if (!q) return true;
      return [e.name, e.objective, e.organization, e.description, e.material]
        .some((v) => (v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function renderExercicios(container) {
  const canWrite = canEdit('exercises');
  const all = state.exercises;
  const items = filteredExercises();
  const pg = paginate(items, page, PAGE_SIZE);

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Exercícios</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Biblioteca do clube — escreve uma vez, usa em qualquer treino
        </p>
      </div>
      ${canWrite ? '<button class="btn btn--accent" id="add-ex" type="button">+ Exercício</button>' : ''}
    </header>

    ${all.length ? filterBarHTML() : ''}

    ${all.length
      ? (items.length
          ? `<ul class="ex-list">${pg.items.map((e) => exerciseCard(e, canWrite)).join('')}</ul>
             ${paginationHTML({ ...pg, id: 'ex' })}`
          : emptyHTML('Nenhum exercício corresponde ao filtro.'))
      : emptyHTML(canWrite
          ? 'A biblioteca está vazia. Guarda aqui os exercícios que repetes — depois puxa-os para o plano de treino num clique.'
          : 'A biblioteca ainda não tem exercícios.')
    }
  `;

  container.querySelector('#add-ex')?.addEventListener('click', () => openExerciseForm());
  container.querySelectorAll('[data-edit-ex]').forEach((b) =>
    b.addEventListener('click', () => openExerciseForm(b.dataset.editEx))
  );
  container.querySelectorAll('[data-copy-ex]').forEach((b) =>
    b.addEventListener('click', () => duplicate(b.dataset.copyEx))
  );
  container.querySelectorAll('[data-del-ex]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.delEx))
  );

  const searchEl = container.querySelector('#ex-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      search = searchEl.value;
      page = 1;
      renderExercicios(container);
      // Devolve o cursor ao fim do texto (a vista re-desenha inteira), como
      // nos Plantéis.
      const el = container.querySelector('#ex-search');
      if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
    });
  }
  container.querySelector('#ex-players')?.addEventListener('change', (e) => {
    playersFilter = e.target.value;
    page = 1;
    renderExercicios(container);
  });
  container.querySelectorAll('[data-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      categoryFilter = b.dataset.cat === categoryFilter ? '' : b.dataset.cat;
      page = 1;
      renderExercicios(container);
    })
  );
  container.querySelector('#ex-clear')?.addEventListener('click', () => {
    search = ''; categoryFilter = ''; playersFilter = ''; page = 1;
    renderExercicios(container);
  });

  wirePagination(container, 'ex', pg.page, pg.totalPages, (np) => {
    page = np;
    renderExercicios(container);
  });
}

function filterBarHTML() {
  const counts = {};
  state.exercises.forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
  return `
    <div class="filter-bar">
      <div class="field field--grow">
        <label for="ex-search">Pesquisar exercício</label>
        <input type="search" id="ex-search" placeholder="Nome, objetivo, material…" value="${esc(search)}" />
      </div>
      <div class="field">
        <label for="ex-players">Atletas disponíveis</label>
        <input type="number" id="ex-players" min="1" placeholder="Qualquer nº" value="${esc(playersFilter)}"
               title="Mostra só os exercícios que funcionam com este número de atletas" />
      </div>
    </div>
    <div class="ex-chips" role="group" aria-label="Filtrar por categoria">
      ${PLAN_CATEGORIES.filter((c) => counts[c.key]).map((c) => `
        <button class="ex-chip${categoryFilter === c.key ? ' ex-chip--active' : ''}"
                data-cat="${esc(c.key)}" type="button" aria-pressed="${categoryFilter === c.key}">
          ${esc(c.label)} <span class="ex-chip__n">${counts[c.key]}</span>
        </button>`).join('')}
      ${search || categoryFilter || playersFilter
        ? '<button class="ex-chip" id="ex-clear" type="button">Limpar filtros</button>'
        : ''}
    </div>
  `;
}

function exerciseCard(ex, canWrite) {
  const meta = [
    ex.duration_min ? `${ex.duration_min} min` : '',
    ex.organization || '',
    ex.reps ? `Reps: ${ex.reps}` : '',
    playersLabel(ex),
  ].filter(Boolean).join(' · ');
  const used = usageCount(ex.id);

  return `
    <li class="card ex-card">
      <div class="ex-card__head">
        <span class="badge badge--${PLAN_CATEGORY_BADGE[ex.category] || 'muted'}">
          ${esc(PLAN_CATEGORY_LABEL[ex.category] || ex.category)}
        </span>
        <strong class="ex-card__name">${esc(ex.name)}</strong>
        ${used ? `<span class="muted ex-card__used">usado ${used}×</span>` : ''}
        ${canWrite ? `
          <div class="cell-actions ex-card__actions">
            <button class="btn btn--ghost btn--sm" data-copy-ex="${ex.id}" type="button" title="Duplicar">Duplicar</button>
            <button class="btn btn--ghost btn--sm" data-edit-ex="${ex.id}" type="button">Editar</button>
            <button class="btn btn--danger btn--sm" data-del-ex="${ex.id}" type="button">Remover</button>
          </div>` : ''}
      </div>
      ${ex.objective ? `<p class="ex-card__obj"><strong>Objetivo:</strong> ${esc(ex.objective)}</p>` : ''}
      ${meta ? `<p class="muted ex-card__meta">${esc(meta)}</p>` : ''}
      ${ex.material ? `<p class="muted ex-card__meta"><strong>Material:</strong> ${esc(ex.material)}</p>` : ''}
      ${ex.description
        ? `<p class="ex-card__desc">${esc(ex.description)}</p>`
        : ''}
    </li>
  `;
}

// "8–12 atletas", "a partir de 6", "até 10" — ou nada, se servir sempre.
export function playersLabel(ex) {
  if (ex.min_players && ex.max_players) return `${ex.min_players}–${ex.max_players} atletas`;
  if (ex.min_players) return `a partir de ${ex.min_players} atletas`;
  if (ex.max_players) return `até ${ex.max_players} atletas`;
  return '';
}

// Campos do exercício. São os MESMOS de um bloco do plano de treino, para
// "puxar da biblioteca" ser uma cópia direta e não uma tradução.
export function exerciseFields() {
  return [
    {
      name: 'name', label: 'Nome do exercício', type: 'text', required: true, full: true,
      placeholder: 'Ex.: Receção-ataque em 6×6 com serviço dirigido',
    },
    {
      name: 'category', label: 'Categoria', type: 'select', required: true,
      options: PLAN_CATEGORIES, default: 'tecnica',
    },
    { name: 'duration_min', label: 'Duração (min)', type: 'number', placeholder: 'Ex.: 15' },
    {
      name: 'objective', label: 'Objetivo', type: 'text', full: true,
      placeholder: 'Ex.: Side-out a partir de receção pressionada',
    },
    {
      name: 'organization', label: 'Organização', type: 'text',
      placeholder: 'Ex.: Pares, grupos de 3, 6×6…',
    },
    { name: 'reps', label: 'Repetições / séries', type: 'text', placeholder: 'Ex.: 3×10, 5 min' },
    {
      name: 'min_players', label: 'Mín. de atletas', type: 'number', placeholder: 'Ex.: 6',
      hint: 'Deixa vazio se o exercício se adapta a qualquer número.',
    },
    { name: 'max_players', label: 'Máx. de atletas', type: 'number', placeholder: 'Ex.: 14' },
    {
      name: 'material', label: 'Material', type: 'text', full: true,
      placeholder: 'Ex.: 12 bolas, 2 carrinhos, elásticos',
    },
    {
      name: 'description', label: 'Descrição / variantes', type: 'textarea', full: true,
      placeholder: 'Desenvolvimento, progressões, simplificações, pontos de atenção…',
    },
  ];
}

// Converte os valores do formulário na linha a gravar (partilhado com o
// "Guardar na biblioteca" do plano de treino).
export function exercisePayload(vals) {
  const num = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    name:         (vals.name || '').trim(),
    category:     vals.category || 'outro',
    objective:    vals.objective?.trim()    || null,
    organization: vals.organization?.trim() || null,
    reps:         vals.reps?.trim()         || null,
    duration_min: num(vals.duration_min),
    min_players:  num(vals.min_players),
    max_players:  num(vals.max_players),
    material:     vals.material?.trim()     || null,
    description:  vals.description?.trim()  || null,
  };
}

function openExerciseForm(id) {
  const existing = id ? state.exercises.find((e) => e.id === id) : null;
  openModal({
    title: existing ? 'Editar exercício' : 'Novo exercício',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    fields: exerciseFields(),
    values: existing
      ? {
          name: existing.name || '',
          category: existing.category || 'outro',
          duration_min: existing.duration_min ?? '',
          objective: existing.objective ?? '',
          organization: existing.organization ?? '',
          reps: existing.reps ?? '',
          min_players: existing.min_players ?? '',
          max_players: existing.max_players ?? '',
          material: existing.material ?? '',
          description: existing.description ?? '',
        }
      : {},
    async onSubmit(vals) {
      const payload = exercisePayload(vals);
      if (!payload.name) throw new Error('O nome do exercício é obrigatório.');
      if (payload.min_players && payload.max_players && payload.min_players > payload.max_players) {
        throw new Error('O mínimo de atletas não pode ser maior do que o máximo.');
      }
      try {
        if (existing) {
          await updateRow('exercises', 'exercises', id, { ...payload, updated_at: new Date().toISOString() });
        } else {
          await createRow('exercises', 'exercises', payload);
        }
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

// Duplicar: a forma honesta de criar a variante de um exercício que já existe
// sem perder o original (progressão para um escalão mais novo, por exemplo).
async function duplicate(id) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex) return;
  const { id: _id, created_at: _c, updated_at: _u, created_by: _b, org_id: _o, ...rest } = ex;
  try {
    await createRow('exercises', 'exercises', { ...rest, name: `${ex.name} (cópia)` });
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

async function remove(id) {
  const ex = state.exercises.find((e) => e.id === id);
  const used = usageCount(id);
  const aviso = used
    ? ` Está em ${used} plano${used === 1 ? '' : 's'} de treino — esses planos não são alterados.`
    : '';
  const ok = await confirmDialog(`Remover "${ex?.name}" da biblioteca?${aviso}`, {
    confirmLabel: 'Remover', danger: true,
  });
  if (!ok) return;
  try {
    await deleteRow('exercises', 'exercises', id);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// =========================================================================
// Escolher da biblioteca (usado pelo plano de treino)
// =========================================================================
// Vive aqui e não no plano de treino porque é a biblioteca a mostrar-se a si
// própria — a filtragem e a etiquetagem são as mesmas da vista.
//
// `teamSize` pré-preenche o filtro de atletas: quem abre isto está a montar o
// treino de uma equipa concreta, e a primeira pergunta é sempre se o exercício
// funciona com o grupo que tem. O filtro fica editável (aparecem menos atletas
// do que os inscritos mais vezes do que se gostaria).
export function openExercisePicker({ onPick, teamSize = 0 } = {}) {
  let q = '';
  let cat = '';
  let players = teamSize ? String(teamSize) : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="xp-title"
         style="width:min(620px,96vw);max-height:88vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="xp-title">Da biblioteca</h2>
          <p class="muted" style="margin:0;font-size:0.84rem">
            Escolhe um exercício — os campos são copiados para o plano e podes editá-los depois.
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="filter-bar" style="margin-top:0.6rem">
        <div class="field field--grow">
          <label for="xp-q">Pesquisar</label>
          <input type="search" id="xp-q" placeholder="Nome, objetivo, material…" />
        </div>
        <div class="field">
          <label for="xp-n">Atletas</label>
          <input type="number" id="xp-n" min="1" placeholder="Qualquer nº" value="${esc(players)}" />
        </div>
      </div>
      <div class="ex-chips" data-xp-chips></div>
      <div style="flex:1;overflow-y:auto;margin:0 -0.4rem" data-xp-list></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" data-xp-cancel>Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('[data-xp-cancel]').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const listEl  = overlay.querySelector('[data-xp-list]');
  const chipsEl = overlay.querySelector('[data-xp-chips]');
  const qEl     = overlay.querySelector('#xp-q');
  const nEl     = overlay.querySelector('#xp-n');

  function matches() {
    const needle = q.trim().toLowerCase();
    const n = parseInt(players, 10) || 0;
    return state.exercises
      .filter((e) => !cat || e.category === cat)
      .filter((e) => fitsPlayers(e, n))
      .filter((e) => !needle || [e.name, e.objective, e.organization, e.description, e.material]
        .some((v) => (v || '').toLowerCase().includes(needle)))
      // Os mais usados primeiro: numa lista longa, o que o treinador procura é
      // quase sempre um dos que já usou.
      .sort((a, b) => usageCount(b.id) - usageCount(a.id) || (a.name || '').localeCompare(b.name || ''));
  }

  function paint() {
    const counts = {};
    state.exercises.forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
    chipsEl.innerHTML = PLAN_CATEGORIES.filter((c) => counts[c.key]).map((c) => `
      <button class="ex-chip${cat === c.key ? ' ex-chip--active' : ''}" data-xp-cat="${esc(c.key)}"
              type="button" aria-pressed="${cat === c.key}">
        ${esc(c.label)} <span class="ex-chip__n">${counts[c.key]}</span>
      </button>`).join('');
    chipsEl.querySelectorAll('[data-xp-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        cat = b.dataset.xpCat === cat ? '' : b.dataset.xpCat;
        paint();
      })
    );

    const rows = matches();
    if (!state.exercises.length) {
      listEl.innerHTML = `<p class="muted" style="padding:0.8rem 0.4rem">
        A biblioteca está vazia. Cria exercícios na secção <strong>Exercícios</strong>
        (ou guarda aí um bloco deste plano) e depois voltas a encontrá-los aqui.</p>`;
      return;
    }
    if (!rows.length) {
      listEl.innerHTML = '<p class="muted" style="padding:0.8rem 0.4rem">Nenhum exercício corresponde ao filtro.</p>';
      return;
    }
    listEl.innerHTML = `<ul class="ex-pick">${rows.map((e) => {
      const meta = [
        PLAN_CATEGORY_LABEL[e.category] || e.category,
        e.duration_min ? `${e.duration_min} min` : '',
        e.organization || '',
        playersLabel(e),
        e.objective || '',
      ].filter(Boolean).join(' · ');
      return `
        <li>
          <button class="ex-pick__item" type="button" data-xp-pick="${e.id}">
            <span class="badge badge--${PLAN_CATEGORY_BADGE[e.category] || 'muted'}"
                  style="flex-shrink:0;margin-top:0.15rem">
              ${esc(PLAN_CATEGORY_LABEL[e.category] || e.category)}
            </span>
            <span class="ex-pick__body">
              <strong>${esc(e.name)}</strong>
              <span class="muted ex-pick__meta">${esc(meta)}</span>
            </span>
          </button>
        </li>`;
    }).join('')}</ul>`;

    listEl.querySelectorAll('[data-xp-pick]').forEach((b) =>
      b.addEventListener('click', async () => {
        const ex = state.exercises.find((e) => e.id === b.dataset.xpPick);
        if (!ex) return;
        b.disabled = true;
        try {
          await onPick?.(ex);
          close();
        } catch (err) {
          b.disabled = false;
          toastError(dbErrorMessage(err));
        }
      })
    );
  }

  qEl.addEventListener('input', () => { q = qEl.value; paint(); });
  nEl.addEventListener('change', () => { players = nEl.value; paint(); });
  paint();
  qEl.focus();
}
