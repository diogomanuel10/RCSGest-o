// Vista: Treino — o material com que o treinador prepara a semana.
//
//   • Exercícios      — a biblioteca do clube (exercicios.js);
//   • Decisão tática  — os cenários de leitura de jogo (tatica.js).
//
// Andavam em duas entradas separadas na barra lateral. São a mesma coisa vista
// de dois ângulos — o que se treina no pavilhão e o que se treina na cabeça —
// e uma barra lateral com quinze entradas não ajuda ninguém a encontrar
// nenhuma delas. Cada área mantém a sua permissão (`exercicios`, `tatica`) e
// a barra de separadores só aparece a quem tem as duas.
//
// As rotas antigas (#/exercicios, #/tatica) continuam a funcionar — ver
// LEGACY_ROUTES no app-shell.

import { esc, emptyHTML } from '../ui.js';
import { canAccess } from '../permissions.js';
import { renderExercicios } from './exercicios.js';
import { renderTatica } from './tatica.js';

// Área em vigor (mantida entre re-desenhos, como os filtros das vistas).
let treinoTab = 'exercicios';

// Permite a outra vista (ou o redireccionamento das rotas antigas) abrir esta
// secção já na área certa.
export function openTreinoTab(key) {
  treinoTab = key;
}

const TREINO_TABS = [
  { key: 'exercicios', label: 'Exercícios',     can: () => canAccess('exercicios'), render: renderExercicios },
  { key: 'tatica',     label: 'Decisão tática', can: () => canAccess('tatica'),     render: renderTatica },
];

export function renderTreino(container) {
  const tabs = TREINO_TABS.filter((t) => t.can());
  if (!tabs.length) {
    container.innerHTML = emptyHTML('Não tens acesso a esta área.');
    return;
  }
  if (!tabs.some((t) => t.key === treinoTab)) treinoTab = tabs[0].key;

  container.innerHTML = `
    ${tabs.length > 1 ? `
      <div class="cal-toggle section-tabs" role="tablist" aria-label="Áreas de treino">
        ${tabs.map((t) => `
          <button class="cal-toggle__btn ${treinoTab === t.key ? 'cal-toggle__btn--active' : ''}"
                  data-treino-tab="${t.key}" type="button" role="tab"
                  aria-selected="${treinoTab === t.key}">${esc(t.label)}</button>
        `).join('')}
      </div>` : ''}
    <div id="treino-body"></div>
  `;

  container.querySelectorAll('[data-treino-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      treinoTab = b.dataset.treinoTab;
      renderTreino(container);
    })
  );

  const active = tabs.find((t) => t.key === treinoTab) || tabs[0];
  active.render(container.querySelector('#treino-body'));
}
