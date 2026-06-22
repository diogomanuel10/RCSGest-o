// Secção de documentos do atleta — renderizada dentro do separador Geral da ficha.
// Documentos suportados: Exame Médico, Seguro, Fotocópia do CC.
// Acesso: coordenador, fisioterapeuta e preparador físico.

import { state, uploadPlayerDocument, deletePlayerDocument, getDocumentSignedUrl, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { openModal } from '../modal.js';
import { confirmDialog } from '../modal.js';
import { DOCUMENT_TYPES, DOC_TYPE_LABEL } from '../constants.js';
import { canEdit } from '../permissions.js';

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

function isExpired(d) {
  return d && new Date(d) < new Date();
}
function isSoonExpiry(d) {
  if (!d) return false;
  const diff = (new Date(d) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

export function renderDocumentsInto(container, playerId) {
  const editable = canEdit('documents');
  const docs = state.playerDocuments.filter((d) => d.player_id === playerId);

  container.innerHTML = `
    <div class="pd-section">
      <span class="pd-label">Documentos</span>
      <div class="doc-grid">
        ${DOCUMENT_TYPES.map((type) => {
          const doc = docs.find((d) => d.doc_type === type.key);
          return `
            <div class="doc-card${doc ? '' : ' doc-card--empty'}">
              <div class="doc-card__head">
                <span class="doc-card__icon" aria-hidden="true">${type.icon}</span>
                <span class="doc-card__label">${esc(type.label)}</span>
              </div>
              ${doc ? `
                <div class="doc-card__body">
                  <span class="doc-card__file" title="${esc(doc.filename)}">${esc(doc.filename)}</span>
                  ${doc.expires_at ? `
                    <span class="badge badge--${isExpired(doc.expires_at) ? 'danger' : isSoonExpiry(doc.expires_at) ? 'warn' : 'muted'} doc-expiry">
                      Validade: ${fmtDate(doc.expires_at)}${isExpired(doc.expires_at) ? ' ⚠ Expirado' : isSoonExpiry(doc.expires_at) ? ' ⚠ A expirar' : ''}
                    </span>` : ''}
                  <div class="doc-card__actions">
                    <button class="btn btn--ghost btn--sm" data-doc-view="${esc(doc.storage_path)}" type="button">Ver</button>
                    ${editable ? `<button class="btn btn--ghost btn--sm btn--danger" data-doc-delete="${esc(doc.id)}" type="button">Eliminar</button>` : ''}
                  </div>
                </div>
              ` : `
                <p class="muted doc-card__empty">Sem documento</p>
              `}
              ${editable ? `
                <button class="btn btn--ghost btn--sm doc-card__upload" data-doc-upload="${type.key}" data-has-expiry="${type.hasExpiry}" type="button">
                  ${doc ? 'Substituir' : 'Carregar'}
                </button>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Ver documento
  container.querySelectorAll('[data-doc-view]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const url = await getDocumentSignedUrl(btn.dataset.docView);
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        alert(dbErrorMessage(err));
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Eliminar documento
  container.querySelectorAll('[data-doc-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirmDialog('Eliminar este documento permanentemente?', async () => {
        try {
          await deletePlayerDocument(btn.dataset.docDelete);
          renderDocumentsInto(container, playerId);
        } catch (err) {
          alert(dbErrorMessage(err));
        }
      });
    });
  });

  // Carregar / Substituir documento
  container.querySelectorAll('[data-doc-upload]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const docType = btn.dataset.docUpload;
      const hasExpiry = btn.dataset.hasExpiry === 'true';
      const docLabel = DOC_TYPE_LABEL[docType] || docType;

      openModal({
        title: `Carregar — ${docLabel}`,
        submitLabel: 'Carregar',
        fields: [
          {
            name: 'file',
            label: 'Ficheiro (PDF, JPG ou PNG, máx. 10 MB)',
            type: 'file',
            accept: '.pdf,.jpg,.jpeg,.png,.webp',
            required: true,
          },
          ...(hasExpiry ? [{
            name: 'expires_at',
            label: 'Data de validade',
            type: 'date',
          }] : []),
        ],
        onSubmit: async (values) => {
          const file = values.file;
          if (!file || file.size === 0) throw new Error('Seleciona um ficheiro.');
          if (file.size > 10 * 1024 * 1024) throw new Error('O ficheiro não pode exceder 10 MB.');
          await uploadPlayerDocument(playerId, docType, file, values.expires_at || null);
          renderDocumentsInto(container, playerId);
        },
      });
    });
  });
}
