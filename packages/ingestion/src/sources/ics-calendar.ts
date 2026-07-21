import type { IngestionConnector, RawIngestedEvent } from '../types.js';

/**
 * Generic ICS (iCalendar, RFC 5545) connector for venues that already publish
 * a calendar feed - several sources in the DATA-0002 pilot (e.g. Newspeak,
 * Théâtre Fairmount) exposed a Google Calendar ICS link on their own event
 * pages. This is a minimal VEVENT parser, not a full RFC 5545 implementation:
 * it does not resolve recurrence rules (RRULE), timezone VTIMEZONE blocks
 * beyond a raw TZID passthrough, or nested VALARM/VTODO components.
 */

function unfoldLines(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${value.endsWith('Z') ? 'Z' : ''}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

interface ParsedVEvent {
  summary?: string;
  description?: string;
  location?: string;
  dtstart?: string;
  dtend?: string;
  url?: string;
}

export function parseIcs(text: string): ParsedVEvent[] {
  const lines = unfoldLines(text);
  const events: ParsedVEvent[] = [];
  let current: ParsedVEvent | undefined;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const rawKey = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const key = rawKey.split(';')[0];

    switch (key) {
      case 'SUMMARY':
        current.summary = value.replace(/\\,/g, ',').replace(/\\n/gi, '\n');
        break;
      case 'DESCRIPTION':
        current.description = value.replace(/\\,/g, ',').replace(/\\n/gi, '\n');
        break;
      case 'LOCATION':
        current.location = value.replace(/\\,/g, ',');
        break;
      case 'DTSTART':
        current.dtstart = parseIcsDate(value);
        break;
      case 'DTEND':
        current.dtend = parseIcsDate(value);
        break;
      case 'URL':
        current.url = value;
        break;
      default:
        break;
    }
  }

  return events;
}

export function createIcsCalendarConnector(config: {
  sourceId: string;
  sourceName: string;
  icsUrl: string;
  fetchImpl?: typeof fetch;
}): IngestionConnector {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    id: config.sourceId,
    displayName: `${config.sourceName} (ICS calendar)`,
    async fetch(): Promise<RawIngestedEvent[]> {
      const response = await fetchImpl(config.icsUrl);
      if (!response.ok) {
        throw new Error(
          `ICS calendar request failed for ${config.sourceName} with status ${response.status}`
        );
      }
      const observedAt = new Date().toISOString();
      const text = await response.text();
      const parsed = parseIcs(text);

      return parsed
        .filter((event): event is ParsedVEvent & { summary: string; dtstart: string } =>
          Boolean(event.summary && event.dtstart)
        )
        .map((event) => ({
          sourceId: config.sourceId,
          sourceName: config.sourceName,
          sourceUrl: event.url ?? config.icsUrl,
          observedAt,
          title: event.summary,
          description: event.description,
          category: 'unmapped' as const,
          startsAt: event.dtstart,
          endsAt: event.dtend,
          venueName: config.sourceName,
          address: event.location,
          raw: event
        }));
    }
  };
}
