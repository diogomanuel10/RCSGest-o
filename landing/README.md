# Rumia — Landing page

Mini-site de marketing da **Rumia**, independente da aplicação. O `index.html`
é autossuficiente (HTML + CSS + um pouco de JS), sem passo de build, e usa o
logótipo real da app em `logo-mark.png` (o símbolo "R", recortado de
`public/logo.png`). Abre diretamente no navegador e faz deploy em qualquer
alojamento de sites estáticos — basta publicar a pasta `landing/` inteira.

## Ficheiros

| Ficheiro | O que é |
|----------|---------|
| `index.html` | A página. HTML, CSS e JS num só ficheiro. |
| `privacidade.html` · `termos.html` | Páginas legais (**modelos por preencher** — ver abaixo). |
| `legal.css` | Estilo das páginas legais. Só elas o usam. |
| `robots.txt` · `sitemap.xml` | Indexação. Têm o domínio lá dentro. |
| `og-cover.jpg` | Imagem de partilha (1200×630). É a versão servida. |
| `og-cover.png` | Original em alta (2400×1260), guardado para regerar. |
| `shots/*.webp` | Ecrãs reais servidos ao visitante (1440px, ~55 KB cada). |
| `shots/*.png` | Originais em alta, e recurso para browsers sem WebP. |

As capturas são servidas em WebP com `<picture>` e o PNG como alternativa. Para
substituir uma captura, guarda o PNG novo em `shots/` e regenera o WebP:

```bash
python3 -c "
from PIL import Image
im = Image.open('shots/planteis.png')
im.resize((1440, round(im.height*1440/im.width)), Image.LANCZOS).save('shots/planteis.webp','WEBP',quality=80,method=6)"
```

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

**Por ordem de importância:**

1. **Domínio** — procura por `https://www.rumia.pt` em `index.html`,
   `privacidade.html`, `termos.html`, `robots.txt` e `sitemap.xml` e troca pelo
   teu. Aparece no `canonical`, no `og:url` e nas imagens de partilha. Um
   `canonical` errado diz ao Google que a página verdadeira é outra — é pior do
   que não ter nenhum, e as imagens de partilha **têm** de ser URLs absolutos ou
   o WhatsApp e o LinkedIn ficam sem pré-visualização.
2. **Páginas legais** — `privacidade.html` e `termos.html` são modelos: os
   campos por preencher estão entre parênteses retos e realçados a amarelo no
   ecrã, e cada página abre com um aviso visível. Preenche-os, confirma a lista
   de subcontratantes que usas mesmo e submete a revisão de quem de direito.
   Publicar isto por preencher é pior do que não ter página nenhuma.
3. **Contacto / CTA** — não há nenhum, e é de propósito. A página não tem
   registo, nem formulário, nem "falar connosco": o acesso à Rumia é dado à
   mão, clube a clube, na conversa que já existe. A página serve para explicar
   o produto a quem já está a falar contigo — não para captar desconhecidos.
   Sem formulário também não há nada para manter nem para responder.

   Se um dia abrires o registo, os sítios de pôr o botão são o hero e a secção
   final (`#acesso`) — e aí a app tem de deixar de ser por convite.
4. **Preços** — três planos (19 € / 49 € / 79 €), com os nomes, módulos e
   limites iguais aos da app (ver `supabase/plans.sql` e `src/plans.js`). Ao
   mudar um preço, muda-o também no bloco JSON-LD do `<head>` — os dados
   estruturados que não correspondem ao que está na página são motivo de
   penalização.
5. **Textos** — hero, funcionalidades e FAQ estão prontos, mas afina o tom à
   vontade. Ao editar o FAQ, atualiza o `FAQPage` do JSON-LD.
6. Não há dados falsos de clientes nem números inventados de "clubes a usar" —
   acrescenta prova social só quando for verdadeira. **É o que falta a esta
   página**: um testemunho real ou o nome de um clube-piloto muda-a mais do que
   qualquer ajuste de design.

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
- A janela do produto no hero, o cartão de papéis e o quiosque QR são mocks em
  CSS (não são imagens); a secção "Por dentro" usa capturas reais da app.
- O menu do telemóvel só se transforma em painel quando há JS. Sem JS, os links
  ficam numa segunda linha da barra — nunca escondidos, que era o que acontecia
  antes.
