# 12 — Graceful shutdown do server (BE-2)

## Problema identificado

Só o `worker.ts` tratava SIGINT/SIGTERM. O `server.ts` chamava
`createServer().listen(...)` sem guardar o handle, então em deploys/reinícios as
conexões HTTP e o pool Prisma eram cortados abruptamente. Auditoria: Backend, Média.

## Objetivo

Encerramento ordenado do processo HTTP, simétrico ao worker.

## Arquivos alterados

- `src/service/server.ts` — captura o handle do `listen`, adiciona `shutdown()`
  em SIGINT/SIGTERM (fecha HTTP, drena requisições em voo, `prisma.$disconnect()`).

## Alterações realizadas

`const server = createServer().listen(...)` + handlers que fazem
`server.close()` (aguardando drain) e depois `prisma.$disconnect()`, então
`process.exit(0)`.

## Motivo técnico

Reusa o `PrismaClient` de módulo já existente e o padrão de shutdown do worker.
Em orquestradores (Docker/K8s) evita conexões/transações cortadas em rolling deploys.

## Impactos positivos

- Deploys sem cortar requisições em voo nem vazar conexões Postgres.
- Consistência de ciclo de vida entre server e worker.

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 14/14 · **Build**: ✅

## Resultado dos testes

✅ Passou (validação por typecheck/build; ciclo de vida de processo não é
unit-testável sem subir o servidor).

## Observações

- Comportamento de drain deve ser confirmado em execução real (SIGTERM no
  container) — recomendado ao subir o docker-compose.
