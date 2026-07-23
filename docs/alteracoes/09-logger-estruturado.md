# 09 — Logger estruturado (OBS-1)

## Problema identificado

`src/logger.ts` era só `console.log` com cores ANSI: sem timestamp, sem nível
estruturado, sem JSON. Em produção containerizada, ANSI polui coletores de log e
não há como filtrar por nível de forma estruturada. Auditoria: Observabilidade, Alta.

## Objetivo

Emitir logs estruturados (JSON, com timestamp e nível) em produção, mantendo a
saída legível ANSI em desenvolvimento — sem alterar nenhum call site.

## Arquivos alterados

- `src/logger.ts` — modo dual (ANSI dev / JSON prod); exporta `formatJson`.
- `src/logger.test.ts` — **novo**: testa o formato JSON.

## Alterações realizadas

- `JSON_MODE = LOG_JSON=1 || NODE_ENV=production`. Em JSON mode, cada registro
  vira uma linha `{"ts","level","msg",...fields}`; `step` inclui `index/total/params`.
- API idêntica (`info/step/success/warn/error`) — os ~67 call sites não mudam.
- `error`→stderr, `warn`→stderr, resto→stdout (preservado).

## Motivo técnico

`console` + `JSON.stringify` cobrem o caso sem adicionar Pino/Winston
(ponytail: stdlib antes de dependência). Modo dual evita quebrar a UX de dev.

## Impactos positivos

- Logs de produção parseáveis por agregadores (JSON, nível, timestamp).
- Sem churn de call sites; risco mínimo.

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 14/14 (2 novos de `formatJson`) · **Build**: ✅

## Resultado dos testes

✅ Passou.

## Observações

- **Follow-up (anotado no código):** `job_id`/`request_id` ainda estão dentro de
  `msg` (interpolados pelos callers). Promovê-los a campos estruturados via child
  loggers é um refactor maior — adiado até haver necessidade real de correlação
  por query.
