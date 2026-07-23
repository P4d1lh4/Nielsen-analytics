# 03 — Bucket privado + URLs assinadas (SEC-2)

## Problema identificado

O bucket S3/MinIO era tornado público (`mc anonymous set download`) e o
`storage.ts` gravava uma URL pública permanente no banco. As chaves seguem um
padrão previsível (`reports/job_<id>/step_NN.png`), então screenshots de páginas
auditadas — potencialmente com PII de terceiros — ficavam legíveis por qualquer
um que adivinhasse a URL. Auditoria: Segurança, Crítica.

## Objetivo

Manter o bucket privado e servir as screenshots apenas via **URLs assinadas de
curta duração** (presigned GET), geradas no momento em que o relatório é
devolvido ao usuário autenticado.

## Arquivos alterados

- `src/service/storage.ts` — reescrito: `uploadScreenshot` retorna a **key**;
  novo `presign(key)`/`presignScreenshot`/`presignReportScreenshots`; removido
  `publicUrl`. Cliente de assinatura separado opcional (`S3_PUBLIC_ENDPOINT`).
- `src/service/server.ts` — as duas respostas de relatório (`GET /api/audit/:id`,
  ramo completed e ramo de fallback pós-eviction) agora chamam
  `presignReportScreenshots(report.steps)` antes de responder.
- `docker-compose.yml` — removida a policy anônima do bucket; `S3_PUBLIC_URL`
  substituída por `S3_PUBLIC_ENDPOINT` (usado só para assinar).
- `src/service/storage.test.ts` — **novo**: testa a transformação key → URL.
- `package.json` — nova dependência `@aws-sdk/s3-request-presigner`.

## Alterações realizadas

- O banco passa a guardar a **key** do objeto (coluna `screenshot_url` mantém o
  nome; agora contém uma key). A API continua devolvendo uma **URL** ao client
  (presigned, fresca a cada leitura), então o contrato do client não muda.
- `presign` usa `getSignedUrl` (TTL 3600s).
- Split-horizon do MinIO local: o worker faz upload pelo endpoint interno
  (`minio:9000`), mas o browser precisa carregar a URL a partir do host. Por
  isso um segundo client (`signer`) assina contra `S3_PUBLIC_ENDPOINT`
  (`http://localhost:9000`) quando definido. Em produção (S3/Supabase reais),
  a variável fica vazia e assina contra o próprio endpoint público.

## Motivo técnico

Presigned URLs são o padrão para servir objetos privados sem proxiar o binário
pela API (o `<img src>` do client carrega direto, sem header de auth). Usa o
presigner oficial do AWS SDK — assinar SigV4 à mão seria um viveiro de bugs.

## Impactos positivos

- Screenshots deixam de ser públicas/enumeráveis; acesso só via URL assinada
  temporária, emitida a quem já é dono do relatório (auth + filtro por user_id).
- Sem mudança no client.
- Remove config morta (`publicUrl`, `S3_PUBLIC_URL`).

## Testes executados

- **Typecheck** (`npm run typecheck`): ✅ sem erros.
- **Testes unitários** (`npm test`): ✅ 12/12 (inclui a transformação key→URL e
  o caso de steps vazio, com função de assinatura injetada — offline).
- **Build** (`npm run build`): ✅ exit 0.
- **Grep**: nenhuma referência remanescente a `publicUrl`/`S3_PUBLIC_URL` em `src/`. ✅

## Resultado dos testes

✅ Passou.

## Observações

- Não foi possível testar a **geração real** de presigned URL neste ambiente
  (sem S3/MinIO em execução); a lógica de assinatura é um wrapper fino sobre o
  presigner oficial, e a transformação (parte com lógica própria) está coberta.
  Recomenda-se um teste de integração com MinIO quando o docker-compose subir.
- Dados legados (linhas antigas com URL pública completa em `screenshot_url`)
  seriam re-assinados como se fossem key e quebrariam. Como o produto é novo
  (poucos jobs), não há migração de dados aqui; se necessário, tratar keys
  legadas por prefixo `http` no `presign`.
- **TTL 3600s** é o default; ajustável por constante em `storage.ts`.
