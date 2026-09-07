import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryLabels, formatEventRange, kindLabels } from "@/lib/event-schema";
import { formatPlaces } from "@/lib/places";
import { getAdjacentEvents, getAllEvents, getEventBySlug, getRelatedEvents } from "@/lib/events";
import { sitePath } from "@/lib/site-path";

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

export default async function EventPage({ params }: EventPageProps) {
  const { slug } = await params;
  const event = getEventBySlug(slug);
  if (!event) notFound();
  const { previous, next } = getAdjacentEvents(event.slug);
  const related = getRelatedEvents(event.slug);

  return <main className={`detail-page category-${event.category}`}>
    <section className="detail-header">
      <header className="site-header">
        <Link className="brand" href={sitePath("/")}><span className="brand-mark" aria-hidden="true">₿</span><span>BITCOIN TIMECHAIN</span></Link>
        <nav aria-label="Primary navigation"><Link href={sitePath("/#explore")}>Explore</Link><Link href={sitePath(`/present?event=${event.slug}`)}>Present</Link><Link href={sitePath("/#method")}>Method</Link></nav>
        <span className="archive-status"><i aria-hidden="true" /> VERIFIED RECORD</span>
      </header>
      <div className="detail-hero">
        <Link className="detail-back" href={sitePath("/#events")}>← RETURN TO THE CHAIN</Link>
        <div className="detail-meta"><span>{formatEventRange(event)}</span><span>{categoryLabels[event.category]}</span><span>{kindLabels[event.kind]}</span><span>{event.evidence.replace("-", " ")}</span></div>
        <h1>{event.title}</h1>
        <p>{event.summary}</p>
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
        <h2>RECORD DATA</h2>
        <dl>
          <dt>DATE PRECISION</dt><dd>{event.precision}</dd>
          <dt>SIGNIFICANCE</dt><dd>{event.significance}</dd>
          <dt>KIND</dt><dd>{kindLabels[event.kind]}</dd>
          <dt>PLACE</dt><dd>{formatPlaces(event.places)}</dd>
          {event.priceUsd !== null && <><dt>BTC / USD (MONTH CLOSE)</dt><dd>{event.priceUsd < 1 ? `$${event.priceUsd.toFixed(2)}` : `$${Math.round(event.priceUsd).toLocaleString("en-US")}`}</dd></>}
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
      {previous ? <Link href={sitePath(`/events/${previous.slug}`)}>← {previous.date.slice(0,4)} · {previous.title}</Link> : <span />}
      {next ? <Link href={sitePath(`/events/${next.slug}`)}>{next.date.slice(0,4)} · {next.title} →</Link> : <span />}
    </nav>
  </main>;
}
