# DTF Gang Sheet Builder

MVP de um SaaS para montagem automática de "gang sheets" para impressão DTF.

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + componentes no estilo shadcn/ui (Radix UI + CVA)
- Fabric.js para renderização do canvas (preview e exportação)
- Zustand para state management
- Supabase Auth (`@supabase/auth-ui-react`) para login/cadastro
- JSZip para agrupar múltiplas páginas exportadas

## Como funciona

- A largura da folha é fixa em **57cm**. A altura máxima é definida pelo usuário.
- Cada imagem enviada (PNG, JPG, WebP ou SVG) entra numa fila com quantidade e largura (cm) editáveis; a altura é calculada automaticamente mantendo a proporção original.
- "Gerar Layout" roda um algoritmo MaxRects (Best Short Side Fit) que:
  - Expande cada imagem pela quantidade informada.
  - Testa posições e rotação de 90° para aproveitar os espaços vazios sem alterar o tamanho da arte.
  - Mantém o espaçamento de corte entre artes, mas permite que uma arte isolada encoste na borda útil da folha.
  - Cria automaticamente uma nova página quando a altura máxima é excedida (auto-paginação).
- "Download DTF" renderiza cada página a **300 DPI reais**, com fundo transparente e metadado de 300 DPI. O PNG usa somente a altura ocupada (mais 1 mm de margem final), evitando filme vazio; múltiplas páginas são entregues em `.zip`.
- A fila mostra o DPI efetivo de cada arte no tamanho escolhido. Se você aumentar uma arte além da resolução original, o sistema avisa — ele não inventa qualidade nem reduz o arquivo silenciosamente.
- O Studio permite remover fundo em lote, ampliar imagens para preparo de impressão e vetorizar logos, letras e artes chapadas. A vetorização usa modo **Mais fiel** por padrão, preserva a proporção, remove contornos automáticos que engrossam a arte e permite baixar o resultado em **SVG**. SVGs enviados pelo usuário nunca são rasterizados ou retraçados sem necessidade.
- O Studio também tem **Halftone**: cria retícula em PNG transparente, com controles de tamanho e espaçamento do ponto, ângulo e intensidade. O modo **1 cor** permite escolher a cor e baixa SVG editável dos pontos quando o arquivo não fica pesado; o modo **CMYK visual** usa quatro telas anguladas para efeito de estampa e exporta PNG RGB a 300 DPI. A separação de tinta e o perfil final devem continuar sendo definidos no RIP.

## Rodando localmente

```bash
npm install
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Authentication > Providers**, habilite o provedor **Email**.
3. Copie a **Project URL** e a **anon public key** (Settings > API) para o seu `.env`.

Nenhuma tabela customizada é necessária para este MVP — apenas autenticação.

## Deploy no Vercel

1. Suba este repositório no GitHub.
2. Importe o projeto no [Vercel](https://vercel.com/new).
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do projeto.
4. Build command: `npm run build` · Output directory: `dist` (detectado automaticamente pelo preset Vite).
