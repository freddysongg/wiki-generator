const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/;
const LEADING_HEADING_RE = /^#\s.*\r?\n+/;
const TRAILING_SOURCE_RE = /\r?\n---\r?\n\*Source:[^\n]*\*\s*$/;

export function stripPageChrome(raw: string): string {
  let result = raw.replace(FRONTMATTER_RE, "");
  result = result.replace(LEADING_HEADING_RE, "");
  result = result.replace(TRAILING_SOURCE_RE, "");
  return result.trim();
}
