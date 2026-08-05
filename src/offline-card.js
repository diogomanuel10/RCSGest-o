// Cartão QR do atleta guardado no dispositivo.
//
// O cartão é preciso à entrada do pavilhão — onde a rede é pior. Sem isto, a
// app não carregava os dados e o atleta ficava à porta sem nada para mostrar.
//
// Guarda-se o SVG já desenhado, e não só o token: assim mostrar o cartão sem
// rede não depende de a biblioteca do QR estar em cache. É um punhado de KB.

import { esc } from './ui.js';

const CARD_KEY = 'rumia:meu-cartao';

// Grava o cartão do atleta (chamado pelo portal sempre que ele o vê com rede).
export function saveOfflineCard({ name, number, team, svg }) {
  if (!svg) return;
  try {
    localStorage.setItem(
      CARD_KEY,
      JSON.stringify({ name, number, team, svg, savedAt: new Date().toISOString() })
    );
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cartão offline */
  }
}

// Lê o cartão guardado. Devolve null se nunca foi visto com rede.
export function readOfflineCard() {
  try {
    const raw = localStorage.getItem(CARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Apaga o cartão guardado (usado ao terminar sessão — o cartão é pessoal e não
// deve sobreviver à conta no dispositivo).
export function clearOfflineCard() {
  try {
    localStorage.removeItem(CARD_KEY);
  } catch {
    /* idem */
  }
}

// Ecrã de recurso quando os dados não carregam: mostra o cartão guardado, que
// é a única coisa que o atleta precisa mesmo naquele momento.
// Devolve true se conseguiu desenhar alguma coisa.
export function renderOfflineCard(container) {
  const card = readOfflineCard();
  // O SVG é nosso (foi esta app que o gerou e guardou), mas vem do
  // armazenamento local e é inserido como HTML — daí a verificação de que
  // continua a ser mesmo um SVG e nada mais.
  if (!card?.svg || !/^\s*<svg[\s>]/i.test(card.svg) || /<script/i.test(card.svg)) {
    return false;
  }

  const meta = [card.number ? `Nº ${card.number}` : '', card.team || '']
    .filter(Boolean)
    .join(' · ');

  container.innerHTML = `
    <section class="card offline-card">
      <span class="badge badge--warn">Sem ligação</span>
      <h1 class="section-title offline-card__title">O meu cartão</h1>
      <p class="muted offline-card__note">
        Não foi possível ligar ao clube, mas o teu cartão está aqui. Podes
        passá-lo no quiosque à mesma — a presença é registada pelo tablet.
      </p>
      <div class="offline-card__code">${card.svg}</div>
      <p class="offline-card__name">${esc(card.name || '')}</p>
      ${meta ? `<p class="muted offline-card__meta">${esc(meta)}</p>` : ''}
      <button class="btn btn--ghost btn--sm offline-card__retry" type="button" data-retry>
        Tentar ligar de novo
      </button>
    </section>
  `;

  container
    .querySelector('[data-retry]')
    ?.addEventListener('click', () => window.location.reload());
  return true;
}
