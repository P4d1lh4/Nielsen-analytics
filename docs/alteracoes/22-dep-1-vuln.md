# 22 — Vulnerabilidade do client + divergência de versões (DEP-1)

## Problema identificado

`npm audit` no client reportava 1 vulnerabilidade **high** (`form-data` 4.0.0–4.0.5,
CRLF injection — transitiva via axios). Além disso, há divergência de major entre
root (TypeScript 5.7, zod 3) e client (TypeScript 6, zod 4). Auditoria: Dependências.

## Objetivo

Eliminar a vulnerabilidade conhecida do client.

## Arquivos alterados

- `client/package-lock.json` — `npm audit fix` (bump de `form-data` para versão corrigida).

## Alterações realizadas

`npm --prefix client audit fix` → `form-data` atualizado; `npm audit` agora reporta
**0 vulnerabilidades**. Build do client segue passando.

## Motivo técnico

`audit fix` sem `--force` só aplica bumps compatíveis (patch da dep transitiva),
sem risco de breaking change. Confirmado por rebuild verde.

## Impactos positivos

- Zero vulnerabilidades conhecidas no client.

## Testes executados

- **`npm audit`** (client): ✅ 0 vulnerabilidades.
- **Build do client**: ✅.

## Resultado dos testes

✅ Passou.

## Observações

- **Não resolvido (deliberado):** a divergência de major TypeScript/zod entre root
  e client **não** foi forçada. Alinhar (subir root para TS6/zod4 ou baixar o
  client) é uma mudança arriscada sem ganho funcional imediato — e o root já
  contorna o peer do zod via subpath `zod/v4`. Fica documentado como débito a
  tratar quando houver necessidade (ex.: extrair pacote de tipos compartilhado).
- `npm audit fix` no **root** (1 low) não foi aplicado para não churnar o lockfile
  do backend sem necessidade; a `low` é de baixo risco.
