/**
 * Format order ID for display
 * - If matches 3 letters + 3 digits pattern: add hyphen (KMT472 → KMT-472)
 * - Otherwise: uppercase for backward compatibility with old hex IDs
 */
export function formatOrderId(id: string): string {
  if (/^[A-Z]{3}\d{3}$/.test(id)) {
    return `${id.slice(0, 3)}-${id.slice(3)}`;
  }
  return id.toUpperCase();
}
