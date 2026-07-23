# 08 — Índices de FK + composto (DB-2)

## Problema identificado

As foreign keys `audit_steps.report_id` e `violations.step_id` não tinham índice
(o Postgres não indexa FK automaticamente), então o `include` aninhado e os
cascade deletes viram sequential scans conforme as tabelas crescem. A listagem de
histórico ordena por `created_at` mas só havia `@@index([user_id])`, que não cobre
o `ORDER BY`. Auditoria: Banco, Alta.

## Objetivo

Indexar as FKs e trocar o índice de `user_id` por um composto que também cubra a
ordenação do histórico.

## Arquivos alterados

- `prisma/schema.prisma` — `@@index([user_id, created_at])` (substitui `[user_id]`),
  `@@index([report_id])` em `AuditStep`, `@@index([step_id])` em `Violation`.
- `prisma/migrations/20260702000000_add_indexes/migration.sql` — **novo**: DROP do
  índice antigo + CREATE dos 3 índices.

## Alterações realizadas

- O composto `[user_id, created_at]` serve tanto `WHERE user_id` (prefixo, usado
  no webhook `user.deleted`) quanto `WHERE user_id ORDER BY created_at DESC` (histórico),
  então o índice `[user_id]` isolado fica redundante e foi removido.
- Índices em `report_id`/`step_id` aceleram o fan-out (`include`) e os cascade deletes.
- A migração foi escrita à mão seguindo a convenção de nomes do Prisma
  (`{tabela}_{colunas}_idx`), idêntica ao que `prisma migrate dev` geraria.

## Motivo técnico

Um índice composto cobre os dois padrões de query da tabela `audit_reports` com um
só objeto. FKs sem índice são o caso clássico documentado de cascade delete lento.

## Impactos positivos

- Leitura de relatório (`GET /api/audit/:id`) e deletes em cascata deixam de fazer
  seq scan nas tabelas filhas.
- Histórico paginável de forma eficiente (base para API-1).

## Testes executados

- **`prisma validate`**: ✅ "schema is valid".
- **Typecheck / test / build**: ✅ 19/19 (índices não alteram tipos do client).

## Resultado dos testes

✅ Passou na validação de schema.

## Observações

- **Aplicação pendente:** rodar `prisma migrate deploy` (ou `migrate dev`) com o
  Postgres em execução para efetivar a migração — não aplicável neste ambiente
  (sem DB). O SQL é padrão (CREATE/DROP INDEX), mas confirme a aplicação real.
