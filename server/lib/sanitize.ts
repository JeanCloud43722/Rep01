/**
 * Sanitizes user-provided text input before storage.
 * - Strips HTML tags
 * - Escapes remaining special characters to prevent XSS
 * - Trims whitespace
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')       // Strip HTML tags
    .replace(/&/g, '&amp;')        // Escape & first (before other replacements)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}
