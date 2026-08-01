import { describe, expect, it } from "vitest";
import type { TranslateResponse } from "./translate";

describe("TranslateResponse shape", () => {
  it("includes translated text", () => {
    const sample: TranslateResponse = {
      text: "hello",
      translatedText: "hola",
      from: "en",
      to: "es",
    };
    expect(sample.translatedText).toBe("hola");
  });
});
