import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const invoiceTool = {
  type: "function",
  function: {
    name: "extract_invoices",
    description: "Extract structured invoice data from the transaction summary listing",
    parameters: {
      type: "object",
      properties: {
        invoices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              invoiceNo: { type: "string", description: "The Doc No number" },
              date: { type: "string", description: "Date in YYYY-MM-DD format (convert from DD/MM/YYYY)" },
              customerName: { type: "string", description: "Full customer name after the code and slash" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    itemCode: { type: "string" },
                    itemName: { type: "string" },
                    uom: { type: "string" },
                    qty: { type: "number" },
                  },
                  required: ["itemCode", "itemName", "uom", "qty"],
                  additionalProperties: false,
                },
              },
            },
            required: ["invoiceNo", "date", "customerName", "items"],
            additionalProperties: false,
          },
        },
      },
      required: ["invoices"],
      additionalProperties: false,
    },
  },
};

const skuTool = {
  type: "function",
  function: {
    name: "extract_sku",
    description: "Extract structured stock/SKU data from the stock report",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemCode: { type: "string" },
              itemName: { type: "string" },
              brand: { type: "string", description: "Brand name from 'Brand :' headers" },
              baseUom: { type: "string", description: "Base unit of measure (KG, CTN, PCS, etc.)" },
              totalStock: { type: "number" },
              batches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    expiryDate: { type: "string", description: "YYYY-MM-DD (convert from DD/MM/YYYY)" },
                    qty: { type: "number" },
                    batchNo: { type: "string" },
                  },
                  required: ["expiryDate", "qty", "batchNo"],
                  additionalProperties: false,
                },
              },
            },
            required: ["itemCode", "itemName", "brand", "baseUom", "batches"],
            additionalProperties: false,
          },
        },
      },
      required: ["products"],
      additionalProperties: false,
    },
  },
};

