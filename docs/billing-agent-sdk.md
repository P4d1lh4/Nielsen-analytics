# Cobrar do plano Claude Code em vez da API key (pay-per-token)

> Prompt / runbook para rotear as chamadas de LLM pelo **Claude Agent SDK** (`query()`),
> de forma que o consumo seja debitado da **assinatura do Claude Code** e **não** da API paga por token.

## Objetivo

Rotear todas as chamadas de LLM do app pelo **Claude Agent SDK** (`query()`), de
forma que o consumo seja debitado da **assinatura do Claude Code** (login local /
crédito do plano) e **NÃO** da API paga por token. A chave de API deve ser apenas
um fallback opcional, nunca o caminho padrão.

## Princípio-chave (por que funciona)

- O pacote `@anthropic-ai/sdk` (cliente `Anthropic`, `client.messages...`) exige
  `ANTHROPIC_API_KEY` e cobra **por token na API**.
- O pacote `@anthropic-ai/claude-agent-sdk` (função `query()`) autentica usando as
  **credenciais do Claude Code logado na máquina** (OAuth do `claude login`), então
  o uso sai do **plano/assinatura** — desde que NÃO exista uma API key no ambiente
  que o SDK pegaria sozinho.
- **TRUQUE CENTRAL:** o Agent SDK lê `ANTHROPIC_API_KEY` automaticamente do ambiente.
  Se essa variável existir, ele volta a cobrar por token. Por isso a chave de API
  do app é lida de uma variável com **nome diferente** (`AI_API_KEY`), deixando
  `ANTHROPIC_API_KEY` sempre vazia → o `query()` cai no login do Claude Code.

## Passos

### 1. Instalar o Agent SDK

Manter o `@anthropic-ai/sdk` só para o engine "api" opcional:

```bash
npm i @anthropic-ai/claude-agent-sdk
```

### 2. Garantir o login e o ambiente limpo

Garantir que a máquina/servidor está logada no Claude Code (`claude login`) e que
`ANTHROPIC_API_KEY` **não** está setada no ambiente onde o worker/serviço roda.
Qualquer chave de API deve usar o nome `AI_API_KEY` (não o nome padrão).

### 3. Criar um engine baseado em `query()`

Crie um "engine" baseado em `query()` que implemente a MESMA interface do engine
da API, para serem intercambiáveis. Esqueleto:

```ts
import { query, type SDKUserMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

// monta a mensagem do usuário como um stream (MessageParam padrão: role + content)
const userMessage: SDKUserMessage = {
  type: "user",
  message: { role: "user", content },   // content = texto + imagem/screenshot inline
  parent_tool_use_id: null,
};
async function* promptStream() { yield userMessage; }

const q = query({
  prompt: promptStream(),
  options: {
    model,                                   // ex.: "claude-sonnet-4-6"
    systemPrompt: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    effort: "high",
    outputFormat: { type: "json_schema", schema: JSON_SCHEMA }, // saída estruturada
    tools: [],          // nada inline precisa de ferramentas → 0 ferramentas
    maxTurns: 8,        // folga: adaptive thinking + format podem passar de 1 turno
    cwd: workDir,
  },
});

// consumir o iterável até a mensagem de resultado
let result: SDKResultMessage | undefined;
try {
  for await (const m of q) { if (m.type === "result") { result = m; break; } }
} finally { q.close(); }

// validar: result?.subtype === "success" e result.structured_output != null
// depois validar structured_output contra o schema (zod) antes de usar.
```

### 4. Saída estruturada

O Agent SDK NÃO tem `messages.parse`. Em vez de `output_config.format`, use
`options.outputFormat = { type: "json_schema", schema }` e leia o resultado em
`result.structured_output` (depois valide com zod). O JSON Schema cru pode ser
reaproveitado do zod: `zodOutputFormat(meuSchema).schema`.

### 5. Seleção de engine por variável de ambiente

Com `agent-sdk` como **padrão**:

```ts
const ENGINE = (process.env.AUDIT_ENGINE ?? "agent-sdk") === "api" ? "api" : "agent-sdk";
const analyzer = ENGINE === "agent-sdk"
  ? new AgentSdkEvaluator(dir, MODEL)            // plano (query)
  : new Evaluator(createClient(), dir, MODEL);   // API paga (só se pedido)
```

### 6. Cliente de API lê de `AI_API_KEY`

O cliente de API (engine "api") deve ler a chave de `AI_API_KEY`, e falhar com
erro claro se faltar — nunca de `ANTHROPIC_API_KEY`:

```ts
const apiKey = process.env.AI_API_KEY;
if (!apiKey) throw new MissingApiKeyError(); // "set AI_API_KEY..."
return new Anthropic({ apiKey });
```

### 7. Modelo padrão = Sonnet

Modelo padrão = **Sonnet** (`claude-sonnet-4-6`), não Opus: roda no plano e puxa
da cota "Weekly Sonnet", separada do limite semanal geral. Permitir override por
`--model` / `AUDIT_MODEL`.

## Verificação / cuidados

- Confirme no ambiente de execução: `echo $ANTHROPIC_API_KEY` deve estar VAZIO.
  Se estiver setada, o Agent SDK vai cobrar por token mesmo usando `query()`.
- Logue o engine/modelo escolhidos no início de cada job (ex.: `[engine: agent-sdk,
  model: claude-sonnet-4-6]`) para auditar de onde o consumo está saindo.
- Mantenha o engine "api" como fallback opcional (`AUDIT_ENGINE=api`), útil para CI/
  servidores sem login do Claude Code, mas ele consome a API paga.

## Onde isso vive neste projeto

| Peça | Arquivo |
| --- | --- |
| Engine via `query()` → plano | [src/evaluator/agentEngine.ts](../src/evaluator/agentEngine.ts) |
| Chave em `AI_API_KEY` (não `ANTHROPIC_API_KEY`) | [src/evaluator/client.ts](../src/evaluator/client.ts) |
| Default `agent-sdk` no worker | [src/service/worker.ts](../src/service/worker.ts) |
| Sonnet por padrão | [src/evaluator/evaluator.ts](../src/evaluator/evaluator.ts) |
