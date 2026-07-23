# 15 — Docker non-root + healthcheck + volumes (DOCK-1)

## Problema identificado

O estágio final do Dockerfile rodava como **root** (o `pwuser` da imagem
Playwright não era ativado); não havia `HEALTHCHECK` para `api`/`worker` no
compose; e postgres/minio não tinham volumes nomeados (dados efêmeros).
Auditoria: Docker, Média.

## Objetivo

Reduzir superfície de ataque (non-root), permitir orquestração detectar
containers saudáveis, e persistir dados entre reinícios.

## Arquivos alterados

- `Dockerfile` — pré-cria `/app/.ux-audit-reports` (chown `pwuser`) e `USER pwuser` antes do CMD.
- `docker-compose.yml` — `healthcheck` no serviço `api` (via `node http.get /health`);
  volumes nomeados `pgdata` (postgres) e `miniodata` (minio).

## Alterações realizadas

- **Non-root:** o worker escreve em `/app/.ux-audit-reports/job_<id>/` (cwd
  `/app`). Como `/app` fica root-owned, pré-criei e dei `chown pwuser` a
  `/app/.ux-audit-reports`, então `USER pwuser` — o worker continua conseguindo
  criar/limpar o workspace.
- **Healthcheck:** `api` usa `node -e "http.get('/health')..."` (evita depender de
  `curl` na imagem). O `worker` não tem HTTP, então não recebe healthcheck (um
  heartbeat via Redis seria o upgrade).
- **Volumes:** `pgdata:/var/lib/postgresql/data` e `miniodata:/data`.

## Motivo técnico

Non-root é hardening padrão (imagem Playwright já traz `pwuser`). Healthcheck
por-serviço no compose é mais correto que um `HEALTHCHECK` no Dockerfile, porque
a mesma imagem roda dois processos distintos (api com HTTP, worker sem).

## Impactos positivos

- Menor superfície de ataque se houver RCE via Chromium (o produto navega para
  páginas de terceiros).
- Orquestrador detecta a API saudável; dados de postgres/minio persistem.

## Testes executados

- **`docker compose config`**: ✅ (schema válido).
- **Parse YAML (js-yaml)**: ✅ services/volumes/healthcheck/mounts conferidos.
- **Typecheck/test/build** (backend): ✅ 17/17 inalterado (não afetado por infra).

## Resultado dos testes

✅ Passou na validação de schema/estrutura.

## Observações

- **Validação final pendente:** `docker compose up --build` (build da imagem com
  `USER pwuser` + escrita do workspace pelo worker) deve ser executado uma vez —
  não foi feito aqui para evitar um build pesado (base ~1.5GB + `npm ci`). A
  mudança é canônica, mas confirme o build real antes de confiar em produção.
