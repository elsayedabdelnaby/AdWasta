import type { GeminiImageClient } from './gemini.js';

// Rough per-image estimate for budget rollups (design §6.1, ADR-003: ~$0.134 for
// a 1K Gemini image). The harness enforces real spend caps elsewhere; this only
// keeps generatedAssets.cost_usd non-zero for reporting.
const IMAGE_COST_USD = 0.134;

/**
 * A real `GeminiImageClient` backed by the `@google/genai` SDK (design §8.2).
 * The SDK is imported dynamically through a non-literal specifier so the default
 * build/runtime never hard-depends on it — the package is only loaded when a key
 * is configured and image generation actually fires. Returns the image as a
 * data URL (the SDK yields base64 inline data, not a hosted URL).
 */
export function createGeminiImageClient(opts: { apiKey: string; model: string }): GeminiImageClient {
  let loaded: Promise<{ ai: unknown; Modality: unknown }> | null = null;
  const load = () => {
    if (!loaded) {
      // Non-literal specifier: keeps tsc from resolving the module at build time.
      const specifier: string = '@google/genai';
      loaded = import(specifier).then((m: any) => {
        const GoogleGenAI = m.GoogleGenAI ?? m.default?.GoogleGenAI;
        if (!GoogleGenAI) throw new Error('@google/genai: GoogleGenAI export not found');
        return { ai: new GoogleGenAI({ apiKey: opts.apiKey }), Modality: m.Modality };
      });
    }
    return loaded;
  };

  return async ({ prompt, aspectRatio, resolution }) => {
    const { ai, Modality } = (await load()) as {
      ai: { models: { generateContent: (req: unknown) => Promise<any> } };
      Modality: { TEXT: unknown; IMAGE: unknown };
    };
    const res = await ai.models.generateContent({
      model: opts.model,
      contents: prompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: { aspectRatio, imageSize: resolution },
      },
    });
    const parts: any[] = res?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p?.inlineData?.data);
    if (!img) throw new Error('Gemini returned no image data');
    const mime: string = img.inlineData.mimeType ?? 'image/png';
    return { url: `data:${mime};base64,${img.inlineData.data}`, costUsd: IMAGE_COST_USD };
  };
}
