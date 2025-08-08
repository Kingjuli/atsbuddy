import OpenAI from "openai";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";

type JsonSchemaShape = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export class AIManager {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
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
      model = "gpt-5-nano",
      temperature = 1,
      maxOutputTokens = 900,
      requestId,
      metadata,
    } = params;

    const createParams: any = {
      model,
      service_tier: "flex",
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
      metadata: { ...(metadata || {}), requestId },
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

    const response = await this.client.responses.create(createParams);

    // Prefer native JSON parts when using json_schema formatting
    const anyResp: any = response as any;
    const outputs: any[] = anyResp.output || anyResp.response?.output || [];

    // Token usage and cost
    const usage = anyResp.usage || anyResp.response?.usage || {};
    const inputTokens: number | null = usage.input_tokens ?? usage.inputTokens ?? null;
    const cachedInputTokens: number | null = usage.cache_creation_input_tokens ?? usage.cached_input_tokens ?? usage.input_cached_tokens ?? null;
    const outputTokens: number | null = usage.output_tokens ?? usage.outputTokens ?? null;
    const totalTokens: number | null = usage.total_tokens ?? usage.totalTokens ?? (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null);
    const costUSD = estimateCostUSD({
      model,
      serviceTier: createParams.service_tier,
      inputTokens: inputTokens || 0,
      cachedInputTokens: cachedInputTokens || 0,
      outputTokens: outputTokens || 0,
    });
    const latencyMs = Date.now() - startedAt;
    const baseLog = {
      requestId,
      model: anyResp.model || anyResp.response?.model || model,
      responseId: anyResp.id || anyResp.response?.id || null,
      serviceTier: createParams.service_tier,
      latencyMs,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      costUSD,
    };
    for (const item of outputs) {
      const content = item?.content || [];
      for (const part of content) {
        if (part?.type === "output_json" && part?.json) {
          recordMetric({ timestamp: Date.now(), endpoint: (metadata as any)?.endpoint as string | undefined, requestId, model, serviceTier: createParams.service_tier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
          logger.info("AI response", { ...baseLog, hasOutputJson: true, textLength: 0 });
          return part.json;
        }
        if (part && typeof part.json === "object" && part.json) {
          recordMetric({ timestamp: Date.now(), endpoint: (metadata as any)?.endpoint as string | undefined, requestId, model, serviceTier: createParams.service_tier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
          logger.info("AI response", { ...baseLog, hasOutputJson: true, textLength: 0 });
          return part.json;
        }
      }
    }

    // Fallback: aggregate text and parse
    let textOut: string | undefined = anyResp.output_text;
    if (!textOut && outputs.length) {
      const pieces: string[] = [];
      for (const item of outputs) {
        const content = item?.content || [];
        for (const part of content) {
          if (typeof part?.text === "string") pieces.push(part.text);
        }
      }
      textOut = pieces.join("\n");
    }
    if (!textOut && anyResp.content?.[0]?.text) {
      textOut = anyResp.content[0].text;
    }
    const safeText = textOut ?? "{}";
    // Try direct parse
    try {
      const parsed = JSON.parse(safeText);
      recordMetric({ timestamp: Date.now(), endpoint: (metadata as any)?.endpoint as string | undefined, requestId, model, serviceTier: createParams.service_tier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
      logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
      return parsed;
    } catch {}
    // Try to extract first JSON object/array substring
    const extracted = extractJsonFromText(safeText);
    if (extracted) {
      recordMetric({ timestamp: Date.now(), endpoint: (metadata as any)?.endpoint as string | undefined, requestId, model, serviceTier: createParams.service_tier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
      logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
      return extracted;
    }
    // Final fallback: return as message
    recordMetric({ timestamp: Date.now(), endpoint: (metadata as any)?.endpoint as string | undefined, requestId, model, serviceTier: createParams.service_tier, inputTokens, cachedInputTokens, outputTokens, totalTokens, latencyMs, costUSD });
    logger.info("AI response", { ...baseLog, hasOutputJson: false, textLength: safeText.length });
    return { message: String(safeText) };
  }
}

function estimateCostUSD(params: { model: string; serviceTier?: string; inputTokens: number; cachedInputTokens: number; outputTokens: number }): number {
  const { model, serviceTier = "flex", inputTokens, cachedInputTokens, outputTokens } = params;
  const perMillion = pricingLookup(model, serviceTier);
  const cost = (inputTokens / 1_000_000) * perMillion.input + (cachedInputTokens / 1_000_000) * perMillion.cached + (outputTokens / 1_000_000) * perMillion.output;
  return Math.round(cost * 1e6) / 1e6;
}

function pricingLookup(model: string, tier: string): { input: number; cached: number; output: number } {
  const m = model.toLowerCase();
  const t = tier.toLowerCase();
  let input = 0.05, cached = 0.005, output = 0.4; // defaults to standard nano
  if (m.includes("gpt-5-nano")) {
    if (t === "standard") { input = 0.05; cached = 0.005; output = 0.4; }
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


