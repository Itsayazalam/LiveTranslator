import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { translateText } from "./api/translate";
import "./index.css";

const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" },
];

function App() {
  const [text, setText] = useState("Hello, world!");
  const [from, setFrom] = useState("auto");
  const [to, setTo] = useState("es");
  const [translatedText, setTranslatedText] = useState("");
  const [detectedFrom, setDetectedFrom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTranslation = useCallback(async (value: string) => {
    if (!value.trim()) {
      setTranslatedText("");
      setDetectedFrom("");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await translateText(value, from, to);
      setTranslatedText(result.translatedText);
      setDetectedFrom(result.from);
    } catch (err) {
      setTranslatedText("");
      setDetectedFrom("");
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runTranslation(text);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [text, runTranslation]);

  return (
    <main className="app">
      <header>
        <h1>LiveTranslator</h1>
        <p>Real-time text translation for development and testing.</p>
      </header>

      <section className="controls">
        <label>
          From
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </label>
        <label>
          To
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {LANGUAGES.filter((lang) => lang.code !== "auto").map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="panels">
        <label className="panel">
          <span>Source text</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type to translate live…"
            rows={6}
          />
        </label>
        <label className="panel">
          <span>Translation {loading ? "(translating…)" : ""}</span>
          <textarea
            value={translatedText}
            readOnly
            placeholder="Translation appears here"
            rows={6}
          />
        </label>
      </section>

      {detectedFrom && (
        <p className="meta">Detected source language: <strong>{detectedFrom}</strong></p>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
