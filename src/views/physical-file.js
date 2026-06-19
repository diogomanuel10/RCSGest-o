// Conteúdo da área de Preparação Física do perfil do atleta.
//
// Renderiza para um contentor (separador "Prep. física"): dados físicos
// (altura/peso/IMC/mão dominante), história clínica (leitura — o preparador
// consulta), avaliações físicas e o controlo de treino e minutos de jogo.

import {
  state,
  createRow,
  updateRow,
  deleteRow,
  upsertByPlayer,
  upsertGameMinutes,
  dbErrorMessage,
} from '../store.js';
import { esc } from '../ui.js';
import {
  physicalProfile,
  playerMedicalHistory,
  bmi,
  playerTests,
  playerGymStats,
  playerGameMinutes,
  eventDateTime,
} from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  DOMINANT_HANDS,
  DOMINANT_HAND_LABEL,
  PHYSICAL_TEST_TYPES,
  PHYSICAL_TEST_LABEL,
  PHYSICAL_TEST_UNIT,
} from '../constants.js';
import { canEdit } from '../permissions.js';

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const testName = (t) => (t.type === 'outro' && t.label ? t.label : PHYSICAL_TEST_LABEL[t.type] || t.type);

// Renderiza a área de preparação física de um atleta no contentor indicado.
export function renderPhysicalInto(container, playerId, { editable } = {}) {
  const canPhysical = editable ?? canEdit('physical');
  const rerender = () => renderPhysicalInto(container, playerId, { editable });

  const p = state.players.find((x) => x.id === playerId);
  if (!p) return;
  const prof = physicalProfile(playerId);
  const hist = playerMedicalHistory(playerId);
  const tests = playerTests(playerId);
  const gym = playerGymStats(playerId);
  const games = playerGameMinutes(playerId);
  const imc = bmi(playerId);

  container.innerHTML = `
    <div class="pd-section">
      <div class="cf-section-head">
        <span class="pd-label">Dados físicos</span>
        ${canPhysical ? '<button class="btn btn--ghost btn--sm" data-edit-profile type="button">Editar</button>' : ''}
      </div>
      <div class="pd-grid">
        ${dataItem('Altura', prof?.height_cm ? `${prof.height_cm} cm` : '')}
        ${dataItem('Peso', prof?.weight_kg ? `${prof.weight_kg} kg` : '')}
        ${dataItem('IMC', imc != null ? String(imc) : '')}
        ${dataItem('Mão dominante', prof?.dominant_hand ? DOMINANT_HAND_LABEL[prof.dominant_hand] : '')}
      </div>
    </div>

    <div class="pd-section">
      <span class="pd-label">História clínica</span>
      <p class="muted" style="margin:0.1rem 0 0.4rem;font-size:0.8rem">Gerida pela fisioterapia (leitura).</p>
      ${hist && (hist.limitations || hist.past_injuries || hist.surgeries || hist.chronic_diseases || hist.medication)
        ? `${fieldBlock('Limitações ao treino', hist.limitations)}
           ${fieldBlock('Lesões', hist.past_injuries)}
           ${fieldBlock('Cirurgias', hist.surgeries)}
           ${fieldBlock('Doenças crónicas', hist.chronic_diseases)}
           ${fieldBlock('Medicação', hist.medication)}`
        : '<p class="muted" style="margin:0.2rem 0 0">Sem história clínica registada.</p>'}
    </div>

    <div class="pd-section">
      <div class="cf-section-head">
        <span class="pd-label">Avaliação física</span>
        ${canPhysical ? '<button class="btn btn--accent btn--sm" data-add-test type="button">+ Avaliação</button>' : ''}
      </div>
      ${tests.length
        ? `<table class="players-table">
             <thead><tr><th>Data</th><th>Teste</th><th>Valor</th>${canPhysical ? '<th></th>' : ''}</tr></thead>
             <tbody>${tests.map((t) => testRowHTML(t, canPhysical)).join('')}</tbody>
           </table>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem avaliações registadas.</p>'}
    </div>

    <div class="pd-section">
      <span class="pd-label">Controlo de treino</span>
      <div class="med-stats" style="margin:0.4rem 0 0.6rem">
        <span class="badge badge--ok">${gym.treinos} treino${gym.treinos === 1 ? '' : 's'}</span>
        <span class="badge badge--danger">${gym.faltas} falta${gym.faltas === 1 ? '' : 's'}</span>
        <span class="badge badge--info">${Math.round(gym.minutos)} min de treino</span>
        <span class="badge badge--warn">${games.total} min de jogo</span>
      </div>
      ${minutesEditorHTML(p, canPhysical)}
    </div>
  `;

  container.querySelector('[data-edit-profile]')?.addEventListener('click', () => openProfileForm(playerId, rerender));
  container.querySelector('[data-add-test]')?.addEventListener('click', () => openTestForm({ playerId, onSaved: rerender }));
  container.querySelectorAll('[data-test-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = state.physicalTests.find((x) => x.id === b.dataset.testEdit);
      openTestForm({ playerId, test: t, onSaved: rerender });
    })
  );
  container.querySelectorAll('[data-test-del]').forEach((b) =>
    b.addEventListener('click', () => removeTest(b.dataset.testDel, rerender))
  );
  container.querySelectorAll('[data-game-min]').forEach((inp) =>
    inp.addEventListener('change', async () => {
      const minutes = Math.max(0, parseInt(inp.value, 10) || 0);
      try {
        await upsertGameMinutes(inp.dataset.gameMin, playerId, minutes);
        rerender();
      } catch (err) {
        alert(dbErrorMessage(err));
      }
    })
  );
}

function dataItem(label, value) {
  return `
    <div class="pd-item">
      <span class="pd-label">${esc(label)}</span>
      <span class="pd-value">${value ? esc(value) : '—'}</span>
    </div>`;
}

function fieldBlock(label, value) {
  if (!value) return '';
  return `<div class="pd-notes"><span class="pd-label">${esc(label)}</span><p>${esc(value)}</p></div>`;
}

function testRowHTML(t, editable) {
  const unit = t.unit || PHYSICAL_TEST_UNIT[t.type] || '';
  const val = t.value != null ? `${t.value}${unit ? ' ' + unit : ''}` : '—';
  return `
    <tr>
      <td>${esc(fmtDate(t.date))}</td>
      <td>${esc(testName(t))}${t.notes ? `<span class="player-extra muted">${esc(t.notes)}</span>` : ''}</td>
      <td>${esc(val)}</td>
      ${editable
        ? `<td class="cell-actions">
             <button class="btn btn--ghost btn--sm" data-test-edit="${t.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-test-del="${t.id}" type="button">Remover</button>
           </td>`
        : ''}
    </tr>`;
}

function minutesEditorHTML(player, editable) {
  const now = new Date();
  const pastGames = state.events
    .filter((e) => e.type === 'jogo' && e.team_id === player.team_id && eventDateTime(e) <= now)
    .sort((a, b) => eventDateTime(b) - eventDateTime(a))
    .slice(0, 8);

  if (!pastGames.length) {
    return '<p class="muted" style="margin:0.2rem 0 0">Sem jogos registados para a equipa.</p>';
  }
  const minById = {};
  state.gameMinutes.forEach((g) => { if (g.player_id === player.id) minById[g.event_id] = g.minutes; });

  return `
    <div class="pf-games">
      <span class="pd-label">Minutos por jogo (últimos)</span>
      <ul class="cf-appt-list">
        ${pastGames.map((ev) => {
          const dateStr = eventDateTime(ev).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
          const opp = ev.opponent ? `vs ${esc(ev.opponent)}` : esc(ev.title || 'Jogo');
          return `
            <li class="cf-appt-row">
              <span class="cf-appt-row__when">${esc(dateStr)}</span>
              <span class="cf-appt-row__notes">${opp}</span>
              ${editable
                ? `<input type="number" min="0" class="pf-min-input" data-game-min="${ev.id}" value="${minById[ev.id] ?? ''}" placeholder="min" />`
                : `<span class="badge badge--muted">${minById[ev.id] ?? 0} min</span>`}
            </li>`;
        }).join('')}
      </ul>
    </div>`;
}

// --- Formulários ----------------------------------------------------------

function openProfileForm(playerId, onSaved) {
  const prof = physicalProfile(playerId) || {};
  openModal({
    title: 'Dados físicos',
    submitLabel: 'Guardar',
    values: prof,
    fields: [
      { name: 'height_cm', label: 'Altura (cm)', type: 'number' },
      { name: 'weight_kg', label: 'Peso (kg)', type: 'number' },
      { name: 'dominant_hand', label: 'Mão dominante', type: 'select', placeholder: '—', options: DOMINANT_HANDS },
    ],
    onSubmit: async (values) => {
      try {
        await upsertByPlayer('physical_profiles', 'physicalProfiles', playerId, {
          height_cm: values.height_cm ? Number(values.height_cm) : null,
          weight_kg: values.weight_kg ? Number(values.weight_kg) : null,
          dominant_hand: values.dominant_hand || null,
        });
        onSaved?.();
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

export function openTestForm({ playerId, test, onSaved }) {
  const existing = test || null;
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: existing ? 'Editar avaliação' : 'Nova avaliação física',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { date: today, type: 'massa_gorda' },
    fields: [
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'type', label: 'Teste', type: 'select', required: true, options: PHYSICAL_TEST_TYPES },
      { name: 'label', label: 'Nome do teste (se "Outro")', placeholder: 'ex.: Flexibilidade' },
      { name: 'value', label: 'Valor', type: 'number' },
      { name: 'unit', label: 'Unidade', placeholder: 'kg, cm, %, s…' },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const type = values.type || 'outro';
      const payload = {
        player_id: playerId,
        date: values.date,
        type,
        label: type === 'outro' ? (values.label?.trim() || null) : null,
        value: values.value !== '' && values.value != null ? Number(values.value) : null,
        unit: values.unit?.trim() || PHYSICAL_TEST_UNIT[type] || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('physical_tests', 'physicalTests', existing.id, payload);
        else await createRow('physical_tests', 'physicalTests', payload);
        onSaved?.();
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function removeTest(id, onSaved) {
  const ok = await confirmDialog('Remover esta avaliação?');
  if (!ok) return;
  try {
    await deleteRow('physical_tests', 'physicalTests', id);
    onSaved?.();
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
