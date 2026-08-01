export type TranslateResponse = {
  text: string;
  translatedText: string;
  from: string;
  to: string;
};

export async function translateText(
  text: string,
  from = "auto",
  to = "es",
): Promise<TranslateResponse> {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, from, to }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<TranslateResponse>;
}
