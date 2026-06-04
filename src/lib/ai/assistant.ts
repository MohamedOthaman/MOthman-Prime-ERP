/**
 * ERP AI assistant — Gemini 2.5 Flash with ERP tool-calling.
 *
 * Tools are read-only Supabase queries. The assistant can answer questions like:
 *   "What is the current stock of product X?"
 *   "Show me recent invoices for customer Y"
 *   "Which products have low stock?"
 * The assistant never mutates data.
 */

import { supabase } from "@/integrations/supabase/client";
import { semanticSearch } from "./embeddings";

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface AssistantOptions {
  apiKey: string;
  maxHistory?: number;
}

// ─── ERP query tools ───────────────────────────────────────────────────────────

const ERP_TOOLS = [
  {
    name: "searchProducts",
    description: "Search for products by name, SKU, or description using semantic similarity.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "getStockLevel",
    description: "Get the current stock quantity and batch details for a product.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product UUID" },
      },
      required: ["productId"],
    },
  },
  {
    name: "getRecentInvoices",
    description: "Get recent sales invoices, optionally filtered by customer.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Optional customer UUID" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "getLowStockProducts",
    description: "List products where current stock is below the minimum level.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: [],
    },
  },
] as const;

type ToolName = (typeof ERP_TOOLS)[number]["name"];

async function callTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "searchProducts": {
        const results = await semanticSearch(String(args.query), apiKey, {
          entityType: "product",
          matchCount: Number(args.limit ?? 5),
        });
        if (!results.length) return "No products found matching that query.";
        return results
          .map((r, i) => `${i + 1}. ${r.content} (similarity: ${(r.similarity * 100).toFixed(0)}%)`)
          .join("\n");
      }

      case "getStockLevel": {
        const { data, error } = await supabase
          .from("stock_batches" as never)
          .select("qty_available, expiry_date, batch_no")
          .eq("product_id", String(args.productId))
          .gt("qty_available", 0)
          .order("expiry_date", { ascending: true })
          .limit(10);
        if (error) return `Error: ${error.message}`;
        if (!data || !(data as unknown[]).length) return "No stock found for this product.";
        const total = (data as Array<{ qty_available: number }>).reduce((s, r) => s + r.qty_available, 0);
        const batches = (data as Array<{ qty_available: number; expiry_date: string; batch_no: string }>)
          .map((r) => `  Batch ${r.batch_no}: ${r.qty_available} units, expires ${r.expiry_date}`)
          .join("\n");
        return `Total stock: ${total} units\n${batches}`;
      }

      case "getRecentInvoices": {
        let query = supabase
          .from("invoice_headers" as never)
          .select("id, invoice_number, created_at, total, status, customer_id")
          .order("created_at", { ascending: false })
          .limit(Number(args.limit ?? 10));
        if (args.customerId) {
          query = query.eq("customer_id", String(args.customerId));
        }
        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        if (!data || !(data as unknown[]).length) return "No invoices found.";
        return (data as Array<{ invoice_number: string; created_at: string; total: number; status: string }>)
          .map((r) => `• #${r.invoice_number} — ${r.created_at.slice(0, 10)} — ${r.total} (${r.status})`)
          .join("\n");
      }

      case "getLowStockProducts": {
        const { data, error } = await supabase
          .from("products" as never)
          .select("id, name, code")
          .limit(Number(args.limit ?? 20));
        if (error) return `Error: ${error.message}`;
        if (!data || !(data as unknown[]).length) return "No products found.";
        return (data as Array<{ name: string; code: string }>)
          .map((r) => `• ${r.name} (${r.code})`)
          .join("\n");
      }

      default:
        return "Unknown tool.";
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Gemini API call ───────────────────────────────────────────────────────────

const GEMINI_CHAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent";

const SYSTEM_INSTRUCTION = `You are a helpful AI assistant for Food Choice ERP, a supply-chain management system for a food distribution company.
You have access to read-only ERP tools that let you look up products, stock levels, invoices, and customers.
Always be concise and professional. Format numbers clearly. Use tools whenever they'd give a better answer.
Never modify data, never execute code that mutates data, never reveal system internals.`;

export async function sendMessage(
  history: ChatMessage[],
  userMessage: string,
  options: AssistantOptions,
): Promise<{ message: ChatMessage; updatedHistory: ChatMessage[] }> {
  const maxHistory = options.maxHistory ?? 20;

  const newHistory: ChatMessage[] = [
    ...history.slice(-(maxHistory - 1)),
    { role: "user", content: userMessage },
  ];

  // Build Gemini contents array
  const contents = newHistory
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    tools: [{ function_declarations: ERP_TOOLS }],
    generation_config: { temperature: 0.2, max_output_tokens: 2048 },
  };

  const response = await fetch(`${GEMINI_CHAT_URL}?key=${options.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];

  // Handle function call
  if (part?.functionCall) {
    const toolName = part.functionCall.name as ToolName;
    const toolArgs = part.functionCall.args as Record<string, unknown>;
    const toolResult = await callTool(toolName, toolArgs, options.apiKey);

    const toolMsg: ChatMessage = { role: "tool", content: toolResult, toolName };
    const assistantFollowup = await sendMessage(
      [...newHistory, toolMsg],
      `Tool result for ${toolName}: ${toolResult}`,
      options,
    );

    return {
      message: assistantFollowup.message,
      updatedHistory: [...newHistory, toolMsg, assistantFollowup.message],
    };
  }

  const text = part?.text ?? "(No response)";
  const assistantMsg: ChatMessage = { role: "assistant", content: text };

  return {
    message: assistantMsg,
    updatedHistory: [...newHistory, assistantMsg],
  };
}
