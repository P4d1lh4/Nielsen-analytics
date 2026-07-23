# 02 — Bloqueio de SSRF antes de navegar (SEC-1)

## Problema identificado

O `target_url` da auditoria (e cada ação `goto` do flow) era passado direto ao
Playwright (`page.goto`) sem verificação de host. Qualquer usuário autenticado
podia apontar para `http://localhost`, rede interna (`10/172.16/192.168`),
`http://minio:9000` ou o endpoint de metadata de cloud
`http://169.254.169.254/...` e receber de volta screenshot + DOM — SSRF crítico
(risco de exfiltração de credenciais IAM). Auditoria: Segurança, Crítica.

## Objetivo

Bloquear navegação para endereços não-públicos em **todos** os pontos de
navegação, no serviço e na CLI.

## Arquivos alterados

- `src/engine/urlGuard.ts` — **novo**: `assertPublicUrl(url)`, `isPrivateIp(ip)`, `BlockedUrlError`.
- `src/engine/browser.ts` — chama `assertPublicUrl` antes do `goto` inicial.
- `src/engine/actions.ts` — chama `assertPublicUrl` antes do `goto` de cada passo do flow.
- `src/engine/urlGuard.test.ts` — **novo**: testes do guard.

## Alterações realizadas

- `assertPublicUrl`: valida esquema (`http`/`https` apenas), resolve o host via
  `node:dns` (`lookup({all:true})`) e rejeita se **qualquer** IP resolvido for
  privado/loopback/link-local/ULA/CGNAT/unspecified.
- `isPrivateIp`: cobre IPv4 (`0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`,
  `192.168/16`, `100.64/10`), IPv6 (`::1`, `::`, `fe80::/10`, `fc00::/7`) e
  IPv4-mapped (`::ffff:a.b.c.d`). Input malformado → tratado como inseguro
  (fail-closed). Formas ofuscadas (decimal/hex) são normalizadas pelo parser
  WHATWG `URL` antes da checagem.
- Aplicado nos **dois** sinks de navegação (inicial + `goto` do flow), pois cada
  `goto` do usuário é igualmente explorável.

## Motivo técnico

A checagem fica no **egresso** (engine), o ponto por onde toda navegação passa —
cobre serviço e CLI com um único guard, sem depender de validação no boundary da
API. Usa `node:dns` da stdlib; **zero dependências novas**.

## Impactos positivos

- Fecha o vetor de SSRF para rede interna e metadata de cloud.
- Um único ponto de política reutilizável (`urlGuard.ts`).
- Comportamento gracioso: URL bloqueada faz o job falhar com mensagem clara
  (`BlockedUrlError`), sem navegar.

## Testes executados

- **Typecheck** (`npm run typecheck`): ✅ sem erros.
- **Testes unitários** (`npm test`): ✅ 10/10 (4 de schema + 6 do guard),
  incluindo bloqueio de `169.254.169.254`, `127.0.0.1`, `[::1]`, decimal
  `2130706433`, esquemas não-http, e liberação de IP público (`8.8.8.8`).
- **Build** (`npm run build`): ✅ exit 0.

## Resultado dos testes

✅ Passou.

## Observações

- **Teto conhecido (ponytail):** resíduo de **DNS-rebinding** — o host pode
  re-resolver para um IP privado entre a checagem e o lookup do próprio Chromium.
  Upgrade path: interceptar no nível de request do Chromium (`page.route`) ou
  rotear o worker por um proxy de egresso que aplique a mesma política.
  Mitigação adicional recomendada: rodar o worker numa rede sem rota para a
  infraestrutura interna.
- Melhoria futura opcional: rejeitar também no `POST /api/audit` para dar 400
  imediato (melhor UX), mas a checagem de egresso é a autoritativa de segurança.
