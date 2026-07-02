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
- Cada imagem enviada (.PNG) entra numa fila com quantidade e largura (cm) editáveis; a altura é calculada automaticamente mantendo a proporção original.
- "Gerar Layout" roda um algoritmo de bin packing (shelf / First-Fit Decreasing) que:
  - Expande cada imagem pela quantidade informada.
  - Posiciona os itens lado a lado, linha por linha, otimizando o uso do espaço.
  - Cria automaticamente uma nova página quando a altura máxima é excedida (auto-paginação).
- "Download DTF" renderiza cada página num canvas offscreen a **300 DPI** (1cm = 118px), com fundo transparente, e baixa um PNG (ou um `.zip` quando há múltiplas páginas).

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
