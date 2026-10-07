import type { Metadata } from "next";
import TimelineExplorer from "./TimelineExplorer";
import { getTimelineEvents } from "@/lib/events";
import { defaultSetlistId, getSetlist, getSetlistEvents } from "@/lib/setlists";
import priceContext from "@/content/price-context.json";

// The bundled data is refreshed together, so its retrieval date is the archive's revision.
// Formatted in UTC with a fixed locale so every render produces the same string.
const archiveUpdated = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${priceContext.source.retrievedOn}T00:00:00Z`)).toUpperCase();

export const metadata: Metadata = {
  title: "Bitcoin Timechain — The history of an idea in motion",
  description: "Explore the breakthroughs, crises, culture, and adoption that shaped Bitcoin.",
};

export default function Home() {
  const show = getSetlist(defaultSetlistId)!;
  return <TimelineExplorer
    events={getTimelineEvents()}
    defaultShow={{ title: show.title, stops: getSetlistEvents(show.id).length }}
    archive={{ updated: archiveUpdated, priceDocumentation: priceContext.source.documentation }}
  />;
}
