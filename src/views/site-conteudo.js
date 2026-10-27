// Definições → Site: os CONTEÚDOS do site público — galeria, notícias, loja,
// pedidos da loja e logótipos dos patrocinadores.
//
// O cartão de cima (`site-definicoes.js`) decide o que o site é; este decide o
// que lá está. Só o coordenador, pela mesma razão: publicar é falar em nome do
// clube. Ver `supabase/site-conteudo.sql`.

import {
  state, loadSiteContent, createRow, updateRow, deleteRow, saveSettings,
  uploadSiteImage, deleteSiteImage, siteImageUrl, addSitePhotos, reorderSitePhotos,
  SITE_IMAGE_LARGE, SITE_IMAGE_SMALL,
  dbErrorMessage,
} from '../store.js';
import { esc, euros, loadingHTML } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { teamName } from '../compute.js';
import { toastError } from '../toast.js';

const ORDER_STATUS = {
  nova: { label: 'Novo', badge: 'warn' },
  tratada: { label: 'Tratado', badge: 'ok' },
  cancelada: { label: 'Cancelado', badge: 'muted' },
};

// Escolher várias fotos de uma vez: depois de um jogo há vinte, e uma a uma
// era a forma de ficarem só duas. O input fica no documento até à escolha (a
// razão do `pickFile` — solto, o iPhone devolvia ficheiros vazios).
function pickImages() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    const done = (files) => { input.remove(); resolve(files); };
    input.addEventListener('cancel', () => done([]));
    input.addEventListener('change', () => done([...(input.files || [])]));
    input.click();
  });
}

