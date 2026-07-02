# 01 — Harness de testes + typecheck + CI mínimo (TEST-1)

## Problema identificado

O repositório não tinha nenhum teste automatizado, nenhum script `test` ou
`typecheck` no backend, e nenhum pipeline de CI. O processo de melhorias exige
validar cada alteração com testes/build — sem harness, toda validação seria
manual, exatamente a fragilidade apontada na auditoria (Testabilidade 2,5;
DevOps 2,0).

## Objetivo

Estabelecer a rede de segurança mínima que valida todas as melhorias seguintes:
`npm run typecheck`, `npm test` e `npm run build` rodáveis local e no CI.

## Arquivos alterados

- `package.json` — novos scripts `typecheck` e `test`.
- `tsconfig.json` — exclui `src/**/*.test.ts` do build emitido.
- `src/service/schema.test.ts` — **novo**: 1º teste (contrato de `auditRequestSchema`).
- `.github/workflows/ci.yml` — **novo**: pipeline (ci: typecheck → test → build).

## Alterações realizadas

- `test`: `tsx --test "src/**/*.test.ts"` — usa o runner nativo `node:test` via
  o `tsx` **já instalado**. Zero dependências novas (ponytail: stdlib antes de
  Vitest). Invocação com glob entre aspas validada em Windows (o Node expande).
- `typecheck`: `tsc --noEmit -p tsconfig.json`.
- `tsconfig.json`: `exclude` passa a conter `src/**/*.test.ts`, para que os
  testes não sejam emitidos em `dist/` (verificado: `dist/service/schema.test.js`
  não é gerado). Testes continuam validados por `npm test`.
- Teste inicial cobre 4 casos do contrato do `POST /api/audit`: payload válido,
  `target_url` inválida, `flow` vazio, e ação desconhecida.
- CI: `npm ci --ignore-scripts` (evita baixar o Chromium do Playwright, não
  necessário para typecheck/test/build) seguido de `npx prisma generate` (tipos
  do Prisma Client) → `typecheck` → `test` → `build`.

## Motivo técnico

O runner `node:test` cobre o caso (asserções simples de funções puras e schemas)
sem adicionar Vitest/Jest. `tsx` já é devDependency, então o custo é zero. O
`schema.ts` é livre de efeitos colaterais no import (não abre Redis/Prisma), o
que o torna o alvo ideal para o primeiro teste sem precisar de mocks.

## Impactos positivos

- Rede de segurança automatizada para as próximas melhorias (Críticas).
- `typecheck` separado do `build` permite checagem rápida sem emitir.
- CI trava regressões de tipo/teste/build em cada push/PR.
- Nenhuma dependência nova; superfície de manutenção mínima.

## Testes executados

- **Build** (`npm run build`): ✅ exit 0.
- **Typecheck** (`npm run typecheck`): ✅ sem erros.
- **Testes unitários** (`npm test`): ✅ 4 passaram, 0 falharam.
- **Testes de integração**: n/a nesta etapa.
- **Verificação manual**: `dist/` não contém arquivos `*.test.js` após o build. ✅

## Resultado dos testes

✅ Passou — typecheck, test (4/4) e build sem erros; testes fora do `dist`.

## Observações

- O CI ainda cobre só o backend. O `client/` tem seu próprio `lint`/`build` e
  entra num item futuro (dependências do client não estão instaladas neste
  ambiente).
- Convenção de teste: arquivos `*.test.ts` ao lado do código, com `node:test` +
  `node:assert/strict`. Sem framework, sem fixtures — YAGNI.
- Próxima melhoria: **SEC-1 (SSRF)** — já poderá acompanhar teste unitário do
  validador de host.
