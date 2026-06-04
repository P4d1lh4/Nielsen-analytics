import { z } from "zod";

/**
 * Strict schema for the YAML audit configuration.
 *
 * The `flow` is a discriminated union keyed on `action`, so Zod validates the
 * exact shape required by each interaction type and produces precise errors.
 */

const gotoAction = z
  .object({
    action: z.literal("goto"),
    url: z.string().url("`url` must be a valid absolute URL"),
  })
  .strict();

const clickAction = z
  .object({
    action: z.literal("click"),
    selector: z.string().min(1, "`selector` must not be empty"),
  })
  .strict();

const typeAction = z
  .object({
    action: z.literal("type"),
    selector: z.string().min(1, "`selector` must not be empty"),
    text: z.string(),
  })
  .strict();

const waitAction = z
  .object({
    action: z.literal("wait"),
    ms: z
      .number()
      .int("`ms` must be an integer")
      .positive("`ms` must be greater than 0"),
  })
  .strict();

export const flowActionSchema = z.discriminatedUnion("action", [
  gotoAction,
  clickAction,
  typeAction,
  waitAction,
]);

export const configSchema = z
  .object({
    target_url: z.string().url("`target_url` must be a valid absolute URL"),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    flow: z.array(flowActionSchema).min(1, "`flow` must contain at least one action"),
  })
  .strict();

export type AuditConfig = z.infer<typeof configSchema>;
export type FlowAction = z.infer<typeof flowActionSchema>;
