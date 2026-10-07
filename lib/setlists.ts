import { toTimelineEvent, type TimelineEvent } from "@/lib/event-schema";
import { filterEvents, getAllEvents, type EventFilterParams } from "@/lib/events";
import { defaultSetlistId, setlists, shapeSetlist, type Setlist } from "@/lib/setlist-definitions";

export { defaultSetlistId, setlists, type Setlist };

export function getSetlist(id: string | undefined): Setlist | undefined {
  return setlists.find((setlist) => setlist.id === id);
}

export function getSetlistEvents(id: string | undefined): TimelineEvent[] {
  const setlist = getSetlist(id) ?? getSetlist(defaultSetlistId)!;
  return shapeSetlist(getAllEvents(), setlist).map(toTimelineEvent);
}

/** The "Your Filter" show: whatever the explorer currently has selected. */
export function getFilteredSetlistEvents(params: EventFilterParams): TimelineEvent[] {
  return shapeSetlist(filterEvents(params), { limit: 24, select: () => true }).map(toTimelineEvent);
}

export function countSetlistEvents(setlist: Setlist): number {
  return shapeSetlist(getAllEvents(), setlist).length;
}

let membership: Map<string, Setlist[]> | undefined;

/** The shows that stop at an event, in setlist order, so a record can link into its rides. */
export function getShowsForEvent(slug: string): Setlist[] {
  if (!membership) {
    membership = new Map();
    for (const setlist of setlists) {
      for (const event of shapeSetlist(getAllEvents(), setlist)) {
        membership.set(event.slug, [...membership.get(event.slug) ?? [], setlist]);
      }
    }
  }
  return membership.get(slug) ?? [];
}
