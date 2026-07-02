# 23 — Documentar o serviço no README (DOC-1)

## Problema identificado

O README cobria só o CLI. Toda a metade "SaaS" (server, worker, fila BullMQ,
Redis, Clerk, svix, S3, Prisma, docker-compose) era invisível para quem lê o
README — tinha que ler o código para descobrir. Auditoria: Documentação, Alta.

## Objetivo

Documentar o serviço: rotas, como rodar, e as variáveis de ambiente obrigatórias.

## Arquivos alterados

- `README.md` — nova seção "Service (async API + worker)" (rotas, `docker compose up`,
  tabela de env vars, e a seção "Tests & CI").

## Alterações realizadas

Seção acrescentada ao final (o conteúdo do CLI foi preservado). Documenta os 5
endpoints, o fluxo request→fila→worker→S3/Postgres, o comando de subida, a
tabela de variáveis (com as novas `S3_PUBLIC_ENDPOINT`, `CORS_ORIGIN`,
`LOG_JSON`) e os scripts de teste/CI.

## Motivo técnico

Documentação; alinha o README com a arquitetura real e com as melhorias já
aplicadas (bucket privado, env validado no boot, logs JSON, CI).

## Impactos positivos

- Onboarding do serviço sem ler o código-fonte.
- Referência única das env vars obrigatórias.

## Testes executados

- **Manual:** revisão do markdown; links (`.env.example`, ci.yml) conferidos.
  Sem código alterado → typecheck/test/build inalterados (17/17 na última execução).

## Resultado dos testes

✅ Passou (documentação).

## Observações

- OpenAPI/Swagger (parte de DOC-1/API-2) fica para depois; esta etapa cobre a
  documentação em prosa. A geração de spec a partir do Zod é o upgrade natural.
