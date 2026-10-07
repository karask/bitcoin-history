import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/components/SiteLink";
import SiteHeader from "@/components/SiteHeader";
import { notFound } from "next/navigation";
import { categoryLabels, formatEventRange, kindLabels, toTimelineEvent, type BitcoinEvent } from "@/lib/event-schema";
import { formatPlaces } from "@/lib/places";
import { getAdjacentEvents, getAllEvents, getEventBySlug, getRelatedEvents } from "@/lib/events";
import { getShowsForEvent } from "@/lib/setlists";
import { sitePath } from "@/lib/site-path";
import { formatDailyPrice } from "@/lib/prices";
import { buildPriceChart } from "@/lib/price-chart";
import { formatGridPrice } from "@/lib/palette";
import priceContext from "@/content/price-context.json";
import ExhibitPreview from "./ExhibitPreview";

type EventPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllEvents().map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) return {};
  const title = `${event.title} — Bitcoin Timechain`;
  return {
    title,
    description: event.summary,
    openGraph: { title, description: event.summary, type: "article", images: [] },
    twitter: { card: "summary", title, description: event.summary, images: [] },
  };
}

const evidenceLabels: Record<string, string> = {
  documented: "Documented",
  "well-supported": "Well supported",
  disputed: "Disputed",
  estimated: "Estimated",
};

type Milestone = NonNullable<BitcoinEvent["priceMilestone"]>;

