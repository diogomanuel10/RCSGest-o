# Rumia — Landing page

Mini-site de marketing da **Rumia**, independente da aplicação. O `index.html`
é autossuficiente (HTML + CSS + um pouco de JS), sem passo de build, e usa o
logótipo real da app em `logo-mark.png` (o símbolo "R", recortado de
`public/logo.png`). Abre diretamente no navegador e faz deploy em qualquer
alojamento de sites estáticos — basta publicar a pasta `landing/` inteira.

## Pré-visualizar localmente

Basta abrir o ficheiro:

```bash
open landing/index.html        # macOS
xdg-open landing/index.html    # Linux
```

Ou servir a pasta (evita restrições de alguns navegadores):

```bash
npx serve landing
# ou
python3 -m http.server 8080 --directory landing
```

## Antes de publicar — o que editar

Tudo está em `landing/index.html`:

- **Preços** — os valores (`19€`, `39€`, `69€`) e o que cada plano inclui são
  **exemplos**. Procura pela secção `id="precos"` (tem um comentário de aviso) e
  ajusta ao teu modelo de negócio.
- **Contacto / CTA** — os botões apontam para `mailto:duospike410@gmail.com`.
  Para trocar, procura por `duospike410@gmail.com` (ou substitui por um
  formulário/checkout).
- **Textos** — hero, funcionalidades e FAQ estão prontos, mas afina o tom à
  vontade.
- Não há dados falsos de clientes nem números inventados de "clubes a usar" —
  acrescenta prova social só quando for verdadeira.

## Publicar (opções gratuitas)

- **Netlify / Vercel** — arrasta a pasta `landing/` ou liga o repositório e
  define `landing` como diretório a publicar.
- **GitHub Pages** — publica a pasta `landing/` (ou copia o `index.html` para a
  branch/pasta de Pages).
- **Cloudflare Pages** — igual, aponta para `landing/`.

Depois, aponta o teu domínio (ex.: `rumia.pt`) para o alojamento escolhido.

## Notas de design

- Identidade alinhada com a app: azul-marinho `#143b61` + amarelo `#f2b705`,
  tipos **Barlow Semi Condensed** (títulos) e **Inter** (corpo).
- Suporta tema claro e escuro automaticamente (`prefers-color-scheme`).
- As "capturas" do produto são mocks em CSS (não são imagens). Quando tiveres
  capturas reais da app, podes substituí-las para dar mais impacto.
