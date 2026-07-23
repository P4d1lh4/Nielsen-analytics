# 05 — Migration `user_id` (DB-1): decisão

## Problema identificado

A migração `20260605121236_add_user_id` faz `ADD COLUMN "user_id" TEXT NOT NULL`
sem default nem backfill — quebra se aplicada a uma tabela `audit_reports` já
populada (o próprio Prisma avisa no cabeçalho). Auditoria: Banco, Crítica.

## Decisão: sem ação retroativa segura

**Não** editei a migração existente. Reescrever uma migração **já aplicada** é
inseguro: quebra o histórico do Prisma (checksums em `_prisma_migrations`) para
qualquer ambiente que já a rodou, e não conserta ambientes existentes.

Análise do risco real:
- **Ambientes existentes** (dev): a migração já foi aplicada com a tabela vazia →
  nenhum problema atual, nada a corrigir.
- **Setup do zero**: a tabela nasce vazia → a migração aplica sem erro.
- **Único cenário problemático**: *replay* do histórico de migrações sobre um dump
  com dados anteriores à migração — não acontece em operação normal (`migrate
  deploy` aplica só o que falta; ambientes já a têm aplicada).

## Padrão correto (para migrações futuras — referência)

Colunas `NOT NULL` novas em tabelas potencialmente populadas devem usar
**expand-contract** em 3 passos:

```sql
-- 1) expand: coluna nullable
ALTER TABLE "audit_reports" ADD COLUMN "user_id" TEXT;
-- 2) backfill
UPDATE "audit_reports" SET "user_id" = '<valor>' WHERE "user_id" IS NULL;
-- 3) contract: torna obrigatória
ALTER TABLE "audit_reports" ALTER COLUMN "user_id" SET NOT NULL;
```

## Arquivos alterados

Nenhum (decisão documentada; a migração histórica é imutável).

## Resultado

✅ Resolvido como **documentado / sem ação retroativa**. O risco residual (replay
sobre dump populado) fica registrado; o padrão seguro acima vale para as próximas
migrações que adicionem colunas obrigatórias.

## Observações

- Se algum dia for necessário recriar o banco a partir de um dump antigo, aplicar
  o backfill manualmente antes de rodar esta migração.
