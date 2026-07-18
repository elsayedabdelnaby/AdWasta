// Every outbound link in a draft gets UTM params (design §7.2 — always on).
// utm_campaign = campaign id, utm_content = draft id.
const URL_RE = /https?:\/\/[^\s)]+/g;

export function applyUtm(text: string, campaignId: string, draftId: string): string {
  return text.replace(URL_RE, (url) => {
    if (url.includes('utm_campaign=')) return url; // already tagged
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}utm_campaign=${encodeURIComponent(campaignId)}&utm_content=${encodeURIComponent(draftId)}`;
  });
}
