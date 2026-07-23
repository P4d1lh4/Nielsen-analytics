# 00 — Estado Atual do Projeto (ponto de partida)

> Documento base do processo de melhorias. Resume a situação do repositório
> **antes** de qualquer alteração, com base na auditoria técnica completa.
> Data de referência: 2026-07-01.

## Resumo da arquitetura atual

`ux-audit` é um Micro-SaaS de **auditoria heurística de UX** (Nielsen + WCAG 2.1)
com duas frentes que compartilham o mesmo núcleo de domínio:

- **CLI local** (`ux-audit`): `run` → `analyze` → `report` → `pipeline`.
  Dirige o Playwright, captura artefatos por passo e avalia com um LLM
  multimodal, gerando `dashboard.html` estático.
- **Serviço assíncrono**: `server` (Express) enfileira jobs numa fila
  **BullMQ/Redis**; o `worker` executa captura + análise, faz upload de
  screenshots para **S3/MinIO** e persiste o relatório em **Postgres via
  Prisma**. Autenticação por **Clerk**; webhook Clerk verificado com **svix**.
- **Client**: SPA React 19/Vite/Tailwind de 3 telas (form → polling → dashboard).

Fluxo do serviço: `POST /api/audit` → fila → worker (Playwright → LLM → S3 →
Postgres) → `GET /api/audit/:id` faz polling do estado (BullMQ) e do resultado
(Prisma).

## Estrutura do projeto

```
src/
  cli.ts                  # comandos run/analyze/report/pipeline (Commander)
  index.ts, logger.ts
  config/{schema,loader}   # Zod: flow (goto|click|type|wait|scroll) + YAML loader
  engine/{browser,actions} # AuditEngine (Playwright)
  capture/{artifacts,domCleaner}
  output/{paths,manifest}
  evaluator/*              # análise LLM (2 engines: api | agent-sdk), Strategy
  dashboard/generator.ts   # dashboard.html self-contained
  service/                 # server, worker, queue, connection, schema, storage
prisma/                    # schema + 2 migrations
client/                    # React 19 + Vite + Tailwind (SPA)
Dockerfile, docker-compose.yml
docs/                      # (novo) auditoria + alterações
```

## Principais tecnologias

TypeScript (strict), Node ≥18 (dev em Node 22), Express 4, BullMQ + ioredis,
Prisma 6 / Postgres, Clerk (`@clerk/express`) + svix, AWS SDK S3 / MinIO,
Playwright, `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk`, Zod.
Client: React 19, Vite, Tailwind 3, Axios.

## Pontos fortes (da auditoria)

- **Strategy pattern** limpo para trocar engine LLM (`StepAnalyzer`).
- Núcleo de domínio reutilizado entre CLI e serviço (`AuditEngine`, schemas Zod).
- **Isolamento multi-tenant (anti-IDOR)**: job de outro usuário retorna 404.
- **Webhook Clerk** verificado com svix e raw body (fail-closed).
- **Persistência idempotente e transacional** no worker.
- **Dashboard HTML à prova de XSS** (textContent + escape de `<`).
- **Polling do client sem memory leak**; export CSV bem feito (RFC 4180/BOM).
- **Dockerfile multi-stage** correto para Playwright.
- Tipagem forte (`strict`, `noUncheckedIndexedAccess`).

## Pontos fracos (da auditoria) — resumo

**Críticos:** SSRF (target_url do usuário navegado sem allowlist); bucket
S3/MinIO público com chaves enumeráveis; client nunca autentica (401 garantido
em produção); migration `user_id NOT NULL` sem backfill (quebra deploy).

**Altos:** sem testes; sem CI/CD; fila sem retry/backoff; sem rate limiting;
FKs sem índice; logger não estruturado; sem métricas/observabilidade;
duplicação da orquestração CLI×worker; endpoint de histórico órfão no client;
acessibilidade ~ausente; README não documenta o serviço.

**Médios/Baixos:** sem graceful shutdown no server; sem paginação no histórico;
sem helmet/CORS; Docker roda como root, sem HEALTHCHECK/volumes; sem
`.env.example`/validação de env no boot; backend sem ESLint; drift de tipos
client/server (`scroll`); sem versionamento/OpenAPI; deps não usados; divergência
zod/TS entre root e client.

## Notas por dimensão (0–10)

| Dimensão | Nota | Dimensão | Nota |
|---|---:|---|---:|
| Arquitetura | 7,0 | Performance | 5,5 |
| Organização | 5,5 | Docker | 6,0 |
| Frontend | 3,8 | DevOps | 2,0 |
| Backend | 6,2 | Testabilidade | 2,5 |
| Banco de Dados | 4,5 | Documentação | 5,0 |
| APIs | 4,5 | Escalabilidade | 5,0 |
| Segurança | 3,5 | Manutenibilidade | 6,0 |
| Qualidade de Código | 7,2 | **Geral** | **5,2** |

Veredito: **fundação sólida, acabamento de produção ausente** — MVP/Beta bem
escrito, longe de produção comercial por segurança + processo (testes/CI).

## Riscos conhecidos do processo de melhoria

- **Sem rede de testes:** qualquer refatoração hoje é validada só manualmente.
  → Primeira melhoria estabelece o harness de testes (dependência de todas as
  demais).
- **Migration já aplicada:** reescrever a migration `add_user_id` num banco que
  já a aplicou exige cuidado (não editar migration histórica aplicada; criar
  nova ou documentar o procedimento de recriação).
- **Client sem deps instaladas** neste ambiente: melhorias no `client/` exigem
  `npm install` no `client/` antes de build/lint/test.
- **Segredos reais em `.env`** (não versionado): não commitar; usar
  `.env.example`.
- **Créditos de LLM/Playwright:** mudanças no worker devem ser testadas sem
  disparar jobs reais caros (usar mocks / funções puras).

## Backlog e dependências

Ver [`01-backlog.md`](01-backlog.md) para a lista completa priorizada, agrupada
por categoria, com dependências entre itens. O progresso de execução é rastreado
em [`../alteracoes/INDEX.md`](../alteracoes/INDEX.md).
