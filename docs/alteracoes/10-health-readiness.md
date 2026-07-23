# 10 — /health com readiness do Postgres (OBS-2, parcial)

## Problema identificado

`GET /health` só checava o Redis. Um Postgres fora do ar não aparecia no health,
mas as rotas que dependem dele (`/api/audit*`) falhavam — falso "saudável".
Auditoria: Observabilidade, Alta.

## Objetivo

Refletir a dependência crítica (Postgres) no health, com semântica de readiness.

## Arquivos alterados

- `src/service/server.ts` — `/health` agora faz `SELECT 1` no Postgres; retorna
  **503** quando o DB está inacessível, **200** caso contrário. Redis é reportado
  (não fatal — leituras funcionam sem a fila).

## Alterações realizadas

`{ status: "ok"|"degraded", db: "ready"|"down", redis: "ready"|"down" }` com
código HTTP coerente. O healthcheck do `api` no compose (DOCK-1) passa a refletir
a saúde real (DB incluído).

## Motivo técnico

O DB é a dependência sem a qual a API não serve; Redis afeta só enfileiramento.
Fazer o DB ser o determinante do 200/503 evita marcar como saudável uma instância
que não consegue responder requests.

## Impactos positivos

- Orquestrador detecta indisponibilidade real do DB.

## Testes executados

- **Typecheck / test / build**: ✅ 19/19.

## Resultado dos testes

✅ Passou (compilação; comportamento 200/503 precisa de runtime com/sem DB).

## Observações

- **Escopo parcial (ponytail):** só a parte de *readiness* de OBS-2. As
  **métricas Prometheus** (`prom-client` + `/metrics` + contadores de fila/latência)
  e o *tracing* ficam como follow-up maior — dependência nova + melhor validados
  com a stack no ar. Item mantido como parcial para não empilhar código não
  validável aqui.
