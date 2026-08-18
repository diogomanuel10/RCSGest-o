// Vista: Painel — o resumo do clube e, ao lado, os objetivos da época.
//
//   • Resumo    — o painel propriamente dito (painel.js), diferente por papel;
//   • Objetivos — as metas da época (objetivos.js).
//
// Os Objetivos tinham entrada própria na barra lateral e não a justificavam:
// são consultados a par do resumo (é o Painel que assinala os que estão em
// risco, e daí que se salte para eles) e não a meio de uma tarefa. Aqui ficam
// a um separador de distância de onde já se estava a olhar, em vez de a uma
// entrada de distância de tudo o resto.
//
// A rota antiga (#/objetivos) continua a funcionar — ver LEGACY_ROUTES no
// app-shell, que é também por onde o cartão de aviso do Painel salta para cá.

import { esc, emptyHTML } from '../ui.js';
import { canAccess } from '../permissions.js';
import { renderPainel } from './painel.js';
import { renderObjetivos } from './objetivos.js';

let inicioTab = 'resumo';

export function openInicioTab(key) {
  inicioTab = key;
}

const INICIO_TABS = [
  { key: 'resumo',    label: 'Resumo',    can: () => canAccess('painel'),    render: renderPainel },
  { key: 'objetivos', label: 'Objetivos', can: () => canAccess('objetivos'), render: renderObjetivos },
];

export function renderInicio(container) {
  const tabs = INICIO_TABS.filter((t) => t.can());
  if (!tabs.length) {
    container.innerHTML = emptyHTML('Não tens acesso a esta área.');
    return;
  }
  if (!tabs.some((t) => t.key === inicioTab)) inicioTab = tabs[0].key;

  container.innerHTML = `
    ${tabs.length > 1 ? `
      <div class="cal-toggle section-tabs" role="tablist" aria-label="Áreas do painel">
        ${tabs.map((t) => `
          <button class="cal-toggle__btn ${inicioTab === t.key ? 'cal-toggle__btn--active' : ''}"
                  data-inicio-tab="${t.key}" type="button" role="tab"
                  aria-selected="${inicioTab === t.key}">${esc(t.label)}</button>
        `).join('')}
      </div>` : ''}
    <div id="inicio-body"></div>
  `;

  container.querySelectorAll('[data-inicio-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      inicioTab = b.dataset.inicioTab;
      renderInicio(container);
    })
  );

  const active = tabs.find((t) => t.key === inicioTab) || tabs[0];
  active.render(container.querySelector('#inicio-body'));
}
