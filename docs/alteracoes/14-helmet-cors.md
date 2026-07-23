# 14 — helmet + CORS (SEC-5)

## Problema identificado

A API não usava `helmet` (headers de segurança padrão) nem `cors` explícito.
A "segurança" vinha apenas do default do Express, não de uma decisão deliberada.
Auditoria: Segurança, Média.

## Objetivo

Adicionar headers de segurança padrão e uma política de CORS explícita com
allowlist.

## Arquivos alterados

- `src/service/server.ts` — `app.use(helmet())` + `app.use(cors({ origin, credentials }))`.
- `.env.example` — nova var `CORS_ORIGIN`.
- `package.json` — dependências `helmet`, `cors`, `@types/cors`.

## Alterações realizadas

- `helmet()` com defaults (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
  aplicado a todas as respostas.
- CORS a partir de `CORS_ORIGIN` (allowlist separada por vírgula). **Default
  seguro:** sem `CORS_ORIGIN` → `origin: false` (nenhum acesso cross-origin); em
  dev o client usa o proxy do Vite (same-origin), então não depende de CORS.

## Motivo técnico

`helmet`/`cors` são as libs padrão do ecossistema Express para isso; escrever à
mão headers de segurança e negociação CORS seria reinventar (e errar detalhes).

## Impactos positivos

- Defesa em profundidade via headers padrão.
- Política de CORS explícita e restritiva por default (allowlist, não `*`).

## Testes executados

- **Typecheck**: ✅ · **Testes** (`npm test`): ✅ 17/17 · **Build**: ✅

## Resultado dos testes

✅ Passou (wiring de middleware; validação por typecheck/build).

## Observações

- Configure `CORS_ORIGIN` com o domínio do frontend em produção.
- A CSP default do `helmet` não afeta o dashboard do CLI (arquivo estático
  servido fora deste Express); a API só devolve JSON.
