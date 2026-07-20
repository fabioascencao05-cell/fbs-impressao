# FBS Impressão — DTF Gang Sheet Builder

App React + TypeScript + Vite (Tailwind, Supabase) para montagem de gang sheets DTF.

## Comandos

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run lint` — ESLint

## Política de modelos e subagentes

Ao programar neste projeto, use seu julgamento para escolher o melhor modelo
para o trabalho principal (raciocínio, arquitetura, escrita de código).
Delegue tarefas auxiliares a subagentes com modelos menores/mais baratos:

- **Busca e exploração de código** (achar arquivos, mapear estrutura,
  responder "onde fica X?"): use o subagente `explorador` (Haiku).
- **Subtarefas de implementação bem definidas e mecânicas** (renomear,
  aplicar padrão repetitivo, escrever teste a partir de spec clara):
  use o subagente `executor` (Sonnet).
- **Revisão rápida de diff** antes de commit: use o subagente `revisor`
  (Sonnet).

Regras:

1. Não use o modelo principal para varreduras amplas de arquivos —
   delegue ao `explorador` e receba só a conclusão.
2. Decisões de arquitetura, correções sutis de bugs e código crítico
   ficam no modelo principal — não delegue julgamento difícil a modelos
   menores.
3. Prefira poucas delegações grandes a muitas pequenas: cada subagente
   começa sem contexto.
