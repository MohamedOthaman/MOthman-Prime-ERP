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

  sku: `You are a data extraction expert for warehouse management. Extract ALL products from this Stock Report By Warehouse & Expiry PDF text.
Products are grouped by Brand (indicated by "Brand :" headers).
Each product has: Item Code, Item Name, Packing, Origin, Total Stock, Base UOM.
Below each product are batch rows with: Warehouse (Wh), Expiry Date (DD/MM/YYYY - convert to YYYY-MM-DD), Stock Qty, Batch #.
Continuation rows for the same product have empty Item Code/Name columns.
Some batch quantities might be empty (0 stock) - skip those.
Be thorough - extract EVERY product and EVERY batch with qty > 0.
The first products before any Brand: header belong to a default brand (use the item's origin or "General").`,

  packing_list: `You are a data extraction expert for warehouse management. Extract ALL products from this packing list document.
Look for item codes, product names, quantities, units, batch numbers, expiry dates, and production dates.
Convert any dates to YYYY-MM-DD format. Extract every item you can find.`,
};

async function callAI(
  apiKey: string,
  type: string,
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>,
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
      model: "google/gemini-2.5-flash",
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

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    console.error("No tool call in response:", JSON.stringify(data));
    return { error: "AI did not return structured data", status: 500 };
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return { data: parsed, status: 200 };
  } catch (e) {
    console.error("Failed to parse tool call arguments:", e);
    return { error: "Failed to parse AI response", status: 500 };
  }
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
      images?: string[]; // base64 data URLs
    };

    if (!type) throw new Error("Missing 'type' parameter");

    // For packing lists with images, use vision
    if (type === "packing_list" && images && images.length > 0) {
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: "text", text: "Extract all products from these packing list pages:" },
      ];
      for (const img of images) {
        content.push({ type: "image_url", image_url: { url: img } });
      }
      const result = await callAI(LOVABLE_API_KEY, type, content);
      return new Response(JSON.stringify(result), {
        status: result.status || 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For text-based PDFs, process in chunks if needed
    if (!textChunks || textChunks.length === 0) {
      throw new Error("No text content provided");
    }

    if (textChunks.length === 1) {
      const content = [{ type: "text", text: textChunks[0] }];
      const result = await callAI(LOVABLE_API_KEY, type, content);
      return new Response(JSON.stringify(result), {
        status: result.status || 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Multiple chunks - process ALL in parallel
    const chunkPromises = textChunks.map((chunk) => {
      const content = [{ type: "text" as const, text: chunk }];
      return callAI(LOVABLE_API_KEY, type, content);
    });

    const chunkResults = await Promise.all(chunkPromises);
    
    // Check for errors
    const firstError = chunkResults.find((r) => r.error);
    if (firstError) {
      return new Response(JSON.stringify(firstError), {
        status: firstError.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allResults = chunkResults.map((r) => r.data);

    // Merge results
    let merged: any;
    if (type === "invoices") {
      merged = { invoices: allResults.flatMap((r) => r.invoices || []) };
    } else if (type === "sku") {
      merged = { products: allResults.flatMap((r) => r.products || []) };
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
