import prehistoryRaw from "@/content/events-prehistory.json";
import earlyRaw from "@/content/events-early.json";
import lateRaw from "@/content/events-late.json";
import priceContext from "@/content/price-context.json";
import {
  bitcoinEventSchema,
  categoryIds,
  kindIds,
  toTimelineEvent,
  type BitcoinEvent,
  type CategoryId,
  type KindId,
  type TimelineEvent,
} from "@/lib/event-schema";
import { matchesPlace, type Place } from "@/lib/places";

const monthlyPrice = priceContext.values as Record<string, number>;

/**
 * Price on the month of the event, or null before Bitcoin had a quoted price at all.
 * Derived rather than authored so the corpus can never disagree with the series the
 * presentation rides on.
 */
function priceAt(date: string): number | null {
  return monthlyPrice[date.slice(0, 7)] ?? null;
}

function validateCorpus(): BitcoinEvent[] {
  const parsed = [...prehistoryRaw, ...earlyRaw, ...lateRaw].map((record, index) => {
    const result = bitcoinEventSchema.safeParse(record);
    if (!result.success) {
      const slug = typeof record === "object" && record && "slug" in record ? String(record.slug) : `record ${index}`;
      throw new Error(`Invalid Bitcoin event ${slug}: ${result.error.message}`);
    }
    const event = result.data;
    if (!event.categories.includes(event.category)) {
      throw new Error(`Event ${event.slug} must include its primary category in categories`);
    }
    const timestamp = Date.parse(`${event.date}T00:00:00Z`);
    if (!Number.isFinite(timestamp)) throw new Error(`Invalid event date: ${event.slug}`);
    if (event.endDate && event.endDate < event.date) {
      throw new Error(`Event ${event.slug} ends before it starts`);
    }
    return { ...event, places: event.places as Place[], priceUsd: priceAt(event.date) };
  });

  const slugs = new Set<string>();
  for (const event of parsed) {
    if (slugs.has(event.slug)) throw new Error(`Duplicate event slug: ${event.slug}`);
    slugs.add(event.slug);
  }
  for (const event of parsed) {
    for (const slug of event.related ?? []) {
      if (!slugs.has(slug)) throw new Error(`Event ${event.slug} links to unknown related slug ${slug}`);
    }
  }

  return parsed.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

const events = validateCorpus();

export function getAllEvents(): BitcoinEvent[] {
  return events;
}

export function getTimelineEvents(): TimelineEvent[] {
  return events.map(toTimelineEvent);
}

export function getEventBySlug(slug: string): BitcoinEvent | undefined {
  return events.find((event) => event.slug === slug);
}

export function getRelatedEvents(slug: string): BitcoinEvent[] {
  const event = getEventBySlug(slug);
  if (!event) return [];
  // Threads are bidirectional: surface events that point back at this one too.
  const linked = new Set(event.related ?? []);
  for (const candidate of events) {
    if (candidate.related?.includes(slug)) linked.add(candidate.slug);
  }
  linked.delete(slug);
  return [...linked].map(getEventBySlug).filter((item): item is BitcoinEvent => Boolean(item));
}

export function getAdjacentEvents(slug: string) {
  const index = events.findIndex((event) => event.slug === slug);
  return {
    previous: index > 0 ? events[index - 1] : undefined,
    next: index >= 0 && index < events.length - 1 ? events[index + 1] : undefined,
  };
}

export const firstEventYear = Number(events[0].date.slice(0, 4));
export const lastEventYear = Number(events[events.length - 1].date.slice(0, 4));

export type EventFilterParams = {
  scope?: string;
  cat?: string;
  kind?: string;
  q?: string;
  from?: string;
  to?: string;
  place?: string;
  sig?: string;
  domain?: string;
  evidence?: string;
};

function splitIds<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  return (value?.split(",") ?? []).filter((item): item is T => (allowed as readonly string[]).includes(item));
}

export function filterEvents(params: EventFilterParams): BitcoinEvent[] {
  const categories = splitIds(params.cat, categoryIds);
  const kinds = splitIds(params.kind, kindIds);
  const term = params.q?.trim().toLocaleLowerCase() ?? "";
  const from = Number(params.from) || firstEventYear;
  const to = Number(params.to) || lastEventYear;
  const scope = params.scope === "all" ? "all" : "curated";

  return events.filter((event) => {
    const year = Number(event.date.slice(0, 4));
    const haystack = [event.title, event.summary, ...event.tags, ...event.actors].join(" ").toLocaleLowerCase();
    return (scope === "all" || event.curated)
      && (!categories.length || categories.some((category) => event.categories.includes(category)))
      && (!kinds.length || kinds.includes(event.kind))
      && (!term || haystack.includes(term))
      && year >= from && year <= to
      && matchesPlace(event.places, params.place ?? "all")
      && (!params.sig || params.sig === "all" || event.significance === params.sig)
      && (!params.domain || params.domain === "all" || event.scope === params.domain)
      && (!params.evidence || params.evidence === "all" || event.evidence === params.evidence);
  });
}

export type { CategoryId, KindId };
