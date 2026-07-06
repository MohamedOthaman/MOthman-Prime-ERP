import { describe, it, expect } from "vitest";
import {
  bestProductSimilarity,
  foldArabic,
  nameSimilarity,
} from "@/features/invoices/productNameMatcher";

describe("foldArabic", () => {
  it("folds alef/yaa/taa-marbuta variants", () => {
    expect(foldArabic("أحمد")).toBe("احمد");
    expect(foldArabic("قهوة")).toBe("قهوه");
    expect(foldArabic("مقهى")).toBe("مقهي");
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical strings ignoring case/spacing", () => {
    expect(nameSimilarity("BAX  Botanics Verbena", "bax botanics verbena")).toBe(1);
  });

  it("matches Arabic orthography variants", () => {
    // أ vs ا and ة vs ه should not tank the score
    expect(nameSimilarity("قهوة سادة نجار", "قهوه ساده نجار")).toBe(1);
  });

  it("normalizes Arabic-Indic digits", () => {
    expect(nameSimilarity("مشروب ٥٠٠ مل", "مشروب 500 مل")).toBe(1);
  });

  it("scores unrelated names low", () => {
    expect(nameSimilarity("frozen chicken", "olive oil")).toBeLessThan(0.45);
  });
});

describe("bestProductSimilarity", () => {
  const product = {
    item_code: "DM180",
    name: "BAX BOTANICS VERBENA 500ML",
    name_en: "BAX BOTANICS VERBENA 500ML",
    name_ar: "مشروب نباتي مقطر 500 مل",
  };

  it("matches an English document name regardless of UI language", () => {
    expect(bestProductSimilarity("BAX BOTANICS VERBENA 500ML", product)).toBe(1);
  });

  it("matches an Arabic document name against name_ar (with folding)", () => {
    // ة/أ variants + Arabic-Indic digits in the document text
    expect(bestProductSimilarity("مشروب نباتى مقطر ٥٠٠ مل", product)).toBeGreaterThan(0.9);
  });

  it("matches by item code", () => {
    expect(bestProductSimilarity("DM180", product)).toBe(1);
  });

  it("handles products with missing name fields", () => {
    expect(bestProductSimilarity("anything", { item_code: null, name: null })).toBe(0);
  });
});
