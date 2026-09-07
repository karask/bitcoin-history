import type { Metadata } from "next";
import PresentationExperience from "./PresentationExperience";
import { toTimelineEvent } from "@/lib/event-schema";
import { getAllEvents, getEventBySlug } from "@/lib/events";
import {
  defaultSetlistId,
  getSetlist,
  getSetlistEvents,
  setlists,
} from "@/lib/setlists";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Presentation mode — Bitcoin Timechain",
  description: "A cinematic guided journey through the events that shaped Bitcoin.",
  openGraph: {
    title: "Presentation mode — Bitcoin Timechain",
    description: "A cinematic guided journey through the events that shaped Bitcoin.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Presentation mode — Bitcoin Timechain",
    description: "A cinematic guided journey through the events that shaped Bitcoin.",
  },
};

export default function PresentPage() {
  const setlist = getSetlist(defaultSetlistId)!;
  const events = getSetlistEvents(setlist.id);
  const allEvents = getAllEvents().map(toTimelineEvent);
  const enrich = (event: ReturnType<typeof toTimelineEvent>) => {
    const record = getEventBySlug(event.slug)!;
    return { ...event, details: record.details, sources: record.sources };
  };

  return (
    <PresentationExperience
      events={events.map(enrich)}
      allEvents={allEvents.map(enrich)}
      returnHref="/#events"
      setlistId={setlist.id}
      setlistTitle={setlist.title}
      setlistKicker={setlist.kicker}
      setlistTagline={setlist.tagline}
      setlistOptions={setlists.map(({ id, title, kicker, tagline }) => ({ id, title, kicker, tagline, eventSlugs: getSetlistEvents(id).map(event => event.slug) }))}
    />
  );
}
