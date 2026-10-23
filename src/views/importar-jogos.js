// Importar jogos do site da federação (Calendário → "Federação").
//
// O site não tem API nem exportação, por isso o gesto é copiar a tabela dos
// jogos da página da competição e colá-la aqui (ver `federation-games.js`). O
// que se leu vê-se SEMPRE antes de gravar: um parser que lê páginas de outra
// pessoa engana-se, e um jogo inventado no calendário avisa vinte famílias.
//
// - **A página traz a competição INTEIRA**: só entram os jogos onde o clube
//   aparece, e diz-se quantos se deixaram de fora — com o nome do clube mal
//   escrito, "0 jogos" sem esse número parecia o site vazio.
// - **Importar duas vezes não duplica.** Um jogo que já está no calendário
//   (mesma equipa, mesmo dia, mesmo adversário) fica de fora; um que mudou de
//   hora, ou de dia na mesma jornada, é ATUALIZADO — é para isso que se volta
//   a colar a página a meio da época, quando a federação remarca.
// - **Os jogos já jogados nascem desmarcados**: lançar a primeira volta em
//   dezembro é trabalho de secretaria, e cada evento novo avisa os atletas.

import { state, importGames, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { wireDialog } from '../modal.js';
import { teamName } from '../compute.js';
import { branding } from '../branding.js';
import { DEFAULT_LOCATION } from '../constants.js';
import { parseGamesText, toClubGame, clubMatcher, sameTeam } from '../federation-games.js';

const FEDERATION_URL = 'https://www.portugalvoleibol.com/classificacao/#campeonatos';
// O nome com que o clube aparece no site é do dispositivo e não do clube:
// é uma preferência de quem importa, e não precisa de migração.
const CLUB_KEY = 'rumia.federacao.clube';

function readClubName() {
  try {
    return localStorage.getItem(CLUB_KEY) || '';
  } catch {
    return '';
  }
}
function writeClubName(v) {
  try {
    localStorage.setItem(CLUB_KEY, v);
  } catch { /* janela privada: fica por esta vez */ }
}

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtDate = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function gameTitle(g) {
  return [g.jornada ? `Jornada ${g.jornada}` : null, g.home ? 'Casa' : 'Fora'].filter(Boolean).join(' · ');
}

// O que fazer com cada jogo lido, face ao que já está no calendário.
function classify(g, teamId) {
  const games = state.events.filter((e) => e.type === 'jogo' && e.team_id === teamId);
  const sameDay = games.find((e) => e.date === g.date && sameTeam(e.opponent, g.opponent));
  if (sameDay) {
    if (g.time && (sameDay.time || '').slice(0, 5) !== g.time) {
      return { kind: 'remarcado', event: sameDay, values: { time: g.time }, note: `hora: ${sameDay.time?.slice(0, 5) || '—'} → ${g.time}` };
    }
    return { kind: 'existe', event: sameDay };
  }
  if (g.jornada) {
    const re = new RegExp(`\\bjornada ${g.jornada}\\b`, 'i');
    const moved = games.find((e) => sameTeam(e.opponent, g.opponent) && re.test(e.title || ''));
    if (moved) {
      return {
        kind: 'remarcado',
        event: moved,
        values: { date: g.date, ...(g.time ? { time: g.time } : {}) },
        note: `${fmtDate(moved.date)} → ${fmtDate(g.date)}`,
      };
    }
  }
  // A federação deixa no calendário o jogo de quem desistiu, mas ele não se
  // joga: importá-lo era pôr a equipa à espera de um adversário que não vem.
  if (g.forfeit) {
    return { kind: 'desistencia', note: g.forfeit === 'adversario' ? 'o adversário desistiu' : 'o clube desistiu' };
  }
  return { kind: g.date < todayISO() ? 'passado' : 'novo' };
}

const KIND_BADGE = {
  novo: ['ok', 'Novo'],
  passado: ['muted', 'Já jogado'],
  remarcado: ['warn', 'Remarcado'],
  existe: ['muted', 'Já no calendário'],
  desistencia: ['muted', 'Desistência'],
};

export function openImportGames() {
  let items = [];
  let skipped = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="fed-title" style="width:min(820px,96vw)">
      <div class="modal__head">
        <h2 id="fed-title">Importar jogos da federação</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin-top:0">
        Abre a página da competição no <a href="${FEDERATION_URL}" target="_blank" rel="noopener">site da federação</a>,
        seleciona a lista dos jogos (ou a página toda, com Ctrl+A / ⌘A), copia e cola aqui.
        Vês o que foi lido antes de gravar.
      </p>
      <div class="field-grid">
        <div class="field">
          <label for="fed-team">Equipa <span class="field__req" title="Obrigatório">*</span></label>
          <select id="fed-team">
            <option value="">Escolhe a equipa…</option>
            ${state.teams.map((t) => `<option value="${t.id}">${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="fed-club">Nome do clube no site <span class="field__req" title="Obrigatório">*</span></label>
          <input type="text" id="fed-club" value="${esc(readClubName() || branding().club_name || '')}" aria-describedby="fed-club-hint" />
          <p class="field__hint muted" id="fed-club-hint">Basta a parte que só o clube tem no nome — uma palavra que outra equipa também tenha traz os jogos dela. Vários, separados por vírgula.</p>
        </div>
      </div>
      <div class="field field--full">
        <label for="fed-text">Jogos copiados do site</label>
        <textarea id="fed-text" rows="7" placeholder="Cola aqui a tabela dos jogos…"></textarea>
      </div>
      <div id="fed-preview"></div>
      <div id="fed-err" class="modal__error" style="display:none"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="fed-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="fed-confirm" type="button" disabled>Importar</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay, { initialFocus: '#fed-team' });
  overlay.querySelector('#fed-cancel').addEventListener('click', close);

  const teamEl = overlay.querySelector('#fed-team');
  const clubEl = overlay.querySelector('#fed-club');
  const textEl = overlay.querySelector('#fed-text');
  const previewEl = overlay.querySelector('#fed-preview');
  const confirmBtn = overlay.querySelector('#fed-confirm');
  const errEl = overlay.querySelector('#fed-err');

  function selected() {
    return items.filter((it) => it.checked && it.kind !== 'existe');
  }

  function syncButton() {
    const n = selected().length;
    confirmBtn.disabled = !n || !teamEl.value;
    confirmBtn.textContent = n ? `Importar ${n} jogo${n === 1 ? '' : 's'}` : 'Importar';
  }

  function parse() {
    const isClub = clubMatcher(clubEl.value);
    const raw = parseGamesText(textEl.value, { season: state.settings?.season });
    const seen = new Set();
    items = [];
    skipped = 0;
    for (const r of raw) {
      const g = toClubGame(r, isClub);
      if (!g) { skipped += 1; continue; }
      const key = `${g.date}|${g.opponent.toLowerCase()}`;
      if (seen.has(key)) continue; // a mesma página colada duas vezes
      seen.add(key);
      items.push(g);
    }
    items.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    render();
  }

  function render() {
    const teamId = teamEl.value;
    if (!textEl.value.trim()) {
      previewEl.innerHTML = '';
      syncButton();
      return;
    }
    if (!items.length) {
      previewEl.innerHTML = `<p class="muted">${
        skipped
          ? `Encontrámos ${skipped} jogo${skipped === 1 ? '' : 's'}, mas nenhum com "${esc(clubEl.value.trim())}". Confirma como o clube aparece escrito no site.`
          : 'Não encontrámos jogos no texto colado. Copia a lista onde aparecem a data e as duas equipas.'
      }</p>`;
      syncButton();
      return;
    }
    items.forEach((it) => {
      const prev = it.kind;
      Object.assign(it, teamId ? classify(it, teamId) : { kind: 'novo', event: null, values: null, note: '' });
      if (it.checked === undefined || prev !== it.kind) it.checked = it.kind === 'novo' || it.kind === 'remarcado';
    });
    const counts = items.reduce((acc, it) => ({ ...acc, [it.kind]: (acc[it.kind] || 0) + 1 }), {});
    previewEl.innerHTML = `
      <p class="muted" style="margin:0.25rem 0 0.5rem">
        ${items.length} jogo${items.length === 1 ? '' : 's'} do clube
        ${counts.existe ? ` · ${counts.existe} já no calendário` : ''}
        ${counts.desistencia ? ` · ${counts.desistencia} com desistência (não se jogam)` : ''}
        ${counts.remarcado ? ` · ${counts.remarcado} com nova data ou hora` : ''}
        ${skipped ? ` · ${skipped} de outras equipas deixado${skipped === 1 ? '' : 's'} de fora` : ''}
      </p>
      ${!teamId ? '<p class="muted">Escolhe a equipa para ver o que já está no calendário.</p>' : ''}
      <div class="table-wrap" style="max-height:40vh;overflow:auto">
        <table class="table">
          <thead><tr>
            <th aria-label="Importar"></th><th>Data</th><th>Hora</th><th>Adversário</th><th>Casa/Fora</th><th>Local</th><th>Estado</th>
          </tr></thead>
          <tbody>
            ${items.map((it, i) => {
              const [tone, label] = KIND_BADGE[it.kind];
              return `<tr>
                <td><input type="checkbox" data-fed="${i}" aria-label="Importar o jogo de ${esc(fmtDate(it.date))}"
                  ${it.checked && it.kind !== 'existe' ? 'checked' : ''} ${it.kind === 'existe' ? 'disabled' : ''} /></td>
                <td>${esc(fmtDate(it.date))}${it.jornada ? ` <span class="muted">J${it.jornada}</span>` : ''}</td>
                <td>${esc(it.time || '—')}</td>
                <td>${esc(it.opponent)}</td>
                <td>${it.home ? 'Casa' : 'Fora'}</td>
                <td>${esc(it.location || (it.home ? DEFAULT_LOCATION : '—'))}</td>
                <td><span class="badge badge--${tone}">${esc(label)}</span>${it.note ? ` <span class="muted">${esc(it.note)}</span>` : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p class="field__hint muted">Os atletas com conta recebem um aviso por cada jogo novo.</p>
    `;
    previewEl.querySelectorAll('[data-fed]').forEach((b) => b.addEventListener('change', () => {
      items[Number(b.dataset.fed)].checked = b.checked;
      syncButton();
    }));
    syncButton();
  }

  let timer = null;
  const reparse = () => { clearTimeout(timer); timer = setTimeout(parse, 200); };
  textEl.addEventListener('input', reparse);
  clubEl.addEventListener('input', reparse);
  teamEl.addEventListener('change', render);

  confirmBtn.addEventListener('click', async () => {
    const teamId = teamEl.value;
    const chosen = selected();
    if (!teamId || !chosen.length) return;
    const rows = chosen
      .filter((it) => it.kind !== 'remarcado')
      .map((it) => ({
        type: 'jogo',
        date: it.date,
        time: it.time || null,
        team_id: teamId,
        opponent: it.opponent,
        location: it.location || (it.home ? DEFAULT_LOCATION : null),
        title: gameTitle(it) || null,
      }));
    const updates = chosen
      .filter((it) => it.kind === 'remarcado')
      .map((it) => ({
        id: it.event.id,
        values: { ...it.values, ...(it.location && it.location !== it.event.location ? { location: it.location } : {}) },
      }));
    confirmBtn.disabled = true;
    errEl.style.display = 'none';
    try {
      await importGames(rows, updates);
      writeClubName(clubEl.value.trim());
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.style.display = '';
      syncButton();
    }
  });
}
