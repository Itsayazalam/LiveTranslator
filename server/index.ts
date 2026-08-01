import cors from "cors";
import express from "express";
import { translate } from "google-translate-api-x";
import { mockTranslate } from "./mock-translate.js";

const PORT = Number(process.env.PORT ?? 3001);
const USE_MOCK_TRANSLATOR = process.env.USE_MOCK_TRANSLATOR === "true";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "live-translator-api",
    translator: USE_MOCK_TRANSLATOR ? "mock" : "google-translate-api-x",
  });
});

app.post("/api/translate", async (req, res) => {
  const { text, from = "auto", to = "es" } = req.body ?? {};

  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (USE_MOCK_TRANSLATOR) {
    const result = mockTranslate(text, to);
    res.json({
      text,
      translatedText: result.text,
      from: from === "auto" ? result.from : from,
      to,
      source: "mock",
    });
    return;
  }

  try {
    const result = await translate(text, { from, to });
    res.json({
      text,
      translatedText: result.text,
      from: result.from.language.iso,
      to,
      source: "google-translate-api-x",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Translation failed";
    console.warn(`Translation API failed (${message}); using mock fallback`);
    const fallback = mockTranslate(text, to);
    res.json({
      text,
      translatedText: fallback.text,
      from: from === "auto" ? fallback.from : from,
      to,
      source: "mock-fallback",
    });
  }
});

app.listen(PORT, () => {
  console.log(`LiveTranslator API listening on http://localhost:${PORT}`);
});
