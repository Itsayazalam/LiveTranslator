const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  es: {
    "Hello, world!": "¡Hola, mundo!",
    hello: "hola",
    "Good morning": "Buenos días",
  },
  fr: {
    "Hello, world!": "Bonjour le monde!",
    hello: "bonjour",
    "Good morning": "Bonjour",
  },
  de: {
    "Hello, world!": "Hallo Welt!",
    hello: "hallo",
    "Good morning": "Guten Morgen",
  },
  ja: {
    "Hello, world!": "こんにちは、世界！",
    hello: "こんにちは",
    "Good morning": "おはようございます",
  },
  ar: {
    "Hello, world!": "مرحبا بالعالم!",
    hello: "مرحبا",
    "Good morning": "صباح الخير",
  },
};

export function mockTranslate(text: string, to: string): {
  text: string;
  from: string;
} {
  const trimmed = text.trim();
  const translated =
    MOCK_TRANSLATIONS[to]?.[trimmed] ??
    MOCK_TRANSLATIONS[to]?.[trimmed.toLowerCase()] ??
    `[${to}] ${trimmed}`;

  return {
    text: translated,
    from: "en",
  };
}
