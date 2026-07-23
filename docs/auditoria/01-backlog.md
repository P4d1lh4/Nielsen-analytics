# 01 — Backlog de Melhorias (priorizado)

Derivado da auditoria. Agrupado por categoria e ordenado por prioridade.
IDs são estáveis; a execução segue a **ordem de execução** da última coluna.
Cada item concluído ganha um documento em `../alteracoes/NN-*.md` e é rastreado
em [`../alteracoes/INDEX.md`](../alteracoes/INDEX.md).

Prioridades: **Crítica** > **Alta** > **Média** > **Baixa**.

## Ordem de execução

| Ordem | ID | Melhoria | Categoria | Prioridade | Depende de |
|---:|---|---|---|---|---|
| 01 | TEST-1 | Harness de testes (`node:test`+tsx) + `typecheck` + CI mínimo | Testes/DevOps | Alta (enabler) | — |
| 02 | SEC-1 | SSRF: bloquear IPs privados/loopback/metadata antes do `goto` | Segurança | **Crítica** | 01 |
| 03 | SEC-2 | Storage privado + URLs assinadas (remover bucket público) | Segurança | **Crítica** | 01 |
| 04 | SEC-3 | Client: integração real com Clerk (auth nas chamadas) | Segurança/Frontend | **Crítica** | 01 |
| 05 | DB-1 | Migration `user_id` segura (expand-contract) | Banco | **Crítica** | 01 |
| 06 | SEC-4 | Rate limiting por usuário no `POST /api/audit` | Segurança | Alta | 01 |
| 07 | BE-1 | Fila com retry/backoff exponencial | Backend | Alta | 01 |
| 08 | DB-2 | Índices de FK (`report_id`, `step_id`) + `[user_id, created_at]` | Banco | Alta | 01 |
| 09 | OBS-1 | Logger estruturado (JSON) com correlação de `job_id` | Observabilidade | Alta | 01 |
| 10 | OBS-2 | `/health` completo (Postgres/S3) + healthchecks + métricas básicas | Observabilidade | Alta | 01 |
| 11 | ARCH-1 | Extrair pipeline compartilhado CLI × worker | Arquitetura | Alta | 01 |
| 12 | BE-2 | Graceful shutdown do `server` | Backend | Média | 01 |
| 13 | API-1 | Paginação no histórico + tela de histórico no client | API/Frontend | Média | 04, 08 |
| 14 | SEC-5 | `helmet()` + CORS com allowlist | Segurança | Média | 01 |
| 15 | DOCK-1 | Dockerfile `USER` non-root + `HEALTHCHECK` + volumes no compose | Docker | Média | 01 |
| 16 | CFG-1 | `.env.example` + validação de env no boot (fail-fast) | Config | Média | 01 |
| 17 | CQ-1 | ESLint/Prettier no backend | Clean Code | Média | 01 |
| 18 | UX-1 | Acessibilidade no client (`aria-live`, `role="alert"`, landmarks) | UX | Média | 04 |
| 19 | CQ-2 | Tipos compartilhados client/server (corrige drift `scroll`) | Clean Code | Média | 01 |
| 20 | API-2 | Envelope de resposta/erro uniforme + `/api/v1` + idempotência | API | Baixa | 01 |
| 21 | CQ-3 | Limpeza: deps não usados, `App.css` morto, non-null assertions, round-trip de disco | Clean Code | Baixa | 01 |
| 22 | DEP-1 | Resolver divergência `zod`/TypeScript entre root e client | Dependências | Baixa | 01 |
| 23 | DOC-1 | Documentar o serviço no README + OpenAPI | Documentação | Média | — |

## Por categoria

- **Segurança:** SEC-1 (SSRF), SEC-2 (storage), SEC-3 (Clerk client), SEC-4 (rate limit), SEC-5 (helmet/CORS).
- **Banco de Dados:** DB-1 (migration), DB-2 (índices).
- **Backend/Serviço:** BE-1 (retry), BE-2 (shutdown), ARCH-1 (pipeline compartilhado).
- **API:** API-1 (paginação), API-2 (envelope/versionamento).
- **Observabilidade/DevOps:** OBS-1 (logger), OBS-2 (health/métricas), TEST-1 (harness/CI).
- **Docker:** DOCK-1.
- **Frontend/UX:** SEC-3, UX-1, API-1 (tela histórico).
- **Config:** CFG-1.
- **Clean Code/Refatoração:** CQ-1 (lint), CQ-2 (tipos), CQ-3 (limpeza).
- **Dependências:** DEP-1.
- **Documentação:** DOC-1.

## Dependências-chave

- **TEST-1 é pré-requisito** de tudo: o fluxo exige testar cada alteração, e sem
  harness a validação seria só manual. Por isso executa primeiro (não é "escolha
  aleatória": é a dependência raiz do processo).
- **SEC-3** (Clerk no client) precede UX-1 e API-1 (tela de histórico exige auth).
- **DB-2** (índices) precede API-1 (paginação eficiente).
- **DB-1** (migration) não deve editar migration já aplicada: criar nova migration
  ou documentar recriação — decidir no planejamento do item.
- Itens do `client/` exigem `npm install` em `client/` neste ambiente.

## Fora de escopo (categorias do template sem correspondência no repo)

- **Telegram / IA (bot)**: não há bot Telegram nem feature de IA além da análise
  já existente (avaliador LLM), que está coberta pelas melhorias acima.
