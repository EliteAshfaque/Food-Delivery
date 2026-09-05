/** UAE-facing money formatting kept deterministic across Hermes and web. */
export function formatCurrency(value: number | string) {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return '—';
  return `AED ${numeric.toFixed(2)}`;
}
