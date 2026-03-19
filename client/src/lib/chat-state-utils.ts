export function isConfirmationPending(orderPreview: unknown): boolean {
  return orderPreview !== null && orderPreview !== undefined;
}
