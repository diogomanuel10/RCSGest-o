// Vista: Estatísticas de presenças por atleta.
// Por equipa: % de comparência em todos os treinos, contagem por estado.

import { state } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, teamName } from '../compute.js';
import { ATTENDANCE_BADGE } from '../constants.js';

let selectedTeam = '';

export function renderEstatisticas(container) {
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  if (!teams.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Estatísticas</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Presenças por atleta</p>
        </div>
      </header>
      ${emptyHTML('Ainda não há equipas.')}
    `;
    return;
  }

  if (!selectedTeam || !teams.some((t) => t.id === selectedTeam)) {
    selectedTeam = teams[0].id;
  }

  const team = teams.find((t) => t.id === selectedTeam);
  const players = state.players
    .filter((p) => p.team_id === selectedTeam)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // Treinos desta equipa (passados — só esses têm presenças a contar)
  const trainings = state.events.filter(
    (e) => e.type === 'treino' && e.team_id === selectedTeam && eventDateTime(e) <= new Date()
  );
  const totalTrainings = trainings.length;
  const trainingIds = new Set(trainings.map((t) => t.id));

  // Estatísticas por atleta
  const rows = players.map((p) => {
    const atts = state.attendances.filter(
      (a) => a.player_id === p.id && trainingIds.has(a.event_id)
    );
    const byStatus = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
    atts.forEach((a) => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });
    const compareceu = byStatus.presente + byStatus.atraso;
    const total = atts.length;
    const pct = total ? Math.round((compareceu / total) * 100) : null;
    return { player: p, byStatus, compareceu, total, pct, semRegisto: totalTrainings - total };
  });

  // Ordenar por % comparência (melhores primeiro; sem dados no fim)
  const sorted = [...rows].sort((a, b) => {
    if (a.pct === null && b.pct === null) return 0;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct;
  });

  // Resumo global da equipa
  const totalRegistos = rows.reduce((s, r) => s + r.total, 0);
  const totalCompareceu = rows.reduce((s, r) => s + r.compareceu, 0);
  const globalPct = totalRegistos ? Math.round((totalCompareceu / totalRegistos) * 100) : null;

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Estatísticas</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Presenças por atleta</p>
      </div>
    </header>

    <div class="card" style="margin-bottom:1.2rem">
      <div class="row row--between row--wrap" style="gap:0.8rem">
        <div style="min-width:220px">
          <label for="stat-team">Equipa</label>
          <select id="stat-team">
            ${teams.map((t) => `<option value="${t.id}" ${t.id === selectedTeam ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <div class="stat-summary">
          <span class="stat-summary__item">
            <strong>${totalTrainings}</strong> treino${totalTrainings === 1 ? '' : 's'}
          </span>
          <span class="stat-summary__item">
            <strong>${players.length}</strong> atleta${players.length === 1 ? '' : 's'}
          </span>
          <span class="stat-summary__item">
            Taxa global
            <strong class="stat-pct ${globalPct !== null ? (globalPct >= 70 ? 'stat-pct--ok' : globalPct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger') : ''}">
              ${globalPct !== null ? globalPct + '%' : '—'}
            </strong>
          </span>
        </div>
      </div>
    </div>

    ${!totalTrainings
      ? `<div class="card">${emptyHTML('Esta equipa ainda não tem treinos passados com presenças.')}</div>`
      : !players.length
        ? `<div class="card">${emptyHTML('Sem atletas nesta equipa.')}</div>`
        : `<div class="card">
             <div class="stat-table-wrap">
               <table class="stat-table">
                 <thead>
                   <tr>
                     <th>#</th>
                     <th>Atleta</th>
                     <th class="stat-col--center">Presenças</th>
                     <th class="stat-col--center">Atrasos</th>
                     <th class="stat-col--center">Justif.</th>
                     <th class="stat-col--center">Faltas</th>
                     <th class="stat-col--center">Sem reg.</th>
                     <th class="stat-col--bar">% Comparência</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${sorted.map((r) => statRow(r, totalTrainings)).join('')}
                 </tbody>
               </table>
             </div>
           </div>`
    }
  `;

  container.querySelector('#stat-team').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    renderEstatisticas(container);
  });
}

function statRow({ player, byStatus, compareceu, total, pct, semRegisto }, totalTrainings) {
  const pctClass = pct === null ? '' : pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
  const barWidth = pct ?? 0;

  return `
    <tr class="stat-row">
      <td class="stat-num">${esc(player.number || '—')}</td>
      <td class="stat-name">
        <span>${esc(player.name)}</span>
        ${player.position ? `<span class="muted stat-pos">${esc(player.position)}</span>` : ''}
      </td>
      <td class="stat-col--center"><span class="badge badge--ok">${byStatus.presente}</span></td>
      <td class="stat-col--center"><span class="badge badge--warn">${byStatus.atraso}</span></td>
      <td class="stat-col--center"><span class="badge badge--info">${byStatus.justificado}</span></td>
      <td class="stat-col--center"><span class="badge badge--danger">${byStatus.falta}</span></td>
      <td class="stat-col--center"><span class="badge badge--muted">${semRegisto}</span></td>
      <td class="stat-col--bar">
        <div class="stat-bar-wrap">
          <div class="stat-bar">
            <div class="stat-bar__fill stat-bar__fill--${pctClass.replace('stat-pct--', '')}" style="width:${barWidth}%"></div>
          </div>
          <span class="stat-pct ${pctClass}">${pct !== null ? pct + '%' : '—'}</span>
        </div>
      </td>
    </tr>
  `;
}