const packingTool = {
  type: "function",
  function: {
    name: "extract_packing_list",
    description: "Extract structured packing list data from the document",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemCode: { type: "string" },
              itemName: { type: "string" },
              qty: { type: "number" },
              unit: { type: "string" },
              batchNo: { type: "string" },
              expiryDate: { type: "string", description: "YYYY-MM-DD format if available" },
              productionDate: { type: "string", description: "YYYY-MM-DD format if available" },
            },
            required: ["itemCode", "itemName", "qty", "unit"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

const systemPrompts: Record<string, string> = {
  invoices: `You are a data extraction expert for warehouse management. Extract ALL invoices from this TRANSACTION SUMMARY LISTING PDF text.
Each invoice starts with "Doc No/Dt :" followed by the invoice number and date (DD/MM/YYYY format - convert to YYYY-MM-DD).
Customer line has format "Customer : CODE / NAME".
Items are in a table with columns: Item Code, Item Name, Uom, Sales Qty, LC Value, FC Value.
Extract the Item Code, Item Name, Uom, and Sales Qty (as a number) for each item.
Be thorough - extract EVERY invoice and EVERY item from the document.`,

  sku: `You are a precise data extraction expert for warehouse stock reports. Extract ALL products from this "Stock Report By Warehouse & Expiry" text.

DOCUMENT STRUCTURE:
- Products are grouped under Brand headers like "Brand : XX - BRAND NAME"
- Each product row has: Item Code, Item Name, Packing, Origin, Total Stock, Base UOM
- Below each product are batch rows with: Warehouse (Wh), Expiry Date (DD/MM/YYYY), Stock Qty, Batch #
- Continuation rows (same product) have EMPTY Item Code and Item Name columns
- Some batches have empty qty (0 stock) — skip those

CRITICAL RULES:
1. Convert ALL dates from DD/MM/YYYY to YYYY-MM-DD
2. Extract EVERY product and EVERY batch with qty > 0
3. Keep track of the current Brand — each product belongs to the last "Brand :" header seen
4. Products before the first Brand header use "General" as brand
5. If a product spans multiple pages, combine all its batches
6. Pay close attention to column alignment — the text columns may shift across pages
7. Do NOT miss any products or batches. Accuracy is critical.
8. totalStock should be the number shown in the "Total Stock" column (not recalculated)`,

  packing_list: `You are a data extraction expert for warehouse management. Extract ALL products from this packing list document.
Look for item codes, product names, quantities, units, batch numbers, expiry dates, and production dates.
Convert any dates to YYYY-MM-DD format. Extract every item you can find.`,
};

async function callAI(
  apiKey: string,
  type: string,
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>,
  model: string,
) {
  const tool = type === "invoices" ? invoiceTool : type === "sku" ? skuTool : packingTool;
  const toolName = type === "invoices" ? "extract_invoices" : type === "sku" ? "extract_sku" : "extract_packing_list";

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompts[type] },
        { role: "user", content },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`AI gateway error [${response.status}]:`, errText);
    if (response.status === 429) {
      return { error: "Rate limited. Please try again in a moment.", status: 429 };
    }
    if (response.status === 402) {
      return { error: "AI credits exhausted. Please add credits to continue.", status: 402 };
    }
    return { error: `AI processing failed: ${response.status}`, status: 500 };
  }

  let data: any;
  try {
    const rawText = await response.text();
    if (!rawText || rawText.trim().length === 0) {
      console.error("Empty response from AI gateway");
      return { error: "AI returned empty response", status: 500, retryable: true };
    }
    data = JSON.parse(rawText);
  } catch (parseErr) {
    console.error("Failed to parse AI response as JSON:", parseErr);
    return { error: "AI response was incomplete", status: 500, retryable: true };
  }

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.error("No tool call in response:", JSON.stringify(data).slice(0, 500));
    return { error: "AI did not return structured data", status: 500, retryable: true };
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return { data: parsed, status: 200 };
  } catch (e) {
    console.error("Failed to parse tool call arguments:", e);
    return { error: "Failed to parse AI response", status: 500, retryable: true };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAIWithRetry(
  apiKey: string,
  type: string,
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>,
  model: string,
  maxRetries = 3,
) {
  let lastResult: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.log(`Retry attempt ${attempt}, waiting ${delay}ms...`);
      await sleep(delay);
    }

    const result = await callAI(apiKey, type, content, model);
    if (!result?.error) return result;

    lastResult = result;
    const retriable = result.retryable || result.status === 429;
    if (!retriable || attempt === maxRetries) break;
  }

  return lastResult;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const { type, textChunks, images } = body as {
      type: "invoices" | "sku" | "packing_list";
      textChunks?: string[];
      images?: string[];
    };

    if (!type) throw new Error("Missing 'type' parameter");

    // Use pro model for SKU (accuracy matters), flash for others (speed matters)
    const model = type === "sku" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    // For packing lists with images, use vision
    if (type === "packing_list" && images && images.length > 0) {
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: "Extract all products from these packing list pages:" },
      ];
      for (const img of images) {
        content.push({ type: "image_url", image_url: { url: img } });
      }
      const result = await callAIWithRetry(LOVABLE_API_KEY, type, content, model);
      return new Response(JSON.stringify(result), {
        status: result.status || 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For text-based PDFs
    if (!textChunks || textChunks.length === 0) {
      throw new Error("No text content provided");
    }

    // Process chunks SEQUENTIALLY for reliability (one at a time, no parallel)
    const allResults: any[] = [];

    for (let i = 0; i < textChunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)`);

      const content = [{ type: "text" as const, text: textChunks[i] }];
      const result = await callAIWithRetry(LOVABLE_API_KEY, type, content, model);

      if (result?.error) {
        // For SKU imports, skip failed chunks and continue (partial data is better than none)
        if (type === "sku") {
          console.error(`Chunk ${i + 1} failed, skipping:`, result.error);
          continue;
        }
        return new Response(JSON.stringify(result), {
          status: result.status || 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      allResults.push(result.data);

      // Small delay between chunks to avoid rate limits
      if (i < textChunks.length - 1) {
        await sleep(500);
      }
    }

    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({ error: "All chunks failed to process. Try a smaller file or retry." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Merge results
    let merged: any;
    if (type === "invoices") {
      merged = { invoices: allResults.flatMap((r) => r.invoices || []) };
    } else if (type === "sku") {
      // Deduplicate products by itemCode (same product may appear in adjacent chunks)
      const productMap = new Map<string, any>();
      for (const r of allResults) {
        for (const p of r.products || []) {
          if (productMap.has(p.itemCode)) {
            // Merge batches from duplicate products
            const existing = productMap.get(p.itemCode);
            const existingBatchNos = new Set(existing.batches.map((b: any) => b.batchNo));
            for (const b of p.batches) {
              if (!existingBatchNos.has(b.batchNo)) {
                existing.batches.push(b);
              }
            }
          } else {
            productMap.set(p.itemCode, { ...p });
          }
        }
      }
      merged = { products: Array.from(productMap.values()) };
    } else {
      merged = { items: allResults.flatMap((r) => r.items || []) };
    }

    return new Response(JSON.stringify({ data: merged, status: 200 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-pdf error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
