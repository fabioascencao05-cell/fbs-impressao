# FBS Impressão — instruções para agentes

## Stack e validação

- React 18, TypeScript, Vite, Tailwind, Fabric.js, Zustand e Supabase.
- Antes de entregar mudanças, execute `npm run lint`, `npm test` e `npm run build`.
- Não faça commit, push, merge ou publique uma PR sem autorização explícita.

## Modelos e subagentes

- Use o modelo mais capaz para arquitetura, algoritmos de empacotamento, impressão, segurança e bugs sutis.
- Delegue exploração, testes mecânicos, ajustes repetitivos e revisão de diff a subagentes mais econômicos.
- Divida tarefas por arquivos para evitar conflitos entre agentes.
- Prefira poucas delegações grandes e bem definidas.

## Economia de tokens

- Leia primeiro `README.md` e `CLAUDE.md`.
- Localize arquivos e símbolos com `rg` antes de abrir trechos.
- Não leia `package-lock.json`, `node_modules`, `dist` ou arquivos gerados.
- Em arquivos grandes, leia apenas os intervalos necessários.
- Use `git diff --stat` antes de inspecionar diffs específicos.
- Faça edições cirúrgicas e não reproduza arquivos inteiros no chat.

## Regras do domínio DTF

- Tamanho físico, transparência e metadados de 300 DPI fazem parte da correção funcional.
- Nenhuma arte pode ficar fora da folha ou se sobrepor silenciosamente.
- O empacotamento inteligente deve usar a área real com tinta/cor, com fallback retangular seguro.
- Processamento pesado precisa de limites, progresso e fallback para não travar o navegador.
- Dados e imagens de um usuário nunca podem permanecer visíveis após logout ou troca de conta.
