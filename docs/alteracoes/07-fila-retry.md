# 07 — Fila com retry/backoff (BE-1)

## Problema identificado

`defaultJobOptions.attempts` era `1`: qualquer falha transitória (blip de rede
ao Redis/S3, rate-limit momentâneo do LLM, glitch do Playwright) descartava o
job em definitivo, desperdiçando um job caro (browser + LLM). Auditoria:
Backend, Alta.

## Objetivo

Recuperar automaticamente falhas transitórias sem intervenção do usuário.

## Arquivos alterados

- `src/service/queue.ts` — `attempts: 3` + `backoff: { type: "exponential", delay: 5000 }`.

## Alterações realizadas

Retry com backoff exponencial (5s, 10s, 20s) para até 3 tentativas. Demais
opções (`removeOnComplete`/`removeOnFail`) inalteradas.

## Motivo técnico

Mudança declarativa mínima no BullMQ; cobre a maior parte das falhas reais
(infra/transientes) sem código novo.

## Impactos positivos

- Jobs sobrevivem a instabilidades momentâneas de Redis/S3/LLM.
- Sem reenvio manual pelo usuário para falhas transitórias.

## Testes executados

- **Typecheck**: ✅  · **Testes** (`npm test`): ✅ 14/14 · **Build**: ✅

## Resultado dos testes

✅ Passou (validação por typecheck/build; a config é declarativa).

## Observações

- **Follow-up (ponytail, anotado no código):** falhas determinísticas
  (URL bloqueada por SSRF, seletor inexistente) ainda consomem as 3 tentativas.
  Se o custo dos browser launches importar, lançar `UnrecoverableError` do worker
  para esses casos pula o retry. Fora do escopo desta config.
- **Integração:** comportamento de retry deve ser confirmado com Redis em
  execução (não disponível neste ambiente).