function fmtDate(d) {
  if (!d) return '';
  const day = String(d).slice(0, 10).split('-').map(Number);
  return new Date(day[0], day[1] - 1, day[2]).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function teamById(id) {
  return state.teams.find((t) => t.id === id);
}

// Os jogos a que uma foto se pode ligar: os que já passaram (é deles que há
// fotos), mais recentes primeiro.
function gameOptions() {
  const today = new Date().toISOString().slice(0, 10);
  return state.events
    .filter((e) => e.type === 'jogo' && e.date <= today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 80)
    .map((e) => {
      const t = teamById(e.team_id);
      return { key: e.id, label: `${fmtDate(e.date)} · ${t ? teamName(t) : 'Clube'} vs ${e.opponent || e.title || '—'}` };
    });
}

function gameLabel(id) {
  return gameOptions().find((o) => o.key === id)?.label || '';
}

// --- Blocos -----------------------------------------------------------------

function galleryHTML() {
  const list = state.sitePhotos;
  return `
    <section class="card settings-card">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
        <h2 class="section-title settings-card__title" style="margin:0">Galeria de jogos <span class="muted">(${list.length})</span></h2>
        <button type="button" class="btn btn--primary btn--sm" data-act="photo-add">+ Adicionar fotos</button>
      </div>
      <p class="muted" style="margin:0.5rem 0 1rem;font-size:0.88rem">
        As fotos passam no carrossel do início do site, as primeiras à frente.
        Liga-as a um jogo e a legenda ("vs Adversário · 3–1") escreve-se sozinha.
        Publica só fotos que o clube tem autorização para publicar — a maior
        parte de quem joga são menores.
      </p>
      ${list.length ? `
      <ul class="site-thumbs">
        ${list.map((p, i) => `
          <li class="site-thumb">
            <img src="${esc(siteImageUrl(p.path))}" alt="" loading="lazy" />
            <div class="site-thumb__body">
              <p class="site-thumb__cap">${esc(p.caption || gameLabel(p.event_id) || 'Sem legenda')}</p>
              <div class="site-thumb__actions">
                <button type="button" class="btn btn--ghost btn--sm" data-act="photo-up" data-id="${esc(p.id)}"
                        ${i === 0 ? 'disabled' : ''} aria-label="Passar para a frente">↑</button>
                <button type="button" class="btn btn--ghost btn--sm" data-act="photo-edit" data-id="${esc(p.id)}">Editar</button>
                <button type="button" class="btn btn--ghost btn--sm" data-act="photo-del" data-id="${esc(p.id)}">Remover</button>
              </div>
            </div>
          </li>`).join('')}
      </ul>` : '<p class="muted" style="margin:0">Ainda não há fotos. Sem fotos, o topo do site mostra as cores do clube.</p>'}
    </section>`;
}

function postsHTML() {
  const list = state.sitePosts;
  return `
    <section class="card settings-card">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
        <h2 class="section-title settings-card__title" style="margin:0">Notícias <span class="muted">(${list.length})</span></h2>
        <button type="button" class="btn btn--primary btn--sm" data-act="post-add">+ Nova notícia</button>
      </div>
      ${list.length ? `
      <ul class="site-rows">
        ${list.map((p) => `
          <li class="site-row">
            ${p.cover_path ? `<img class="site-row__img" src="${esc(siteImageUrl(p.cover_path))}" alt="" loading="lazy" />` : '<span class="site-row__img site-row__img--empty" aria-hidden="true">📰</span>'}
            <div class="site-row__body">
              <p class="site-row__title">${esc(p.title)}</p>
              <p class="muted site-row__meta">
                <span class="badge badge--${p.published ? 'ok' : 'muted'}">${p.published ? 'Publicada' : 'Rascunho'}</span>
                ${p.published_at ? ` ${esc(fmtDate(p.published_at))}` : ''}
                ${p.team_id && teamById(p.team_id) ? ` · ${esc(teamName(teamById(p.team_id)))}` : ''}
              </p>
            </div>
            <div class="site-row__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-act="post-edit" data-id="${esc(p.id)}">Editar</button>
              <button type="button" class="btn btn--ghost btn--sm" data-act="post-del" data-id="${esc(p.id)}">Remover</button>
            </div>
          </li>`).join('')}
      </ul>` : '<p class="muted" style="margin:0.6rem 0 0">Ainda não há notícias. Uma vitória, uma subida, um torneio — é o que dá vontade de voltar ao site.</p>'}
    </section>`;
}

function productsHTML() {
  const list = state.siteProducts;
  return `
    <section class="card settings-card">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
        <h2 class="section-title settings-card__title" style="margin:0">Loja do clube <span class="muted">(${list.length})</span></h2>
        <button type="button" class="btn btn--primary btn--sm" data-act="prod-add">+ Novo artigo</button>
      </div>
      <p class="muted" style="margin:0.5rem 0 1rem;font-size:0.88rem">
        Não há pagamento online: quem encomenda deixa o nome e o contacto, e o
        pedido chega-te aqui em baixo (e no sino) para combinares o pagamento e a
        entrega.
      </p>
      ${list.length ? `
      <ul class="site-rows">
        ${list.map((p) => `
          <li class="site-row">
            ${p.photo_path ? `<img class="site-row__img" src="${esc(siteImageUrl(p.photo_path))}" alt="" loading="lazy" />` : '<span class="site-row__img site-row__img--empty" aria-hidden="true">👕</span>'}
            <div class="site-row__body">
              <p class="site-row__title">${esc(p.name)}</p>
              <p class="muted site-row__meta">
                ${p.price == null ? 'Sem preço' : esc(euros(p.price))}
                ${(p.sizes || []).length ? ` · ${esc(p.sizes.join(' / '))}` : ''}
                ${p.active ? '' : ' · <span class="badge badge--muted">Fora da loja</span>'}
              </p>
            </div>
            <div class="site-row__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-act="prod-edit" data-id="${esc(p.id)}">Editar</button>
              <button type="button" class="btn btn--ghost btn--sm" data-act="prod-del" data-id="${esc(p.id)}">Remover</button>
            </div>
          </li>`).join('')}
      </ul>` : '<p class="muted" style="margin:0">A loja está vazia: no site, a secção só aparece quando houver artigos.</p>'}
    </section>`;
}

function orderRow(o) {
  const st = ORDER_STATUS[o.status] || ORDER_STATUS.nova;
  const total = o.unit_price == null ? '' : ` · ${euros(Number(o.unit_price) * o.quantity)}`;
  return `
    <li class="site-row">
      <div class="site-row__body">
        <p class="site-row__title">${esc(o.quantity)}× ${esc(o.product_name)}${o.size ? ` <span class="badge badge--info">${esc(o.size)}</span>` : ''}</p>
        <p class="muted site-row__meta">
          <span class="badge badge--${st.badge}">${st.label}</span>
          ${esc(o.name)} · ${esc(o.contact)} · ${esc(fmtDate(o.created_at))}${esc(total)}
        </p>
        ${o.message ? `<p class="site-row__note">${esc(o.message)}</p>` : ''}
      </div>
      <div class="site-row__actions">
        ${o.status === 'nova' ? `
          <button type="button" class="btn btn--ghost btn--sm" data-act="order-done" data-id="${esc(o.id)}">Tratado</button>
          <button type="button" class="btn btn--ghost btn--sm" data-act="order-cancel" data-id="${esc(o.id)}">Cancelar</button>`
        : `<button type="button" class="btn btn--ghost btn--sm" data-act="order-reopen" data-id="${esc(o.id)}">Reabrir</button>`}
      </div>
    </li>`;
}

function ordersHTML() {
  const list = state.siteOrders;
  if (!list.length && !state.siteProducts.length) return '';
  const open = list.filter((o) => o.status === 'nova');
  const closed = list.filter((o) => o.status !== 'nova');
  return `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Pedidos da loja</h2>
      ${open.length ? `<ul class="site-rows">${open.map(orderRow).join('')}</ul>`
        : '<p class="muted" style="margin:0">Nenhum pedido por tratar.</p>'}
      ${closed.length ? `
        <details class="group" style="margin-top:0.8rem">
          <summary class="group__head">
            <span class="group__title">Tratados e cancelados</span>
            <span class="group__count">${closed.length}</span>
          </summary>
          <ul class="site-rows">${closed.map(orderRow).join('')}</ul>
        </details>` : ''}
    </section>`;
}

function sponsorsHTML() {
  const confirmed = state.sponsors.filter((s) => s.status === 'confirmado' && !s.archived_at);
  const info = state.settings.site?.sponsors || {};
  return `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Patrocinadores no site</h2>
      <p class="muted" style="margin:0 0 1rem;font-size:0.88rem">
        Só os patrocínios <strong>confirmados</strong> aparecem. Um logótipo e um
        link para o site da empresa são o que um patrocinador quer ver.
      </p>
      ${confirmed.length ? `
      <ul class="site-rows">
        ${confirmed.map((s) => {
          const i = info[s.id] || {};
          return `
          <li class="site-row">
            ${i.logo ? `<img class="site-row__img site-row__img--logo" src="${esc(siteImageUrl(i.logo))}" alt="" loading="lazy" />` : '<span class="site-row__img site-row__img--empty" aria-hidden="true">🏷️</span>'}
            <div class="site-row__body">
              <p class="site-row__title">${esc(s.name)}</p>
              <p class="muted site-row__meta">${esc(s.tier ? s.tier[0].toUpperCase() + s.tier.slice(1) : 'Sem nível')}${i.url ? ` · ${esc(i.url)}` : ''}</p>
            </div>
            <div class="site-row__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-act="spons-edit" data-id="${esc(s.id)}">Logótipo e link</button>
            </div>
          </li>`;
        }).join('')}
      </ul>` : '<p class="muted" style="margin:0">Ainda não há patrocínios confirmados.</p>'}
    </section>`;
}

// --- Ações --------------------------------------------------------------------

async function addPhotos() {
  const files = await pickImages();
  if (!files.length) return;
  const failed = await addSitePhotos(files);
  failed.forEach((msg) => toastError(msg));
}

function editPhoto(photo) {
  openModal({
    title: 'Foto da galeria',
    fields: [
      { name: 'event_id', label: 'Jogo', type: 'select', placeholder: 'Nenhum', options: gameOptions(),
        hint: 'Com um jogo escolhido, a legenda leva o adversário e o resultado.' },
      { name: 'caption', label: 'Legenda', placeholder: 'ex.: Festa da subida de divisão', full: true },
    ],
    values: { event_id: photo.event_id || '', caption: photo.caption || '' },
    onSubmit: (v) => updateRow('site_photos', 'sitePhotos', photo.id, {
      event_id: v.event_id || null,
      caption: v.caption.trim() || null,
    }),
  });
}

async function movePhotoUp(photo) {
  const list = state.sitePhotos;
  const i = list.indexOf(photo);
  if (i <= 0) return;
  const next = [...list];
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  try {
    await reorderSitePhotos(next);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

async function removeWithImage(table, collection, row, pathKey, label) {
  const ok = await confirmDialog(`Remover ${label}? Deixa de aparecer no site.`);
  if (!ok) return;
  try {
    await deleteRow(table, collection, row.id);
    await deleteSiteImage(row[pathKey]);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

function teamOptions() {
  return state.teams.filter((t) => !t.archived_at).map((t) => ({ key: t.id, label: teamName(t) }));
}

function editPost(post = null) {
  openModal({
    title: post ? 'Editar notícia' : 'Nova notícia',
    fields: [
      { name: 'title', label: 'Título', required: true, full: true },
      { name: 'summary', label: 'Resumo', full: true,
        hint: 'Uma frase. É o que aparece no cartão da notícia, antes de a abrir.' },
      { name: 'body', label: 'Texto', type: 'textarea', full: true,
        hint: 'Uma linha em branco separa parágrafos.' },
      { name: 'team_id', label: 'Escalão', type: 'select', placeholder: 'Clube inteiro', options: teamOptions() },
      { name: 'published', label: 'Estado', type: 'select', required: true,
        options: [{ key: 'nao', label: 'Rascunho (não aparece no site)' }, { key: 'sim', label: 'Publicada' }] },
      { name: 'cover', label: post?.cover_path ? 'Substituir imagem de capa' : 'Imagem de capa', type: 'file', accept: 'image/*' },
    ],
    values: {
      title: post?.title || '', summary: post?.summary || '', body: post?.body || '',
      team_id: post?.team_id || '', published: post?.published ? 'sim' : 'nao',
    },
    submitLabel: post ? 'Guardar' : 'Criar notícia',
    onSubmit: async (v) => {
      const values = {
        title: v.title.trim(),
        summary: v.summary.trim() || null,
        body: v.body.trim() || null,
        team_id: v.team_id || null,
        published: v.published === 'sim',
      };
      const file = v.cover instanceof File && v.cover.size ? v.cover : null;
      if (file) values.cover_path = await uploadSiteImage('noticia', file, SITE_IMAGE_LARGE);
      if (post) {
        await updateRow('site_posts', 'sitePosts', post.id, values);
        if (file && post.cover_path) deleteSiteImage(post.cover_path);
      } else {
        await createRow('site_posts', 'sitePosts', values);
        state.sitePosts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
    },
  });
}

function parseSizes(text) {
  const seen = new Set();
  return String(text || '').split(/[,;/\n]+/).map((s) => s.trim()).filter((s) => {
    if (!s || seen.has(s.toLowerCase())) return false;
    seen.add(s.toLowerCase());
    return true;
  }).slice(0, 30);
}

function editProduct(prod = null) {
  openModal({
    title: prod ? 'Editar artigo' : 'Novo artigo da loja',
    fields: [
      { name: 'name', label: 'Nome', required: true, placeholder: 'ex.: Camisola oficial 2026/27', full: true },
      { name: 'description', label: 'Descrição', type: 'textarea', full: true },
      { name: 'price', label: 'Preço (€)', type: 'number', step: '0.01',
        hint: 'Em branco aparece "Preço sob consulta".' },
      { name: 'sizes', label: 'Tamanhos', placeholder: 'ex.: 8, 10, 12, S, M, L',
        hint: 'Separados por vírgulas, pela ordem em que devem aparecer. Em branco = tamanho único.' },
      { name: 'active', label: 'Na loja', type: 'select', required: true,
        options: [{ key: 'sim', label: 'Sim, à venda' }, { key: 'nao', label: 'Não (esgotado ou fora de época)' }] },
      { name: 'photo', label: prod?.photo_path ? 'Substituir foto' : 'Foto', type: 'file', accept: 'image/*' },
    ],
    values: {
      name: prod?.name || '', description: prod?.description || '',
      price: prod?.price ?? '', sizes: (prod?.sizes || []).join(', '),
      active: prod && !prod.active ? 'nao' : 'sim',
    },
    submitLabel: prod ? 'Guardar' : 'Criar artigo',
    onSubmit: async (v) => {
      const price = String(v.price).trim() === '' ? null : Number(String(v.price).replace(',', '.'));
      if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('O preço tem de ser um número positivo.');
      const values = {
        name: v.name.trim(),
        description: v.description.trim() || null,
        price,
        sizes: parseSizes(v.sizes),
        active: v.active === 'sim',
      };
      const file = v.photo instanceof File && v.photo.size ? v.photo : null;
      if (file) values.photo_path = await uploadSiteImage('loja', file, SITE_IMAGE_SMALL);
      if (prod) {
        await updateRow('site_products', 'siteProducts', prod.id, values);
        if (file && prod.photo_path) deleteSiteImage(prod.photo_path);
      } else {
        await createRow('site_products', 'siteProducts', { ...values, sort: state.siteProducts.length });
      }
    },
  });
}

function editSponsor(sponsor) {
  const site = state.settings.site || {};
  const current = (site.sponsors || {})[sponsor.id] || {};
  openModal({
    title: sponsor.name,
    intro: 'O logótipo e o link aparecem no site, na secção dos patrocinadores.',
    fields: [
      { name: 'url', label: 'Site da empresa', placeholder: 'ex.: www.empresa.pt', full: true },
      { name: 'logo', label: current.logo ? 'Substituir logótipo' : 'Logótipo', type: 'file', accept: 'image/*',
        hint: 'De preferência com fundo branco ou transparente.' },
      ...(current.logo ? [{ name: 'drop', label: 'Logótipo atual', type: 'select',
        options: [{ key: 'manter', label: 'Manter' }, { key: 'tirar', label: 'Tirar o logótipo' }] }] : []),
    ],
    values: { url: current.url || '', drop: 'manter' },
    onSubmit: async (v) => {
      const file = v.logo instanceof File && v.logo.size ? v.logo : null;
      let logo = current.logo || null;
      const old = logo;
      if (file) logo = await uploadSiteImage('patrocinador', file, SITE_IMAGE_SMALL);
      else if (v.drop === 'tirar') logo = null;
      const url = v.url.trim() || null;
      const sponsors = { ...(site.sponsors || {}) };
      if (logo || url) sponsors[sponsor.id] = { logo, url };
      else delete sponsors[sponsor.id];
      await saveSettings({ site: { ...site, sponsors } });
      if (old && old !== logo) deleteSiteImage(old);
    },
  });
}

async function setOrderStatus(order, status) {
  try {
    await updateRow('site_orders', 'siteOrders', order.id, { status });
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// --- Entrada ------------------------------------------------------------------

export function renderSiteContent(el) {
  if (state.siteContent === null) {
    el.innerHTML = loadingHTML('A carregar os conteúdos do site…');
    loadSiteContent();
    return;
  }
  if (state.siteContent === false) {
    el.innerHTML = `
      <section class="card settings-card">
        <h2 class="section-title settings-card__title">Galeria, notícias e loja</h2>
        <p class="muted" style="margin:0">
          Para pôr fotos, notícias e a loja no site é preciso correr primeiro
          <code>supabase/site-conteudo.sql</code> no Supabase.
        </p>
      </section>`;
    return;
  }

  el.innerHTML = `${galleryHTML()}${postsHTML()}${productsHTML()}${ordersHTML()}${sponsorsHTML()}`;

  const find = (list, id) => list.find((x) => x.id === id);
  el.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'photo-add': addPhotos(); break;
      case 'photo-edit': editPhoto(find(state.sitePhotos, id)); break;
      case 'photo-up': movePhotoUp(find(state.sitePhotos, id)); break;
      case 'photo-del': removeWithImage('site_photos', 'sitePhotos', find(state.sitePhotos, id), 'path', 'esta foto'); break;
      case 'post-add': editPost(); break;
      case 'post-edit': editPost(find(state.sitePosts, id)); break;
      case 'post-del': removeWithImage('site_posts', 'sitePosts', find(state.sitePosts, id), 'cover_path', 'esta notícia'); break;
      case 'prod-add': editProduct(); break;
      case 'prod-edit': editProduct(find(state.siteProducts, id)); break;
      case 'prod-del': removeWithImage('site_products', 'siteProducts', find(state.siteProducts, id), 'photo_path', 'este artigo'); break;
      case 'order-done': setOrderStatus(find(state.siteOrders, id), 'tratada'); break;
      case 'order-cancel': setOrderStatus(find(state.siteOrders, id), 'cancelada'); break;
      case 'order-reopen': setOrderStatus(find(state.siteOrders, id), 'nova'); break;
      case 'spons-edit': editSponsor(find(state.sponsors, id)); break;
      default: break;
    }
  }));
}
