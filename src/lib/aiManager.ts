import OpenAI from "openai";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";

type JsonSchemaShape = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class AIManager {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async createTextJsonResponse(params: {
    system: string;
    user: string;
    schema: JsonSchemaShape;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    const {
      system,
      user,
      schema,
      model = process.env.OPENAI_MODEL || "gpt-5-nano",
      temperature = 1,
      maxOutputTokens = 900,
      requestId,
      metadata,
    } = params;

    const envTier = (process.env.OPENAI_SERVICE_TIER || "").toLowerCase();
    const defaultTier: "flex" | "auto" | "priority" =
      envTier === "auto" || envTier === "standard"
        ? "auto"
        : envTier === "priority"
        ? "priority"
        : "flex";

    const createParams: Record<string, unknown> = {
      model,
      service_tier: defaultTier,
      input: [
        {
          role: "system",
          content: [
            { type: "input_text", text: system },
          ],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: user },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          schema: schema.schema,
          strict: schema.strict ?? true,
        },
      },
      max_output_tokens: maxOutputTokens,
      temperature,
      metadata: { ...(metadata || {}), requestId, project: "atsbuddy" },
    };

    const startedAt = Date.now();
    logger.info("AI request", {
      requestId,
      model,
      temperature,
      serviceTier: createParams.service_tier,
      maxOutputTokens,
      systemChars: system.length,
      userChars: user.length,
      schema: schema.name,
    });

    // Call with retry policy for 429 Resource Unavailable
    const { response, usedTier } = await callWithRetries(this.client, createParams, requestId, defaultTier);

    // Prefer native JSON parts when using json_schema formatting
    const resp = response as unknown;
    const respObj = isObject(resp) ? resp : {};
    const nestedResponse = isObject(respObj.response) ? (respObj.response as Record<string, unknown>) : undefined;
    const outputs: unknown[] = Array.isArray(respObj.output)
      ? (respObj.output as unknown[])
      : Array.isArray(nestedResponse?.output)
      ? (nestedResponse?.output as unknown[])
      : [];

    // Token usage and cost
    const usageRaw: unknown = (respObj as { usage?: unknown }).usage ?? (nestedResponse as { usage?: unknown })?.usage;
    const usage = isObject(usageRaw) ? usageRaw : {};
    const inputTokens: number | null = (usage.input_tokens as number | undefined) ?? (usage.inputTokens as number | undefined) ?? null;
    const cachedInputTokens: number | null =
      (usage.cache_creation_input_tokens as number | undefined) ??
      (usage.cached_input_tokens as number | undefined) ??
      (usage.input_cached_tokens as number | undefined) ??
      null;
    const outputTokens: number | null = (usage.output_tokens as number | undefined) ?? (usage.outputTokens as number | undefined) ?? null;
    const totalTokens: number | null =
      (usage.total_tokens as number | undefined) ??
      (usage.totalTokens as number | undefined) ??
      (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null);
    const costUSD = estimateCostUSD({
      model,
      serviceTier: usedTier,
      inputTokens: inputTokens || 0,
      cachedInputTokens: cachedInputTokens || 0,
      outputTokens: outputTokens || 0,
    });
    const latencyMs = Date.now() - startedAt;
    const baseLog = {
      requestId,
      model: (respObj.model as string | undefined) || (nestedResponse?.model as string | undefined) || model,
      responseId: (respObj.id as string | undefined) || (nestedResponse?.id as string | undefined) || null,
      serviceTier: usedTier,
      latencyMs,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      costUSD,
    };
    for (const item of outputs) {
      const content = isObject(item) && Array.isArray((item as Record<string, unknown>).content)
        ? ((item as Record<string, unknown>).content as unknown[])
        : [];
      for (const part of content) {
        if (isObject(part) && (part.type as string | undefined) === "output_json" && isObject(part.json)) {
          recordMetric({ timestamp: Date.now(), endpoint: (typeof metadata?.endpoint === 'string' ? metadata.endpoint : undefined), requestId, model, serviceTier: usedTier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
          logger.info("AI response", { ...baseLog, hasOutputJson: true, textLength: 0 });
          return part.json as unknown;
        }
        if (isObject(part) && isObject(part.json)) {
          recordMetric({ timestamp: Date.now(), endpoint: (typeof metadata?.endpoint === 'string' ? metadata.endpoint : undefined), requestId, model, serviceTier: usedTier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
          logger.info("AI response", { ...baseLog, hasOutputJson: true, textLength: 0 });
          return part.json as unknown;
        }
      }
    }

    // Fallback: aggregate text and parse
    let textOut: string | undefined = typeof (respObj as { output_text?: unknown }).output_text === 'string' ? (respObj as { output_text?: string }).output_text : undefined;
    if (!textOut && outputs.length) {
      const pieces: string[] = [];
      for (const item of outputs) {
        const content = isObject(item) && Array.isArray((item as Record<string, unknown>).content)
          ? ((item as Record<string, unknown>).content as unknown[])
          : [];
        for (const part of content) {
          if (isObject(part) && typeof (part as Record<string, unknown>).text === "string") pieces.push((part as Record<string, unknown>).text as string);
        }
      }
      textOut = pieces.join("\n");
    }
    const topContent = Array.isArray((respObj as { content?: unknown }).content) ? ((respObj as { content?: unknown[] }).content) : undefined;
    if (!textOut && topContent && isObject(topContent[0]) && typeof (topContent[0] as Record<string, unknown>).text === 'string') {
      textOut = (topContent[0] as Record<string, unknown>).text as string;
    }
    const safeText = textOut ?? "{}";
    // Try direct parse
    try {
      const parsed = JSON.parse(safeText);
      recordMetric({ timestamp: Date.now(), endpoint: (typeof metadata?.endpoint === 'string' ? metadata.endpoint : undefined), requestId, model, serviceTier: usedTier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
      logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
      return parsed;
    } catch {}
    // Try to extract first JSON object/array substring
    const extracted = extractJsonFromText(safeText);
    if (extracted) {
      recordMetric({ timestamp: Date.now(), endpoint: (typeof metadata?.endpoint === 'string' ? metadata.endpoint : undefined), requestId, model, serviceTier: usedTier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
      logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
      return extracted;
    }
    // Final fallback: return as message
    recordMetric({ timestamp: Date.now(), endpoint: (typeof metadata?.endpoint === 'string' ? metadata.endpoint : undefined), requestId, model, serviceTier: usedTier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
    logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
    return { message: String(safeText) };
  }
}

async function callWithRetries(
  client: OpenAI,
  baseParams: Record<string, unknown>,
  requestId?: string,
  preferredTier: "flex" | "auto" | "priority" = "flex",
): Promise<{ response: unknown; usedTier: string }> {
  const BASE_DELAY = 500;
  const MAX_FLEX_RETRIES = 3;
  const MAX_AUTO_RETRIES = 2;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const jitter = (ms: number) => ms + Math.floor(Math.random() * 250);
  const isResourceUnavailable = (err: unknown): boolean => {
    const anyErr = err as { status?: number; statusCode?: number; message?: string } | undefined;
    const status = (anyErr && (anyErr.status || anyErr.statusCode)) ?? 0;
    const msg = String(anyErr?.message || "").toLowerCase();
    return status === 429 || msg.includes("resource unavailable") || msg.includes("capacity");
  };

  // First pass: try preferred tier
  for (let attempt = 0; attempt < MAX_FLEX_RETRIES; attempt++) {
    try {
      const params: Record<string, unknown> = { ...baseParams, service_tier: preferredTier };
      const response = await client.responses.create(params as Parameters<typeof client.responses.create>[0]);
      return { response, usedTier: preferredTier };
    } catch (err: unknown) {
      if (isResourceUnavailable(err)) {
        const delay = jitter(BASE_DELAY * Math.pow(2, attempt));
        logger.warn(`AI retry (${preferredTier})`, { requestId, attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  // Escalate to the other tier (auto if preferred was flex/priority, otherwise flex)
  for (let attempt = 0; attempt < MAX_AUTO_RETRIES; attempt++) {
    try {
      const fallbackTier = preferredTier === "auto" ? "flex" : "auto";
      const params: Record<string, unknown> = { ...baseParams, service_tier: fallbackTier };
      const response = await client.responses.create(params as Parameters<typeof client.responses.create>[0]);
      return { response, usedTier: fallbackTier };
    } catch (err: unknown) {
      if (isResourceUnavailable(err)) {
        const delay = jitter(BASE_DELAY * Math.pow(2, attempt));
        logger.warn("AI retry (fallback)", { requestId, attempt: attempt + 1, delayMs: delay });
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new Error("Resource unavailable after retries");
}

function estimateCostUSD(params: { model: string; serviceTier?: string; inputTokens: number; cachedInputTokens: number; outputTokens: number }): number {
  const { model, serviceTier = "flex", inputTokens, cachedInputTokens, outputTokens } = params;
  const perMillion = pricingLookup(model, serviceTier);
  const cost = (inputTokens / 1_000_000) * perMillion.input + (cachedInputTokens / 1_000_000) * perMillion.cached + (outputTokens / 1_000_000) * perMillion.output;
  return Math.round(cost * 1e6) / 1e6;
}

function pricingLookup(model: string, tier: string): { input: number; cached: number; output: number } {
  const m = model.toLowerCase();
  let t = tier.toLowerCase();
  if (t === "auto") t = "standard"; // map auto to standard pricing
  let input = 0.05, cached = 0.005, output = 0.4; // defaults to standard nano
  if (m.includes("gpt-5-nano")) {
    if (t === "standard") { input = 0.05; cached = 0.005; output = 0.4; }
    else if (t === "priority") { input = 0.05 * 2; cached = 0.005 * 2; output = 0.4 * 2; } // no explicit nano priority table, approximate
    else { input = 0.025; cached = 0.0025; output = 0.2; } // flex/batch
  } else if (m.includes("gpt-5-mini")) {
    if (t === "priority") { input = 0.45; cached = 0.05; output = 3.6; }
    else if (t === "standard") { input = 0.25; cached = 0.025; output = 2.0; }
    else { input = 0.125; cached = 0.0125; output = 1.0; }
  } else if (m.includes("gpt-5")) {
    if (t === "priority") { input = 2.5; cached = 0.25; output = 20.0; }
    else if (t === "standard") { input = 1.25; cached = 0.125; output = 10.0; }
    else { input = 0.625; cached = 0.0625; output = 5.0; }
  }
  return { input, cached, output };
}

function extractJsonFromText(text: string): unknown | null {
  // Find first balanced JSON object or array
  const startIndices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') startIndices.push(i);
  }
  for (const start of startIndices) {
    const val = tryParseBalancedJson(text, start);
    if (val !== null) return val;
  }
  return null;
}

function tryParseBalancedJson(text: string, start: number): unknown | null {
  const open = text[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : '';
  if (!close) return null;
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    } else {
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const slice = text.slice(start, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}


