import { describe, expect, it } from "vitest";
import { mockTranslate } from "./mock-translate.js";

describe("mockTranslate", () => {
  it("returns known Spanish translations", () => {
    const result = mockTranslate("Hello, world!", "es");
    expect(result.text).toBe("¡Hola, mundo!");
    expect(result.from).toBe("en");
  });

  it("falls back to tagged text for unknown phrases", () => {
    const result = mockTranslate("custom phrase", "fr");
    expect(result.text).toBe("[fr] custom phrase");
  });
});
