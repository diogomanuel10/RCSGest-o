// Editor das faixas de referência das avaliações físicas.
//
// A app mostra "Baixo / Normal / Forte" ao lado do valor que se está a
// escrever, mas só sabe fazê-lo onde existe uma tabela. A que vem no código é
// uma só (preensão manual, feminino) — as outras, a masculina e as dos saltos
// e do sprint, estão nos PDFs e nos livros do preparador físico. Uma
// referência que precisa de uma alteração de código para existir é uma
// referência que nunca chega, e por isso este ecrã existe.
//
// Quem escreve é quem tem a fonte: o preparador (e o coordenador). É a mesma
// regra das restantes tabelas da área física, e não passa pelas Definições,
// que são do coordenador.

import { state, saveTestReference, deleteTestReference, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { wireDialog, confirmDialog } from '../modal.js';
import { toastError } from '../toast.js';
import {
  referenceableTests,
  testReferenceTable,
  validateBands,
} from '../compute.js';
import { PHYSICAL_TEST_UNIT, GENDERS } from '../constants.js';
import { canEdit } from '../permissions.js';

// O teste e o sexo que o diálogo está a mostrar. Vivem no módulo (estado de
// UI, a regra do store.js) e não na base de dados.
let selType = 'aperto_mao';
let selGender = 'F';
// As faixas em edição, enquanto não se grava. Trabalha-se sobre uma CÓPIA: sem
// isso, cancelar a meio deixava a tabela do clube já mexida em memória e a
// ficha do atleta a ler-se por valores que ninguém gravou.
let draft = null;
let draftSource = '';

export function openTestReferences() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="ref-title"
         style="width:min(680px,96vw);max-height:90vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="ref-title">Valores de referência</h2>
          <p class="muted" style="margin:0;font-size:0.83rem">
            O que a app mostra ao lado de cada resultado. É referência, não nota.
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="ref-editor" id="ref-body"></div>
    </div>
  `;
  const close = wireDialog(overlay);
  const body = overlay.querySelector('#ref-body');

  loadDraft();
  paint();

  function loadDraft() {
    const table = testReferenceTable(selType, selGender);
    draft = (table?.bands || []).map((b) => ({ ...b }));
    draftSource = table?.source || '';
  }

  function paint() {
    const editable = canEdit('physical') && state.testReferencesReady;
    const table = testReferenceTable(selType, selGender);
    const unit = PHYSICAL_TEST_UNIT[selType] || '';

    body.innerHTML = `
      <div class="field-grid">
        <div class="field">
          <label for="ref-test">Teste</label>
          <select id="ref-test">
            ${referenceableTests().map((t) => `
              <option value="${esc(t.key)}" ${t.key === selType ? 'selected' : ''}>
                ${esc(t.label)}${hasAny(t.key) ? ' •' : ''}
              </option>`).join('')}
          </select>
          <p class="field__hint muted">O ponto marca os testes que já têm referência.</p>
        </div>
        <div class="field">
          <label for="ref-gender">Sexo</label>
          <select id="ref-gender">
            ${GENDERS.map((g) => `
              <option value="${esc(g.key)}" ${g.key === selGender ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}
          </select>
          <p class="field__hint muted">O sexo do atleta vem da equipa.</p>
        </div>
      </div>

      ${originHTML(table)}

      <div class="field field--full">
        <label for="ref-source">Fonte</label>
        <input type="text" id="ref-source" value="${esc(draftSource)}"
               placeholder="ex.: Revista Brasileira de Cineantropometria"
               ${editable ? '' : 'disabled'} />
        <p class="field__hint muted">
          Mostrada ao lado do valor na ficha do atleta. Uma referência sem
          origem é um número sem autoridade.
        </p>
      </div>

      <div class="field field--full">
        <span class="field__label">Faixas etárias${unit ? ` <span class="muted">(${esc(unit)})</span>` : ''}</span>
        ${draft.length
          ? `<div class="scroll-x"><table class="players-table no-stack ref-table">
               <thead>
                 <tr><th>Dos</th><th>Aos</th><th>Mínimo</th><th>Máximo</th>${editable ? '<th></th>' : ''}</tr>
               </thead>
               <tbody>${draft.map((b, i) => bandRowHTML(b, i, editable)).join('')}</tbody>
             </table></div>`
          : '<p class="muted" style="margin:0.2rem 0">Sem faixas. Acrescenta a primeira.</p>'}
        <p class="field__hint muted">
          Deixa o "Aos" em branco na última faixa para dizer "X anos ou mais".
        </p>
      </div>

      ${editable ? `
        <div class="row row--wrap" style="gap:0.5rem;margin-top:0.2rem">
          <button class="btn btn--ghost btn--sm" id="ref-add" type="button">+ Faixa</button>
          ${table?.custom
            ? '<button class="btn btn--ghost btn--sm" id="ref-reset" type="button">Repor a de origem</button>'
            : ''}
        </div>` : ''}

      <div id="ref-err" class="modal__error hidden"></div>

      <div class="modal__actions">
        <button class="btn btn--ghost" id="ref-cancel" type="button">Fechar</button>
        ${editable ? '<button class="btn btn--primary" id="ref-save" type="button">Guardar</button>' : ''}
      </div>
    `;
    wire(editable);
  }

  // De onde vem a tabela que está a ser mostrada. Sem isto, um preparador que
  // abre a preensão feminina vê sete faixas preenchidas e não tem como saber
  // se foi ele que as escreveu ou se vieram com a app — e a diferença decide
  // se as pode corrigir à vontade.
  function originHTML(table) {
    if (!state.testReferencesReady) {
      return `<p class="ref-origin muted">
        Só de leitura: falta correr a migração <code>supabase/referencias-testes.sql</code>.
        A app continua a usar a tabela que traz de origem.
      </p>`;
    }
    if (!table) {
      return `<p class="ref-origin muted">
        Ainda não há referência para este teste neste sexo — a app mostra o
        valor e não diz mais nada.
      </p>`;
    }
    return table.custom
      ? '<p class="ref-origin muted">Tabela deste clube.</p>'
      : '<p class="ref-origin muted">Tabela de origem da app. Ao gravar, passa a ser a deste clube.</p>';
  }

  function bandRowHTML(b, i, editable) {
    const cell = (name, value, placeholder = '') =>
      editable
        ? `<input type="number" step="any" class="pf-min-input" data-band="${i}" data-field="${name}"
                  value="${b[name] ?? ''}" placeholder="${esc(placeholder)}" />`
        : `<span>${b[name] ?? '—'}</span>`;
    return `
      <tr>
        <td>${cell('from', b.from)}</td>
        <td>${cell('to', b.to, '—')}</td>
        <td>${cell('min', b.min)}</td>
        <td>${cell('max', b.max)}</td>
        ${editable
          ? `<td class="cell-actions">
               <button class="btn btn--danger btn--sm" data-band-del="${i}" type="button">Remover</button>
             </td>`
          : ''}
      </tr>`;
  }

  function wire(editable) {
    body.querySelector('#ref-cancel').addEventListener('click', close);

    // Trocar de teste ou de sexo recomeça a edição: as faixas são daquela
    // tabela e de mais nenhuma. Se houver trabalho por gravar, pergunta-se —
    // é a mesma guarda do `openModal`.
    const switchTo = async (fn) => {
      if (isDirty()) {
        const ok = await confirmDialog(
          'Tens alterações por guardar nesta tabela. Queres trocar e perdê-las?',
          { confirmLabel: 'Trocar sem guardar', danger: true }
        );
        if (!ok) { paint(); return; }
      }
      fn();
      loadDraft();
      paint();
    };
    body.querySelector('#ref-test').addEventListener('change', (e) => {
      const v = e.target.value;
      switchTo(() => { selType = v; });
    });
    body.querySelector('#ref-gender').addEventListener('change', (e) => {
      const v = e.target.value;
      switchTo(() => { selGender = v; });
    });

    if (!editable) return;

    body.querySelector('#ref-source').addEventListener('input', (e) => {
      draftSource = e.target.value;
    });

    // Escrever numa célula não redesenha a tabela: redesenhar a cada tecla
    // tirava o cursor do campo à segunda letra.
    body.querySelectorAll('[data-band]').forEach((input) => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.band);
        const field = input.dataset.field;
        const raw = input.value.trim();
        draft[i][field] = raw === '' ? null : Number(raw);
      });
    });

    body.querySelectorAll('[data-band-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        draft.splice(Number(btn.dataset.bandDel), 1);
        paint();
      });
    });

    body.querySelector('#ref-add').addEventListener('click', () => {
      // A faixa nova começa onde a anterior acabou: é quase sempre isso que se
      // quer, e é o que impede a sobreposição que a gravação recusaria.
      const ultima = [...draft].sort((a, b) => (a.from ?? 0) - (b.from ?? 0)).pop();
      const from = ultima?.to != null ? ultima.to + 1 : null;
      draft.push({ from, to: null, min: null, max: null });
      paint();
    });

    body.querySelector('#ref-reset')?.addEventListener('click', async () => {
      const own = state.testReferences.find(
        (r) => r.type === selType && r.gender === selGender
      );
      if (!own) return;
      const ok = await confirmDialog(
        'Apagar a tabela deste clube para este teste? A app volta a usar a que traz de origem, se houver.',
        { confirmLabel: 'Apagar', danger: true }
      );
      if (!ok) return;
      try {
        await deleteTestReference(own.id);
        loadDraft();
        paint();
      } catch (err) {
        toastError(dbErrorMessage(err));
      }
    });

    body.querySelector('#ref-save').addEventListener('click', async () => {
      const errEl = body.querySelector('#ref-err');
      const btn = body.querySelector('#ref-save');
      const bands = normalizeBands(draft);

      const errors = validateBands(bands);
      if (errors.length) {
        errEl.innerHTML = errors.map((e) => esc(e)).join('<br />');
        errEl.classList.remove('hidden');
        errEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'A guardar…';
      try {
        await saveTestReference({
          type: selType,
          gender: selGender,
          source: draftSource,
          bands,
        });
        loadDraft();
        paint();
      } catch (err) {
        errEl.textContent = dbErrorMessage(err);
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Guardar';
      }
    });
  }

  // Ordena por idade e limpa o que não é número. Ordenar na gravação (e não à
  // medida que se escreve) evita que a linha salte de sítio enquanto se está a
  // preencher.
  function normalizeBands(list) {
    return list
      .map((b) => ({
        from: Number.isFinite(b.from) ? b.from : null,
        to: Number.isFinite(b.to) ? b.to : null,
        min: Number.isFinite(b.min) ? b.min : null,
        max: Number.isFinite(b.max) ? b.max : null,
      }))
      .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  }

  function isDirty() {
    const table = testReferenceTable(selType, selGender);
    const original = JSON.stringify((table?.bands || []).map((b) => ({ ...b })));
    const agora = JSON.stringify(draft);
    return original !== agora || (table?.source || '') !== draftSource;
  }

  function hasAny(type) {
    return !!(testReferenceTable(type, 'F') || testReferenceTable(type, 'M'));
  }
}