function PriceAtTheTime({ date, priceUsd, precision, milestone }: { date: string; priceUsd: number | null; precision: string; milestone?: Milestone }) {
  const chart = buildPriceChart(priceContext.values as Record<string, number>, date);
  const note = chart.beforeSeries
    ? "Before the first recorded exchange price"
    : priceUsd !== null ? "Price on the event date"
      : precision !== "day" ? "Exact date unknown, so no daily price" : "No recorded daily price on this date";
  return <figure className="price-at-time">
    <figcaption>
      <span>BTC / USD · DAILY · 00:00 UTC</span>
      <strong>{priceUsd !== null ? formatDailyPrice(priceUsd) : "—"}</strong>
    </figcaption>
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Bitcoin price history on a log scale, ${chart.from.slice(0, 4)} to ${chart.to.slice(0, 4)}, with this event marked. ${note}.`}>
      {chart.grid.map((line) => <g key={line.usd}>
        <line x1={chart.gutter} x2={chart.width} y1={line.y} y2={line.y} className="grid" />
        <text x={chart.gutter - 6} y={line.y + 3} textAnchor="end">{formatGridPrice(line.usd)}</text>
      </g>)}
      <path d={chart.path} className="series" />
      {chart.pastPath && <path d={chart.pastPath} className="series-past" />}
      <line x1={chart.marker.x} x2={chart.marker.x} y1="0" y2={chart.height} className="marker-line" />
      {chart.marker.y !== null && <circle cx={chart.marker.x} cy={chart.marker.y} r="4" className="marker-dot" />}
    </svg>
    <p className="price-axis" style={{ paddingInlineStart: `${(chart.gutter / chart.width) * 100}%` }}><span>{chart.from.slice(0, 4)}</span><span>{chart.to.slice(0, 4)}</span></p>
    <p className="price-note">{note}. <a href={priceContext.source.documentation} target="_blank" rel="noreferrer">Coin Metrics PriceUSD ↗</a></p>
    {milestone && <p className="price-milestone">
      <b>EVENT PRICE MILESTONE</b>
      <span>{milestone.approximate ? "≈ " : ""}{formatDailyPrice(milestone.usd)} · {milestone.label}</span>
      <a href={milestone.source.url} target="_blank" rel="noreferrer">{milestone.source.publisher} ↗</a>
    </p>}
  </figure>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();
  const { previous, next } = getAdjacentEvents(event.slug);
  const related = getRelatedEvents(event.slug);
  const shows = getShowsForEvent(event.slug);
  const rideHref = sitePath(shows.length
    ? `/present?setlist=${shows[0].id}&event=${event.slug}&from=record`
    : `/present?event=${event.slug}`);
  const previewEvent = { ...toTimelineEvent(event), details: event.details, sources: event.sources };

  return <main className={`detail-page category-${event.category}`}>
    <section className="detail-header">
      <SiteHeader rideHref={rideHref} />
      <div className="detail-hero">
        <div className="detail-hero-copy">
          <Link className="detail-back" href={sitePath("/#events")}><span aria-hidden="true">←</span> All events</Link>
          <div className="detail-meta">
            <time dateTime={event.date}>{formatEventRange(event)}</time>
            <span>{categoryLabels[event.category]}</span>
            <span>{kindLabels[event.kind]}</span>
            <span className={`evidence evidence-${event.evidence}`}>{evidenceLabels[event.evidence]}</span>
            {event.significance === "landmark" && <span className="landmark-badge">Landmark</span>}
          </div>
          <h1>{event.title}</h1>
          <p>{event.summary}</p>
          <div className="detail-actions">
            <Link className="ride-cta" href={rideHref}><b aria-hidden="true">▶</b>Ride to this stop</Link>
            {shows.length > 0 && <p className="detail-shows"><span>{shows.length > 1 ? "IN THE SHOWS" : "IN THE SHOW"}</span>
              {shows.map((show) => <Link key={show.id} href={sitePath(`/present?setlist=${show.id}&event=${event.slug}&from=record`)}>{show.title}</Link>)}
            </p>}
          </div>
        </div>
        <ExhibitPreview event={previewEvent} rideHref={rideHref} />
      </div>
    </section>

    <section className="detail-body">
      <article className="detail-copy">
        {event.slug === "bitcoin-white-paper-announced" && <figure className="archive-artifact">
          <Image
            src={sitePath("/archive/whitepaper.png")}
            width={1280}
            height={720}
            sizes="(max-width: 760px) 100vw, 760px"
            alt="A computer screen displaying the opening page of the Bitcoin white paper"
            priority
          />
          <figcaption>
            <span>ARCHIVE ARTIFACT · WHITE PAPER MOCKUP</span>
            <a href="https://commons.wikimedia.org/wiki/File:CoCalc_LaTeX_white_paper.webp" target="_blank" rel="noreferrer">Wikideas1 · CC0 / Wikimedia Commons ↗</a>
          </figcaption>
        </figure>}
        {event.details.split(/\n\s*\n/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        <aside className="detail-why"><span>WHY IT MATTERS</span><p>{event.whyItMatters}</p></aside>
        {event.technicalNote && <aside className="detail-why"><span>TECHNICAL NOTE</span><p>{event.technicalNote}</p></aside>}
      </article>

      <aside className="detail-aside">
        <PriceAtTheTime date={event.date} priceUsd={event.priceUsd} precision={event.precision} milestone={event.priceMilestone} />


        <h2>RECORD DATA</h2>
        <dl>
          <dt>DATE PRECISION</dt><dd>{event.precision}</dd>
          <dt>SIGNIFICANCE</dt><dd>{event.significance}</dd>
          <dt>KIND</dt><dd>{kindLabels[event.kind]}</dd>
          <dt>PLACE</dt><dd>{formatPlaces(event.places)}</dd>
          <dt>ACTORS</dt><dd>{event.actors.length ? event.actors.join(", ") : "—"}</dd>
          {event.blockHeight !== undefined && <><dt>BLOCK HEIGHT</dt><dd>{event.blockHeight.toLocaleString("en-US")}</dd></>}
          {event.bip !== undefined && <><dt>BIP</dt><dd>{event.bip}</dd></>}
          {event.txid && <><dt>TRANSACTION</dt><dd className="hash-value">{event.txid}</dd></>}
        </dl>
        {related.length > 0 && <>
          <h2>THIS THREAD</h2>
          <ol className="related-list">
            {related.map((item) => <li key={item.slug}>
              <Link href={sitePath(`/events/${item.slug}`)}><span>{item.title}</span><small>{item.date.slice(0, 4)} · {categoryLabels[item.category]}</small></Link>
            </li>)}
          </ol>
        </>}

        <h2>SOURCES</h2>
        <ol className="source-list">
          {event.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer"><span>{source.title} ↗</span><small>{source.publisher} · {source.type}</small></a></li>)}
        </ol>
      </aside>
    </section>

    <nav className="detail-next" aria-label="Adjacent events">
      {previous ? <Link href={sitePath(`/events/${previous.slug}`)}><small>← PREVIOUS · {previous.date.slice(0, 4)}</small><span>{previous.title}</span></Link> : <span />}
      {next ? <Link className="is-next" href={sitePath(`/events/${next.slug}`)}><small>NEXT · {next.date.slice(0, 4)} →</small><span>{next.title}</span></Link> : <span />}
    </nav>
  </main>;
}
