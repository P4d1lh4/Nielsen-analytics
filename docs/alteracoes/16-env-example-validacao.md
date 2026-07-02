# 16 — .env.example + validação de env no boot (CFG-1)

## Problema identificado

Não havia `.env.example` (um novo dev tinha que ler o código para descobrir as
variáveis), e não havia validação central de env: cada módulo lia `process.env`
com fallback silencioso ou falhava tarde (ex.: erro de S3 só no primeiro job).
Auditoria: Config, Média.

## Objetivo

Documentar todas as variáveis e falhar rápido (fail-fast) no boot quando algo
obrigatório estiver ausente.

## Arquivos alterados

- `src/config/env.ts` — **novo**: `requireEnv(names)` (lança listando todos os ausentes; string vazia conta como ausente).
- `src/config/env.test.ts` — **novo**: testes de `requireEnv`.
- `src/service/server.ts` — `requireEnv(["DATABASE_URL", "CLERK_SECRET_KEY"])` no boot.
- `src/service/worker.ts` — `requireEnv(["DATABASE_URL", "S3_ENDPOINT", "S3_BUCKET_NAME", "S3_ACCESS_KEY", "S3_SECRET_KEY"])` no boot.
- `.env.example` — **novo**: todas as variáveis com placeholders (sem valores reais).

## Alterações realizadas

Cada processo valida no boot só o que realmente não pode faltar. `REDIS_URL`
continua opcional (tem default em `connection.ts`). O `.env.example` cobre DB,
Redis, Clerk, S3 (incluindo o novo `S3_PUBLIC_ENDPOINT`), engine de LLM,
`CORS_ORIGIN`, `LOG_JSON` e tuning.

## Motivo técnico

Uma função de 4 linhas cobre o fail-fast sem um schema Zod pesado (ponytail).
Como não é executada em build/tests (server/worker são entrypoints), não afeta a
validação — só dispara no processo real.

## Impactos positivos

- Misconfig aparece no boot, não no primeiro request/job.
- Onboarding documentado (`.env.example`).

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 17/17 (3 novos de `requireEnv`) · **Build**: ✅

## Resultado dos testes

✅ Passou.

## Observações

- Um schema Zod completo (tipando/parseando cada var) é um upgrade possível; por
  ora, presença obrigatória cobre o caso mais comum de misconfig.
