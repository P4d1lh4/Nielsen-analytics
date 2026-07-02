# 06 — Rate limiting no POST /api/audit (SEC-4)

## Problema identificado

`POST /api/audit` dispara trabalho caro (Playwright + LLM + S3) sem nenhum limite:
um usuário autenticado (ou credencial comprometida) podia enfileirar jobs
ilimitados, esgotando a fila (concorrência fixa = 2) e o orçamento de IA —
negação de serviço econômica. Auditoria: Segurança/API, Alta.

## Objetivo

Limitar a taxa de criação de auditorias por usuário.

## Arquivos alterados

- `src/service/server.ts` — `express-rate-limit` aplicado ao `POST /api/audit`,
  keyed pelo `userId` do Clerk.
- `.env.example` — nova var `AUDIT_RATE_LIMIT`.
- `package.json` — dependência `express-rate-limit`.

## Alterações realizadas

- Janela de 5 min, limite default 10 (env `AUDIT_RATE_LIMIT`), chave =
  `getAuth(req).userId ?? "anon"`. Headers `RateLimit-*` (draft-7). Estouro → 429
  com `{ error: "Too many audit requests..." }`.
- O limiter roda como middleware da rota, depois do `clerkMiddleware`, então o
  `getAuth` já tem o usuário.

## Motivo técnico

`express-rate-limit` é a lib padrão do ecossistema; escrever contador à mão seria
reinventar. Chave por `userId` mira a ameaça real (flood autenticado de jobs
caros), sem depender de `req.ip`/trust-proxy.

## Impactos positivos

- Contém abuso/custo descontrolado de LLM+Playwright por usuário.
- 429 com `Retry-After`/headers padrão para o client se adaptar.

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 19/19 · **Build**: ✅

## Resultado dos testes

✅ Passou (wiring; validação por typecheck/build).

## Observações

- **ponytail (anotado no código):** store **em memória** — limite por instância.
  Para múltiplas réplicas da API, trocar por um store Redis (`rate-limit-redis`,
  o Redis já está no projeto) para compartilhar o limite. Comportamento 429 deve
  ser confirmado com o servidor em execução.
- Limite/janela ajustáveis via `AUDIT_RATE_LIMIT` e a constante `windowMs`.
