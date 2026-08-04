// Vista: Saúde & Performance — orquestra as duas áreas clínicas do clube.
//
//   • Fisioterapia   — Departamento Médico (medico.js), exclusivo do
//                      coordenador e do fisioterapeuta;
//   • Prep. física   — Preparação Física (preparacao.js), exclusiva do
//                      coordenador e do preparador físico.
//
// Cada área continua a ser desenhada pela sua própria vista (com os seus
// separadores internos), dentro do corpo desta. A barra de separadores só
// aparece a quem tem acesso às duas — na prática, o coordenador; a fisio e o
// preparador continuam a ver apenas a sua área, sem camada extra.

import { esc, emptyHTML } from '../ui.js';
import { canAccess } from '../permissions.js';
import { renderMedico } from './medico.js';
import { renderPreparacao } from './preparacao.js';

// Área em vigor (mantida entre re-desenhos, como os filtros das vistas).
let saudeTab = 'medico';

// Permite a outra vista abrir esta secção já na área certa — usado pelo
// Painel e pelo redireccionamento das rotas antigas (#/medico, #/fisica).
export function openSaudeTab(key) {
  saudeTab = key;
}

const SAUDE_TABS = [
  { key: 'medico', label: 'Fisioterapia',  can: () => canAccess('medico'), render: renderMedico },
  { key: 'fisica', label: 'Prep. física',  can: () => canAccess('fisica'), render: renderPreparacao },
];

export function renderSaude(container) {
  const tabs = SAUDE_TABS.filter((t) => t.can());
  if (!tabs.length) {
    container.innerHTML = emptyHTML('Não tens acesso a esta área.');
    return;
  }
  if (!tabs.some((t) => t.key === saudeTab)) saudeTab = tabs[0].key;

  container.innerHTML = `
    ${tabs.length > 1 ? `
      <div class="cal-toggle section-tabs" role="tablist" aria-label="Áreas de saúde e performance">
        ${tabs.map((t) => `
          <button class="cal-toggle__btn ${saudeTab === t.key ? 'cal-toggle__btn--active' : ''}"
                  data-saude-tab="${t.key}" type="button" role="tab"
                  aria-selected="${saudeTab === t.key}">${esc(t.label)}</button>
        `).join('')}
      </div>` : ''}
    <div id="saude-body"></div>
  `;

  container.querySelectorAll('[data-saude-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      saudeTab = b.dataset.saudeTab;
      renderSaude(container);
    })
  );

  const active = tabs.find((t) => t.key === saudeTab) || tabs[0];
  active.render(container.querySelector('#saude-body'));
}
