# 18 — Acessibilidade no client (UX-1)

## Problema identificado

O client tinha praticamente zero acessibilidade: o estado de polling (que muda a
cada segundo) não era anunciado por leitores de tela (`aria-live` ausente), os
erros não tinham `role="alert"`, e a dica do textarea não estava associada
(`aria-describedby`). Ironia: o produto audita WCAG mas não a seguia. Auditoria:
UX, Média/Alta.

## Objetivo

Cobrir as falhas WCAG básicas de anúncio de estado dinâmico e de erros.

## Arquivos alterados

- `client/src/components/AuditPolling.tsx` — `role="status"` + `aria-live="polite"` na região de progresso.
- `client/src/App.tsx` — `role="alert"` no card de erro.
- `client/src/components/AuditForm.tsx` — `role="alert"` no erro; `aria-describedby="flow-hint"` no textarea (a dica ganhou `id`).

## Alterações realizadas

Atributos ARIA mínimos e corretos nos três pontos de conteúdo dinâmico/erro. Sem
mudança visual.

## Motivo técnico

`aria-live="polite"` faz o leitor anunciar o progresso do job; `role="alert"`
anuncia erros assim que aparecem; `aria-describedby` liga a dica de ações ao
campo. São as correções de maior impacto por menor esforço.

## Impactos positivos

- Usuários de leitor de tela acompanham progresso e recebem erros.
- Base para uma auditoria WCAG mais completa depois (foco, landmarks).

## Testes executados

- **Build do client** (`tsc -b && vite build`): ✅

## Resultado dos testes

✅ Passou.

## Observações

- Cobertura parcial (o essencial). Refinamentos futuros: gestão de foco entre
  telas, `landmarks`/`role="region"` amarrando `section`/`article` aos headings,
  e verificação de contraste.
