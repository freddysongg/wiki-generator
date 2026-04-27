const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function validateWikilinks(markdown: string, knownTitles: Set<string>): string {
  return markdown.replace(WIKILINK, (_match, target: string, alias?: string) => {
    const trimmedTarget = target.trim();
    if (knownTitles.has(trimmedTarget)) {
      return alias ? `[[${trimmedTarget}|${alias.trim()}]]` : `[[${trimmedTarget}]]`;
    }
    return alias ? alias.trim() : trimmedTarget;
  });
}
