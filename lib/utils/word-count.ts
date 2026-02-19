const MIN_WORDS = 50;

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function validateMinWords(
  text: string,
  min: number = MIN_WORDS
): { valid: boolean; count: number; min: number } {
  const count = countWords(text);
  return { valid: count >= min, count, min };
}
