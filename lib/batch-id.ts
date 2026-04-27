const BATCH_ID_PATTERN = /^[A-Za-z0-9_:.-]+$/;
const MAX_LENGTH = 128;

export function isValidBatchId(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  if (value === "." || value === "..") return false;
  return BATCH_ID_PATTERN.test(value);
}
