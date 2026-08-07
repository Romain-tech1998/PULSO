import type { PublicEvent } from '@pulso/contracts';
import { getMontrealCalendarDate } from '@pulso/domain';

export function getVenueDiscoveryDateRange(now: Date): {
  start: string;
  end: string;
} {
  const start = getMontrealCalendarDate(now);
  const [year, month, day] = start.split('-').map(Number);
  const endDate = new Date(Date.UTC(year!, month! - 1, day! + 13));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`;
  return { start, end };
}

export function partitionVenueEvents(
  events: PublicEvent[],
  now: Date
): { today: PublicEvent[]; later: PublicEvent[] } {
  const { start, end } = getVenueDiscoveryDateRange(now);
  const inWindow = [...events]
    .filter((event) => {
      const eventDate = getMontrealCalendarDate(new Date(event.startsAt));
      return eventDate >= start && eventDate <= end;
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
  return {
    today: inWindow.filter(
      (event) => getMontrealCalendarDate(new Date(event.startsAt)) === start
    ),
    later: inWindow.filter(
      (event) => getMontrealCalendarDate(new Date(event.startsAt)) !== start
    )
  };
}
