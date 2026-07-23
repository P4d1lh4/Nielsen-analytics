# 04 — Integração Clerk no client (SEC-3)

## Problema identificado

O client nunca autenticava as chamadas HTTP: sem `@clerk/clerk-react`, sem
`ClerkProvider`, sem token no Axios. Como o backend exige `getAuth().userId` em
toda rota, **toda chamada retornava 401** em produção — o produto era inutilizável
multiusuário. Auditoria: Segurança/Frontend, **Crítica**.

## Objetivo

Autenticar o client via Clerk e anexar o token às requisições.

## Arquivos alterados

- `client/src/main.tsx` — `ClerkProvider` + gate `SignedIn`/`SignedOut` (tela de login).
- `client/src/api/client.ts` — interceptor Axios que anexa `Authorization: Bearer <token>`.
- `client/src/vite-env.d.ts` — **novo**: tipa `import.meta.env` (`vite/client`).
- `client/.env.example` — **novo**: `VITE_CLERK_PUBLISHABLE_KEY`.
- `client/.gitignore` — ignora `.env`/`.env.*` (mantém `.env.example`).
- `client/package.json` — dependência `@clerk/clerk-react`.
- `.github/workflows/ci.yml` — novo job `client` (npm ci + build).

## Alterações realizadas

- `ClerkProvider` lê `VITE_CLERK_PUBLISHABLE_KEY` (lança claro se ausente). O app
  de auditoria só renderiza dentro de `<SignedIn>`; `<SignedOut>` mostra um botão
  "Entrar" (modal).
- O interceptor usa `window.Clerk.session.getToken()` (Clerk popula o global após
  montar). Como as requisições só partem de dentro de `<SignedIn>`, há sessão
  quando o token é buscado.

## Motivo técnico

Padrão oficial do Clerk para SPA. O interceptor via `window.Clerk` evita fiar o
`getToken` por props/contexto pela árvore React — mais simples e suficiente.

## Impactos positivos

- Client agora autentica: as rotas do backend param de dar 401.
- Desbloqueia o fluxo multiusuário (histórico por `user_id`, etc.).
- CI passa a cobrir o build do client.

## Testes executados

- **Build do client** (`npm --prefix client run build` = `tsc -b && vite build`): ✅
  (bundle 245→317 kB, esperado pelo Clerk).
- **Backend** (`npm test`): ✅ 19/19 (inalterado).

## Resultado dos testes

✅ Passou (compilação/build).

## Observações

- **Runtime pendente (você):** criar `client/.env` com uma
  `VITE_CLERK_PUBLISHABLE_KEY` real e garantir as `CLERK_SECRET_KEY`/instância
  correspondentes no backend. Sem a chave, o app builda mas lança em runtime
  (comportamento intencional, fail-fast). Fluxo end-to-end (login → token → 200)
  precisa ser testado com o backend no ar.
- `pk_` (publishable) é uma chave de frontend, embutida no bundle por design.
- 1 vulnerabilidade "high" reportada por `npm audit` no client (deps transitivas)
  — avaliar num item de dependências (DEP-1).
