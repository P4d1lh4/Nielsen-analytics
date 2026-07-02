# INDEX — Controle de Progresso das Melhorias

Rastreia a execução do backlog ([`../auditoria/01-backlog.md`](../auditoria/01-backlog.md)).
Atualizado a cada melhoria. Status: `Não iniciada` · `Em andamento` ·
`Em revisão` · `Em testes` · `Concluída` · `Bloqueada`.

| Etapa | ID | Melhoria | Status | Testes | Documento |
|---:|---|---|---|---|---|
| 01 | TEST-1 | Harness de testes + typecheck + CI mínimo | Concluída | ✅ typecheck, test, build | [01-harness-testes.md](01-harness-testes.md) |
| 02 | SEC-1 | SSRF: bloqueio de host antes do `goto` | Concluída | ✅ typecheck, test 10/10, build | [02-ssrf.md](02-ssrf.md) |
| 03 | SEC-2 | Storage privado + URLs assinadas | Concluída | ✅ typecheck, test 12/12, build | [03-storage-privado.md](03-storage-privado.md) |
| 04 | SEC-3 | Client: integração Clerk | Concluída | ✅ client build; chave em runtime pendente | [04-client-clerk.md](04-client-clerk.md) |
| 05 | DB-1 | Migration `user_id` segura | Pendente (precisa DB) | — | — |
| 06 | SEC-4 | Rate limiting | Concluída | ✅ typecheck, test 19/19, build | [06-rate-limit.md](06-rate-limit.md) |
| 07 | BE-1 | Fila com retry/backoff | Concluída | ✅ typecheck, test 14/14, build | [07-fila-retry.md](07-fila-retry.md) |
| 08 | DB-2 | Índices de FK + composto | Concluída | ✅ prisma validate; aplicar migração pendente | [08-indices-db.md](08-indices-db.md) |
| 09 | OBS-1 | Logger estruturado | Concluída | ✅ typecheck, test 14/14, build | [09-logger-estruturado.md](09-logger-estruturado.md) |
| 10 | OBS-2 | `/health` readiness (métricas follow-up) | Parcial | ✅ typecheck/build | [10-health-readiness.md](10-health-readiness.md) |
| 11 | ARCH-1 | Pipeline compartilhado CLI×worker | Não iniciada (refactor, aguarda decisão) | — | — |
| 12 | BE-2 | Graceful shutdown do server | Concluída | ✅ typecheck, test 14/14, build | [12-graceful-shutdown.md](12-graceful-shutdown.md) |
| 13 | API-1 | Paginação + tela de histórico | Pendente (acopla client + precisa DB) | — | — |
| 14 | SEC-5 | helmet + CORS | Concluída | ✅ typecheck, test 17/17, build | [14-helmet-cors.md](14-helmet-cors.md) |
| 15 | DOCK-1 | Docker non-root + healthcheck + volumes | Concluída | ✅ compose config; build real pendente | [15-docker-hardening.md](15-docker-hardening.md) |
| 16 | CFG-1 | `.env.example` + validação de env | Concluída | ✅ typecheck, test 17/17, build | [16-env-example-validacao.md](16-env-example-validacao.md) |
| 17 | CQ-1 | ESLint/Prettier no backend | Não iniciada | — | — |
| 18 | UX-1 | Acessibilidade no client | Concluída | ✅ client build | [18-acessibilidade-client.md](18-acessibilidade-client.md) |
| 19 | CQ-2 | Tipos client/server (scroll) | Concluída | ✅ client build | [19-tipos-client-scroll.md](19-tipos-client-scroll.md) |
| 20 | API-2 | Envelope + versionamento + idempotência | Pendente (acopla client / precisa Redis) | — | — |
| 21 | CQ-3 | Limpeza backend (round-trip disco, asserts) | Concluída | ✅ typecheck, test 19/19, build | [21-cleanup-backend.md](21-cleanup-backend.md) |
| 22 | DEP-1 | Vuln client corrigida (divergência anotada) | Concluída | ✅ npm audit 0, build | [22-dep-1-vuln.md](22-dep-1-vuln.md) |
| 23 | DOC-1 | Documentar serviço no README (+OpenAPI pendente) | Concluída | ✅ revisão (docs) | [23-doc-servico.md](23-doc-servico.md) |
