import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatEventRange } from "@/lib/event-schema";
import { getAllEvents, getEventBySlug } from "@/lib/events";
import { getShowsForEvent } from "@/lib/setlists";
import { sitePath } from "@/lib/site-path";
import { absoluteUrl, eventImage, shareMetadata } from "@/lib/share-meta";

/**
 * Shareable link to one event in presentation mode: /present/<slug>.
 * GitHub Pages serves static files and crawlers ignore JavaScript, so `/present?event=…`
 * can only ever show the generic card. This page carries the event's own tags and image,
 * then sends people straight to the presentation at that event (same link the record uses).
 */
export const dynamic = "force-static";
type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllEvents().map((event) => ({ slug: event.slug }));
}

/** The presentation URL this share page opens: the first show that stops here, else the default show. */
function presentationHref(slug: string) {
  const shows = getShowsForEvent(slug);
  return shows.length ? `/present?setlist=${shows[0].id}&event=${slug}` : `/present?event=${slug}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) return {};
  const title = `${event.title} — Bitcoin Timechain`;
  return {
    title,
    description: event.summary,
    alternates: { canonical: absoluteUrl(`/events/${slug}`) },
    ...shareMetadata({ title, description: event.summary, path: `/present/${slug}`, type: "article", image: eventImage(slug, event.title) }),
  };
}

export default async function PresentEventShare({ params }: Props) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();
  const target = sitePath(presentationHref(slug));
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07080b", color: "#f3ead8", fontFamily: "var(--sans), sans-serif", padding: 24, textAlign: "center" }}>
    <meta httpEquiv="refresh" content={`0;url=${target}`} />
    <div>
      <p style={{ opacity: 0.7, fontSize: 14, letterSpacing: ".08em" }}>{formatEventRange(event).toUpperCase()}</p>
      <h1 style={{ fontSize: 28, margin: "8px 0 16px" }}>{event.title}</h1>
      <p><a href={target} style={{ color: "#f08a24" }}>Open the presentation at this event →</a></p>
    </div>
  </main>;
}
