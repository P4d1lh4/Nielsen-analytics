# 19 — Sincronia de tipos client/server: ação `scroll` (CQ-2)

## Problema identificado

O backend adicionou a ação `scroll` ao discriminated union do flow
(`src/config/schema.ts`), mas o client (`client/src/api/types.ts`) só conhecia
`goto|click|type|wait`. Drift real: o cast do client mascarava a falta de suporte
a `scroll` sem erro de compilação. Auditoria: Clean Code, Média.

## Objetivo

Alinhar o tipo `FlowAction` do client ao backend.

## Arquivos alterados

- `client/src/api/types.ts` — adicionada a variante `{ action: "scroll" }`.
- `client/src/components/AuditForm.tsx` — dica de ações inclui `scroll`.

## Alterações realizadas

Variante `scroll` adicionada ao union; texto de ajuda atualizado. Comentário
apontando que as duas listas (client/server) precisam ser mantidas juntas.

## Motivo técnico

Correção do drift imediato. Um **pacote de tipos compartilhado** (gerado do Zod)
preveniria recorrência, mas é tooling de monorepo — YAGNI por ora; um comentário
marca o débito.

## Impactos positivos

- Client pode montar flows com `scroll`; tipos deixam de divergir do backend.

## Testes executados

- **Build do client** (`tsc -b && vite build`): ✅

## Resultado dos testes

✅ Passou.

## Observações

- Follow-up: `CQ-2` pleno (pacote de tipos compartilhado) fica anotado no
  comentário em `types.ts`.
