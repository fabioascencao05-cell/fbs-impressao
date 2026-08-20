# FBS Impressão — DTF Gang Sheet Builder

Aplicação web para preparar, organizar e exportar folhas de impressão DTF.

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + componentes no estilo shadcn/ui (Radix UI + CVA)
- Fabric.js para renderização do canvas (prévia e exportação)
- Zustand para state management
- Supabase Auth (`@supabase/auth-ui-react`) para login/cadastro
- JSZip para agrupar múltiplas páginas exportadas
- Vitest e GitHub Actions para validação automática

## Como funciona

- A folha começa com **57 cm** de largura, mas largura, altura máxima e espaçamento são editáveis.
- Cada PNG, JPG ou WebP entra numa fila com quantidade e largura em centímetros; a altura mantém a proporção da arte.
- "Gerar layout" usa transparência e uma referência conservadora da cor de fundo para aproveitar a silhueta imprimível, com fallback retangular seguro. O motor:
  - Expande cada imagem pela quantidade informada.
  - Testa posições e rotação para combinar artes de formatos diferentes.
  - Cria automaticamente uma nova página quando a altura máxima é excedida (auto-paginação).
  - Nunca coloca silenciosamente uma arte fora da folha; itens impossíveis geram uma mensagem para correção.
- "Baixar DTF" exporta somente a altura realmente usada em **300 DPI** (300 / 2,54 px por cm), grava os metadados de resolução e mantém o fundo transparente. Múltiplas páginas são agrupadas em `.zip`.
- O custo opcional é calculado pela altura usada em metros × preço do filme por metro linear.
- Uploads são limitados por lote, tamanho e resolução para proteger a memória do navegador.
- O projeto é salvo automaticamente no navegador, separado por usuário, e restaurado no próximo acesso no mesmo dispositivo.

## Rodando localmente

```bash
npm install
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Requer Node.js 20 a 24. Para validar uma alteração:

```bash
npm run lint
npm test
npm run build
```

## Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Authentication > Providers**, habilite o provedor **Email**.
3. Copie a **Project URL** e a **anon public key** (Settings > API) para o seu `.env`.

A autenticação é obrigatória. Sem as variáveis acima, a aplicação mostra uma orientação de configuração em vez de uma tela vazia.

## Deploy no Vercel

1. Suba este repositório no GitHub.
2. Importe o projeto no [Vercel](https://vercel.com/new).
3. Configure as variáveis de ambiente `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do projeto.
4. Build command: `npm run build` · Output directory: `dist` (detectado automaticamente pelo preset Vite).
