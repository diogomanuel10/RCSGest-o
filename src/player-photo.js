// Fotografia do atleta nos sítios onde já havia um avatar de iniciais.
//
// Vive num módulo próprio porque o mesmo avatar aparece em quatro ecrãs (o
// cartão do plantel, a linha da lista, o cabeçalho da ficha e o portal) e o
// bucket é PRIVADO: o endereço não se escreve, pede-se assinado. Cada vista
// desenhar isso à sua maneira era quatro sítios a pedir assinaturas em
// alturas diferentes — e o plantel é onde há sessenta de uma vez.
//
// O desenho é em dois tempos, como o resto da app: as vistas escrevem HTML e
// só depois ligam o que é assíncrono. Por isso `photoAvatarHTML` devolve já
// as INICIAIS (que é o que se via até aqui e não pisca) e `hydratePhotos`
// troca-as pela imagem quando os endereços chegarem.

import { photoUrls } from './store.js';
import { esc } from './ui.js';

export function playerInitials(name) {
  return (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || '?';
}

// `cls` é a classe que a vista já usava para o avatar — a foto não traz
// tamanho nem forma próprios, entra no espaço que lá estava.
export function photoAvatarHTML(player, cls = 'pd-avatar') {
  const iniciais = playerInitials(player?.name);
  const path = player?.photo_path || '';
  return `<span class="${cls} avatar-photo${path ? ' avatar-photo--pending' : ''}"${
    path ? ` data-photo-path="${esc(path)}"` : ''
  } aria-hidden="true">${esc(iniciais)}</span>`;
}

// Troca as iniciais pela imagem em TODOS os avatares que o `root` contiver,
// com uma só ida ao servidor. Falhar é não fazer nada: ficam as iniciais, que
// é exatamente o que se via antes de existirem fotos.
export async function hydratePhotos(root) {
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll('[data-photo-path]'));
  if (!nodes.length) return;

  const urls = await photoUrls(nodes.map((n) => n.dataset.photoPath));
  for (const node of nodes) {
    const url = urls.get(node.dataset.photoPath);
    node.classList.remove('avatar-photo--pending');
    if (!url) continue;
    node.style.backgroundImage = `url("${url}")`;
    node.classList.add('avatar-photo--set');
  }
}
