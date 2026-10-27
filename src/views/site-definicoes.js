// Definições → Site: o site público do clube (<clube>.rumia.pt).
//
// Só o coordenador: publicar é falar em nome do clube para fora, e o
// endereço é escrito pela RPC `set_club_site`, que só a ele responde. Ver
// `supabase/site-publico.sql` para o que pode (e o que nunca pode) sair da app.

import { state, saveSettings, setClubSite, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { confirmDialog } from '../modal.js';
import { teamName } from '../compute.js';
import { GENDER_LABEL } from '../constants.js';

const SITE_DOMAIN = (import.meta.env.VITE_SITE_DOMAIN || 'rumia.pt').trim();

const SECTIONS = [
  { key: 'agenda', label: 'Próximos jogos', hint: 'dia, hora, pavilhão e adversário' },
  { key: 'resultados', label: 'Resultados', hint: 'final e parciais' },
  { key: 'patrocinadores', label: 'Patrocinadores', hint: 'só os confirmados, por nível' },
  { key: 'inscricoes', label: 'Pedidos de inscrição', hint: 'chegam ao Recrutamento, com aviso' },
];

// O site só existe depois de `site-publico.sql` correr: é ele que traz as
// colunas. A linha do `birthDateReady()`.
export function siteReady() {
  return Boolean(state.org && 'site_enabled' in state.org && 'site' in (state.settings || {}));
}

// "Clube Desportivo da Senhora da Hora" → "cd-senhora-hora": uma sugestão, que
// o coordenador corrige — não um endereço escolhido por ele.
function suggestSlug(name) {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !stop.has(w))
    .join('-')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export function renderSiteSettings(el) {
  if (!siteReady()) {
    el.innerHTML = `
      <section class="card settings-card">
        <h2 class="section-title settings-card__title">Site do clube</h2>
        <p class="muted" style="margin:0">
          Para publicar o site do clube é preciso correr primeiro
          <code>supabase/site-publico.sql</code> no Supabase.
        </p>
      </section>`;
    return;
  }

  const org = state.org;
  const site = state.settings.site || {};
  const sections = site.sections || {};
  const hidden = new Set(site.hidden_teams || []);
  const slug = org.slug || suggestSlug(state.settings.club_name || org.name);
  const teams = state.teams.filter((t) => !t.archived_at);
  const dupEscalao = (t) => teams.filter((x) => x.escalao === t.escalao).length > 1;
  const live = org.site_enabled && org.slug;

  el.innerHTML = `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Site do clube</h2>
      <p class="muted" style="margin-top:0">
        Uma página pública para pais, adeptos e patrocinadores, com os dados que
        já estão na Rumia: o resultado de sábado aparece lá assim que é registado.
      </p>
      <p class="muted" style="font-size:0.85rem;margin:0 0 1rem">
        <strong>Nenhum atleta aparece no site</strong> — nem nome, nem número,
        nem foto, nem estatística — e os treinos também não: dizer onde estão
        crianças a horas fixas todas as semanas não é informação pública. Só
        jogos, resultados, patrocinadores e os contactos que escreveres aqui.
      </p>

      <form id="site-form">
        <div class="field">
          <label for="site_slug">Endereço</label>
          <div class="row" style="gap:0.4rem;align-items:center;flex-wrap:nowrap">
            <input type="text" id="site_slug" name="slug" maxlength="40" required
                   value="${esc(slug)}" autocomplete="off" spellcheck="false"
                   pattern="[a-z0-9][a-z0-9\\-]{1,38}[a-z0-9]"
                   style="min-width:0;flex:1" aria-describedby="site_slug_hint" />
            <span class="muted" style="white-space:nowrap">.${esc(SITE_DOMAIN)}</span>
          </div>
          <p class="field__hint muted" id="site_slug_hint" style="margin:0.25rem 0 0;font-size:0.82rem">
            Letras minúsculas, algarismos e hífen. Mudar o endereço depois de
            divulgado parte os links que já foram partilhados.
          </p>
        </div>

        <label class="coach-check" for="site_enabled" style="margin-top:0.8rem">
          <input type="checkbox" id="site_enabled" name="enabled" ${org.site_enabled ? 'checked' : ''} />
          <span><strong>Site publicado</strong> — visível a toda a gente, sem conta</span>
        </label>

        <h3 class="section-title" style="font-size:1rem;margin:1.2rem 0 0.4rem">O que aparece</h3>
        ${SECTIONS.map((s) => `
          <label class="coach-check" for="site_sec_${s.key}">
            <input type="checkbox" id="site_sec_${s.key}" name="sec_${s.key}"
                   ${sections[s.key] === false ? '' : 'checked'} />
            <span>${esc(s.label)} <span class="muted">· ${esc(s.hint)}</span></span>
          </label>`).join('')}

        ${teams.length ? `
        <h3 class="section-title" style="font-size:1rem;margin:1.2rem 0 0.4rem">Escalões no site</h3>
        <p class="muted" style="margin:0 0 0.4rem;font-size:0.85rem">
          Um escalão desmarcado não aparece em lado nenhum do site: nem nos jogos,
          nem nos resultados, nem no formulário de inscrição.
        </p>
        <div class="check-list" style="max-height:220px">
          ${teams.map((t) => `
            <label class="check-item">
              <input type="checkbox" name="team" value="${esc(t.id)}" ${hidden.has(t.id) ? '' : 'checked'} />
              <span>${esc(teamName(t))}${dupEscalao(t) ? ` · ${esc(GENDER_LABEL[t.gender] || t.gender)}` : ''}</span>
            </label>`).join('')}
        </div>` : ''}

        <h3 class="section-title" style="font-size:1rem;margin:1.2rem 0 0.4rem">Sobre e contactos</h3>
        <div class="field">
          <label for="site_about">Sobre o clube</label>
          <textarea id="site_about" name="about" rows="3" maxlength="1200"
                    placeholder="Uma ou duas frases: desde quando existe, que modalidade, onde treina.">${esc(site.about || '')}</textarea>
        </div>
        <div class="field-grid">
          <div class="field">
            <label for="site_email">Email</label>
            <input type="email" id="site_email" name="email" maxlength="160" value="${esc(site.email || '')}" />
          </div>
          <div class="field">
            <label for="site_phone">Telefone</label>
            <input type="tel" id="site_phone" name="phone" maxlength="40" value="${esc(site.phone || '')}" />
          </div>
          <div class="field">
            <label for="site_address">Pavilhão / morada</label>
            <input type="text" id="site_address" name="address" maxlength="200" value="${esc(site.address || '')}" />
          </div>
          <div class="field">
            <label for="site_instagram">Instagram</label>
            <input type="text" id="site_instagram" name="instagram" maxlength="200"
                   placeholder="@clube" value="${esc(site.instagram || '')}" />
          </div>
          <div class="field">
            <label for="site_facebook">Facebook</label>
            <input type="text" id="site_facebook" name="facebook" maxlength="200"
                   placeholder="nome da página ou link" value="${esc(site.facebook || '')}" />
          </div>
        </div>
        <p class="muted" style="margin:0.25rem 0 0;font-size:0.82rem">
          Estes contactos ficam públicos. Usa os do clube, não os pessoais.
        </p>

        <p class="settings-msg hidden" id="site-msg"></p>
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-top:0.8rem">
          <div class="row" style="gap:0.5rem;flex-wrap:wrap">
            ${org.slug ? `<a class="btn btn--ghost" target="_blank" rel="noopener"
                href="/site.html?clube=${encodeURIComponent(org.slug)}">Pré-visualizar</a>` : ''}
            ${live ? `<a class="btn btn--ghost" target="_blank" rel="noopener"
                href="https://${esc(org.slug)}.${esc(SITE_DOMAIN)}">Abrir site ↗</a>` : ''}
          </div>
          <button type="submit" class="btn btn--primary">Guardar</button>
        </div>
      </form>
    </section>`;

  const form = el.querySelector('#site-form');
  const msg = el.querySelector('#site-msg');
  const show = (text, kind) => {
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  };

  form.slug.addEventListener('input', () => {
    const v = form.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (v !== form.slug.value) form.slug.value = v;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const newSlug = form.slug.value.trim();
    // Mudar o endereço de um site já publicado parte todos os links que já
    // foram para o Instagram e para os grupos — pergunta-se antes.
    if (org.site_enabled && org.slug && newSlug !== org.slug) {
      const ok = await confirmDialog(
        `O site deixa de abrir em ${org.slug}.${SITE_DOMAIN}, e os links já partilhados deixam de funcionar.`,
        { confirmLabel: 'Mudar endereço' }
      );
      if (!ok) return;
    }
    const checkedTeams = new Set([...form.querySelectorAll('input[name="team"]:checked')].map((i) => i.value));
    const value = (name) => (form.elements[name]?.value || '').trim() || null;
    const nextSite = {
      ...site,
      sections: Object.fromEntries(SECTIONS.map((s) => [s.key, form.elements[`sec_${s.key}`].checked])),
      hidden_teams: teams.filter((t) => !checkedTeams.has(t.id)).map((t) => t.id),
      about: value('about'),
      email: value('email'),
      phone: value('phone'),
      address: value('address'),
      instagram: value('instagram'),
      facebook: value('facebook'),
    };
    btn.disabled = true;
    try {
      // O endereço primeiro: é o que pode ser recusado (já usado, reservado).
      await setClubSite(newSlug, form.enabled.checked);
      await saveSettings({ site: nextSite });
    } catch (err) {
      show(dbErrorMessage(err), 'error');
      btn.disabled = false;
    }
  });
}
