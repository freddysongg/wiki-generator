const UNSAFE = /[\\/:*?"<>|]/g;

export function titleToFilename(title: string): string {
  let cleaned = title.replace(UNSAFE, "-");
  cleaned = cleaned.replace(/-+/g, "-");
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[.\-]+|[.\-]+$/g, "").trim();
  if (cleaned.length === 0) cleaned = "Untitled";
  return `${cleaned}.md`;
}
