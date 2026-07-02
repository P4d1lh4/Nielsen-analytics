# 21 — Limpeza backend: round-trip de disco + non-null asserts (CQ-3)

## Problema identificado

1. O worker escrevia `audit-report.json` e **imediatamente relia** o mesmo
   arquivo (`writeReport` → `readFileSync` + `JSON.parse`) só para obter um objeto
   que ele já tinha em memória; o workspace é apagado logo depois. I/O inútil e
   acoplamento a disco num serviço.
2. `report.ts` usava non-null assertions (`r.audit!`, `r.error!`) confiando em
   filtros anteriores sem type guard — frágil a refatoração.
Auditoria: Clean Code, Baixa.

## Objetivo

Remover o round-trip de disco no caminho do serviço e as non-null assertions.

## Arquivos alterados

- `src/evaluator/report.ts` — extraído `buildReport(results, model)` (puro);
  `writeReport` passa a usá-lo; filtros com **type guards** eliminam os 4 `!`.
- `src/service/worker.ts` — usa `buildReport(results, MODEL)` direto; removidos
  `writeReport`/`readFileSync`/o parse de `audit-report.json`. Docstring corrigida.
- `src/evaluator/report.test.ts` — **novo**: testa `buildReport`.

## Alterações realizadas

- `buildReport` é agora a função pura que monta o `AuditReport`; `writeReport`
  = `buildReport` + `writeFileSync` (a CLI segue gravando o arquivo, que o
  `report`/dashboard consomem).
- O worker não grava mais o JSON: o fluxo do serviço nunca precisa dele em disco
  (o workspace é apagado no `finally`), então persiste no Postgres a partir do
  objeto em memória.
- Filtros `results.filter((r): r is AnalyzedStep => Boolean(r.audit))` e o guard
  `if (!r.audit) continue;` no `printSummary` removem todos os `!`.

## Motivo técnico

Separar "montar" de "gravar" (SRP) torna a lógica pura e testável e elimina o I/O
desnecessário no worker sem afetar a CLI. Type guards dão segurança de tipo real
em vez de suprimir o compilador.

## Impactos positivos

- Menos I/O e sem dependência de filesystem gravável no caminho do serviço.
- `buildReport` testado (contagens/filtragem).
- Código mais robusto a refatoração (sem `!`).

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 19/19 (2 novos de `buildReport`) · **Build**: ✅
- **Grep**: worker.ts sem `readFileSync`/leitura de `audit-report.json` (só comentários). ✅

## Resultado dos testes

✅ Passou.

## Observações

- `writeReport` permanece para a CLI (`analyze`/`pipeline`/`report`/dashboard),
  que ainda dependem do arquivo em disco.
