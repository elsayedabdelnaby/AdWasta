// Copy pack: ready-to-paste output per approved item (design §3.6). Zero account
// risk — the human pastes it. Includes the image prompt when no image was generated.

export interface DraftLike {
  channel: string;
  platform?: string | null;
  subject?: string | null;
  preheader?: string | null;
  body: string;
}
export interface VisualBriefLike {
  prompt: string;
  aspectRatio: string;
}

export interface CopyPack {
  channel: string;
  platform?: string;
  caption?: string;
  hashtags?: string[];
  subject?: string;
  preheader?: string;
  body: string;
  imageUrls: string[];
  imagePrompt?: string; // present when no image was generated (for a designer)
}

function extractHashtags(text: string): string[] {
  return [...new Set(text.match(/#[A-Za-z0-9_]+/g) ?? [])];
}

export function generateCopyPack(
  draft: DraftLike,
  visualBrief: VisualBriefLike | null,
  imageUrls: string[],
): CopyPack {
  const base: CopyPack = { channel: draft.channel, body: draft.body, imageUrls };
  if (visualBrief && imageUrls.length === 0) base.imagePrompt = visualBrief.prompt;

  if (draft.channel === 'email') {
    return { ...base, subject: draft.subject ?? undefined, preheader: draft.preheader ?? undefined };
  }
  return {
    ...base,
    platform: draft.platform ?? undefined,
    caption: draft.body,
    hashtags: extractHashtags(draft.body),
  };
}
