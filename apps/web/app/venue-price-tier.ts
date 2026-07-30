import type { PublicEvent } from '@pulso/contracts';

export type VenuePriceTier = '$' | '$$' | '$$$';

/**
 * A venue's price tier, derived from the minimumAmount of its own paid
 * events - never a manually-entered field, since that doesn't scale and
 * isn't "real" for most venues anyway. Venues with zero priced events (all
 * curated venues today, and most Ville de Montréal ones) get `undefined`,
 * shown as such, never guessed.
 *
 * Uses the median rather than the average across the venue's paid events,
 * so one outlier premium show doesn't push an otherwise-cheap bar into a
 * higher tier.
 */
export function deriveVenuePriceTier(
  events: PublicEvent[]
): VenuePriceTier | undefined {
  const amounts = events
    .filter(
      (
        event
      ): event is PublicEvent & {
        price: { kind: 'paid'; currency: 'CAD'; minimumAmount: number };
      } =>
        event.price.kind === 'paid' && event.price.minimumAmount !== undefined
    )
    .map((event) => event.price.minimumAmount)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return undefined;

  const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
  if (median < 20) return '$';
  if (median <= 50) return '$$';
  return '$$$';
}
