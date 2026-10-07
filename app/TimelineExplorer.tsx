"use client";

import Image from "next/image";
import Link from "@/components/SiteLink";
import SiteHeader from "@/components/SiteHeader";
import { sitePath } from "@/lib/site-path";
import { formatDailyPrice } from "@/lib/prices";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryIds,
  categoryShortLabels,
  formatEventDate,
  kindIds,
  kindLabels,
  type CategoryId,
  type KindId,
  type TimelineEvent,
} from "@/lib/event-schema";
import { continentLabels, countries, matchesPlace, subdivisions, type ContinentId } from "@/lib/places";

type ViewPreset = "curious" | "enthusiast" | "classroom";
type ScopePreset = "curated" | "all";
type ViewLayout = "list" | "story";

/**
 * Price beside each record, on one log scale across the archive. Replaces a side curve that
 * assumed every card had the same height, which stopped holding once rows could wrap.
 */
function PriceChip({ price, range }: { price: number | null; range: { min: number; max: number } }) {
  if (price === null) return <span className="price-chip is-empty">No daily price</span>;
  const share = (Math.log10(price) - range.min) / Math.max(range.max - range.min, 1e-9);
  return <span className="price-chip"><i style={{ inlineSize: `${Math.max(4, share * 100).toFixed(1)}%` }} aria-hidden="true" />{formatDailyPrice(price)}</span>;
}

const FIRST_YEAR = "1983";

function readParams(lastYear: number) {
  const params = new URLSearchParams(window.location.search);
  const categoryValues = params.get("cat")?.split(",").filter((value): value is CategoryId => categoryIds.includes(value as CategoryId)) ?? [];
  const kindValues = params.get("kind")?.split(",").filter((value): value is KindId => kindIds.includes(value as KindId)) ?? [];
  const view = params.get("view");
  const scope = params.get("scope");
  const place = params.get("place") ?? "all";
  const significance = params.get("sig") ?? "all";
  const domain = params.get("domain") ?? "all";
  const evidence = params.get("evidence") ?? "all";
  return {
    view: (view === "enthusiast" || view === "classroom" ? view : "curious") as ViewPreset,
    scope: (scope === "all" ? "all" : "curated") as ScopePreset,
    layout: (params.get("layout") === "story" ? "story" : "list") as ViewLayout,
    categories: categoryValues,
    kinds: kindValues,
    query: params.get("q") ?? "",
    from: params.get("from") ?? FIRST_YEAR,
    to: params.get("to") ?? String(lastYear),
    place,
    significance: ["all", "landmark", "major", "context"].includes(significance) ? significance : "all",
    domain: ["all", "protocol", "ecosystem"].includes(domain) ? domain : "all",
    evidence: ["all", "documented", "well-supported", "disputed", "estimated"].includes(evidence) ? evidence : "all",
    price: params.get("price") === "1",
  };
}

type TimelineExplorerProps = {
  events: TimelineEvent[];
  /** The show the hero's ride button starts when no filter is set. */
  defaultShow: { title: string; stops: number };
  /**
   * Read from the price bundle on the server: importing it here would ship the whole
   * daily series to the archive page for two strings.
   */
  archive: { updated: string; priceDocumentation: string };
};

export default function TimelineExplorer({ events, defaultShow, archive }: TimelineExplorerProps) {
  // Derived from the archive rather than `new Date()`: a clock read during render can
  // disagree between server and client across a year boundary, which breaks hydration.
  const currentYear = useMemo(
    () => events.reduce((latest, event) => Math.max(latest, Number(event.date.slice(0, 4))), Number(FIRST_YEAR)),
    [events],
  );
  const [view, setView] = useState<ViewPreset>("curious");
  const [scope, setScope] = useState<ScopePreset>("curated");
  const [layout, setLayout] = useState<ViewLayout>("list");
  const [categories, setCategories] = useState<CategoryId[]>([]);
  const [kinds, setKinds] = useState<KindId[]>([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(FIRST_YEAR);
  const [to, setTo] = useState(String(currentYear));
  const [place, setPlace] = useState("all");
  const [significance, setSignificance] = useState("all");
  const [domain, setDomain] = useState("all");
  const [evidence, setEvidence] = useState("all");
  const [showPrice, setShowPrice] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const yearListRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = readParams(currentYear);
      setView(params.view);
      setScope(params.scope);
      setLayout(params.layout);
      setCategories(params.categories);
      setKinds(params.kinds);
      setQuery(params.query);
      setFrom(params.from);
      setTo(params.to);
      setPlace(params.place);
      setSignificance(params.significance);
      setDomain(params.domain);
      setEvidence(params.evidence);
      setShowPrice(params.price);
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentYear, events]);

  // Offer the three levels the data actually supports, deepest last.
  const placeOptions = useMemo(() => {
    const usedCountries = new Set<string>();
    const usedSubdivisions = new Set<string>();
    const usedContinents = new Set<ContinentId>();
    for (const event of events) {
      for (const item of event.places) {
        usedCountries.add(item.country);
        if (item.subdivision) usedSubdivisions.add(item.subdivision);
        const continent = countries[item.country]?.continent;
        if (continent && continent !== "global") usedContinents.add(continent);
      }
    }
    return {
      continents: [...usedContinents].map((id) => ({ value: id, label: continentLabels[id] }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      countries: [...usedCountries].filter((code) => code !== "XX")
        .map((code) => ({ value: code, label: countries[code as keyof typeof countries].name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      subdivisions: [...usedSubdivisions]
        .map((code) => ({ value: code, label: subdivisions[code as keyof typeof subdivisions] }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [events]);

  const priceRange = useMemo(() => {
    const logs = events.flatMap((event) => event.priceUsd === null ? [] : [Math.log10(event.priceUsd)]);
    return { min: Math.min(...logs), max: Math.max(...logs) };
  }, [events]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const min = Number(from) || Number(FIRST_YEAR);
    const max = Number(to) || currentYear;
    return events.filter((event) => {
      const year = Number(event.date.slice(0, 4));
      const haystack = [event.title, event.summary, ...event.tags, ...event.actors].join(" ").toLocaleLowerCase();
      return (scope === "all" || event.curated)
        && (categories.length === 0 || categories.some((category) => event.categories.includes(category)))
        && (kinds.length === 0 || kinds.includes(event.kind))
        && (!term || haystack.includes(term))
        && year >= min && year <= max
        && matchesPlace(event.places, place)
        && (significance === "all" || event.significance === significance)
        && (domain === "all" || event.scope === domain)
        && (evidence === "all" || event.evidence === evidence);
    });
  }, [events, scope, categories, kinds, query, from, to, currentYear, place, significance, domain, evidence]);

  const years = useMemo(() => {
    const groups: { year: string; events: TimelineEvent[] }[] = [];
    for (const event of filtered) {
      const year = event.date.slice(0, 4);
      if (groups.at(-1)?.year === year) groups.at(-1)!.events.push(event);
      else groups.push({ year, events: [event] });
    }
    return groups;
  }, [filtered]);

  const activeFilterCount = categories.length
    + kinds.length
    + (query ? 1 : 0)
    + (from !== FIRST_YEAR ? 1 : 0)
    + (to !== String(currentYear) ? 1 : 0)
    + (place !== "all" ? 1 : 0)
    + (significance !== "all" ? 1 : 0)
    + (domain !== "all" ? 1 : 0)
    + (evidence !== "all" ? 1 : 0);
  // Advanced filters live behind the button; the visible pills and search are not counted twice.
  const hiddenFilterCount = kinds.length
    + (from !== FIRST_YEAR ? 1 : 0)
    + (to !== String(currentYear) ? 1 : 0)
    + (place !== "all" ? 1 : 0)
    + (significance !== "all" ? 1 : 0)
    + (domain !== "all" ? 1 : 0)
    + (evidence !== "all" ? 1 : 0)
    + (view !== "curious" ? 1 : 0)
    + (showPrice ? 1 : 0);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (view !== "curious") params.set("view", view);
    if (scope !== "curated") params.set("scope", scope);
    if (layout !== "list") params.set("layout", layout);
    if (categories.length) params.set("cat", [...categories].sort().join(","));
    if (kinds.length) params.set("kind", [...kinds].sort().join(","));
    if (query.trim()) params.set("q", query.trim());
    if (from !== FIRST_YEAR) params.set("from", from);
    if (to !== String(currentYear)) params.set("to", to);
    if (place !== "all") params.set("place", place);
    if (significance !== "all") params.set("sig", significance);
    if (domain !== "all") params.set("domain", domain);
    if (evidence !== "all") params.set("evidence", evidence);
    if (showPrice) params.set("price", "1");
    const next = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`);
  }, [ready, view, scope, layout, categories, kinds, query, from, to, currentYear, place, significance, domain, evidence, showPrice]);

  // "/" focuses the search, as on most archives.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Year anchors land below the sticky toolbar, whatever height it currently has.
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--sticky-offset", `${Math.round(shell.getBoundingClientRect().height) + 12}px`);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  // A narrower filter can leave the reader scrolled past the end of a much shorter list;
  // bring the top of the results back under the toolbar when that happens.
  const resultsKey = filtered.map((event) => event.slug).join();
  const lastResultsKey = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    // The filters restored from the URL are where the reader starts, not a change.
    if (lastResultsKey.current === null || lastResultsKey.current === resultsKey) {
      lastResultsKey.current = resultsKey;
      return;
    }
    lastResultsKey.current = resultsKey;
    const list = document.getElementById("events");
    if (!list) return;
    const offset = shellRef.current?.getBoundingClientRect().height ?? 0;
    const top = list.getBoundingClientRect().top;
    if (top < offset) window.scrollTo({ top: window.scrollY + top - offset, behavior: "auto" });
  }, [ready, resultsKey]);

  // Track the year being read, for the jump bar.
  useEffect(() => {
    const groups = [...document.querySelectorAll<HTMLElement>(".year-group")];
    if (!groups.length) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set((entry.target as HTMLElement).dataset.year!, entry.isIntersecting);
      const first = groups.find((group) => visible.get(group.dataset.year!));
      if (first) setActiveYear(first.dataset.year!);
    }, { rootMargin: "-160px 0px -55% 0px" });
    for (const group of groups) observer.observe(group);
    return () => observer.disconnect();
  }, [years, layout]);

  // Keep the active year chip in view inside the horizontally scrolling bar,
  // without scrolling the page itself.
  useEffect(() => {
    const list = yearListRef.current;
    const chip = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !chip) return;
    const left = chip.offsetLeft - list.clientWidth / 2 + chip.clientWidth / 2;
    list.scrollTo({ left, behavior: "smooth" });
  }, [activeYear]);

  function changeView(next: ViewPreset) {
    setView(next);
    setScope(next === "enthusiast" ? "all" : "curated");
  }

  function toggleCategory(category: CategoryId) {
    setCategories((active) => active.includes(category) ? active.filter((item) => item !== category) : [...active, category]);
  }

  function toggleKind(kind: KindId) {
    setKinds((active) => active.includes(kind) ? active.filter((item) => item !== kind) : [...active, kind]);
  }

  function clearFilters() {
    setCategories([]);
    setKinds([]);
    setQuery("");
    setFrom(FIRST_YEAR);
    setTo(String(currentYear));
    setPlace("all");
    setSignificance("all");
    setDomain("all");
    setEvidence("all");
  }

  const presentationParams = new URLSearchParams();
  const ridingFilter = Boolean(activeFilterCount || scope === "all");
  presentationParams.set("setlist", ridingFilter ? "filtered" : "grand-tour");
  presentationParams.set("scope", scope);
  if (categories.length) presentationParams.set("cat", categories.join(","));
  if (kinds.length) presentationParams.set("kind", kinds.join(","));
  if (query.trim()) presentationParams.set("q", query.trim());
  if (from !== FIRST_YEAR) presentationParams.set("from", from);
  if (to !== String(currentYear)) presentationParams.set("to", to);
  if (place !== "all") presentationParams.set("place", place);
  if (significance !== "all") presentationParams.set("sig", significance);
  if (domain !== "all") presentationParams.set("domain", domain);
  if (evidence !== "all") presentationParams.set("evidence", evidence);
  const rideHref = sitePath(`/present?${presentationParams.toString()}`);

  return <main>
    <a className="skip-link" href="#events">Skip to events</a>
    <SiteHeader timelineHref="#events" methodHref="#method" rideHref={rideHref} status={`ARCHIVE ${FIRST_YEAR}–${currentYear}`} />

    <section className="hero" id="top">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy">
        <p className="hero-kicker">THE HISTORY OF AN IDEA IN MOTION</p>
        <h1>History doesn’t move<br />in a <em>straight line.</em></h1>
        <p className="hero-intro">Follow the breakthroughs, arguments, crises, and unlikely moments that carried Bitcoin from a cryptography mailing list into world history.</p>
        <div className="hero-actions">
          <Link className="ride-button" href={rideHref} aria-describedby="ride-description"><b aria-hidden="true">▶</b><span>Start the 3D ride</span></Link>
          <a className="browse-events" href="#explore">Browse the timeline <span aria-hidden="true">↓</span></a>
        </div>
        <p id="ride-description" className="hero-ride-note">Ride through Bitcoin history in 3D: a roller coaster shaped by its price, with an exhibit at every stop.</p>
      </div>
      <a className="hero-preview" href={rideHref} tabIndex={-1} aria-hidden="true">
        <Image src={sitePath("/ride-preview.webp")} alt="" width={1600} height={1000} sizes="(max-width: 760px) 100vw, 46vw" priority />
        <span className="hero-preview-badge"><b>▶</b>{ridingFilter ? "YOUR FILTER" : `${defaultShow.title.toUpperCase()} · ${defaultShow.stops} STOPS`}</span>
      </a>
      <a className="hero-scroll" href="#explore"><span>Scroll to explore the events</span><span className="hero-scroll-arrow" aria-hidden="true">↓</span></a>
    </section>

    <section className="archive-intro" id="explore">
      <div><p className="eyebrow">EXPLORE THE ARCHIVE</p><h2>One chain. Hundreds<br />of turning points.</h2></div>
      <div className="archive-counts"><span><strong>{events.filter((event) => event.curated).length}</strong> CURATED</span><span><strong>{events.length}</strong> ALL EVENTS</span></div>
    </section>

    <div className="archive-toolbar" ref={shellRef}>
      <label className="search-box">
        <span className="sr-only">Search events</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4.5 4.5" /></svg>
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search: pizza, Taproot, El Salvador…" type="search" />
        {!query && <kbd aria-hidden="true">/</kbd>}
      </label>
      <nav className="year-jump" aria-label="Jump to a year">
        <ol ref={yearListRef}>{years.map(({ year, events: inYear }) => <li key={year}>
          <a href={`#year-${year}`} aria-current={activeYear === year ? "true" : undefined} title={`${inYear.length} event${inYear.length === 1 ? "" : "s"}`}>{year}</a>
        </li>)}</ol>
      </nav>
      <p className="result-count" aria-live="polite"><strong>{filtered.length}</strong> of {events.length} events</p>
    </div>

    <section className="filter-shell" aria-label="Topics and filters">
      <div className="primary-filters">
        <div className="pill-scroller">
          <div className="scope-tabs" role="group" aria-label="Archive scope"><button className={scope === "curated" ? "active" : ""} onClick={() => setScope("curated")} aria-pressed={scope === "curated"} type="button">Curated</button><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")} aria-pressed={scope === "all"} type="button">All events</button></div>
          <div className="category-pills" role="group" aria-label="Event categories"><button className={categories.length === 0 ? "active" : ""} onClick={() => setCategories([])} aria-pressed={categories.length === 0} type="button">All topics</button>{categoryIds.map((category) => <button className={`category-${category}${categories.includes(category) ? " active" : ""}`} onClick={() => toggleCategory(category)} aria-pressed={categories.includes(category)} type="button" key={category}><i aria-hidden="true" />{categoryShortLabels[category]}</button>)}</div>
        </div>
        <button className={`more-button ${hiddenFilterCount ? "has-filters" : ""}`} onClick={() => setShowMore((open) => !open)} aria-expanded={showMore} aria-controls="advanced-filters" type="button">Filters{hiddenFilterCount ? ` · ${hiddenFilterCount}` : ""}</button>
        <div className="layout-toggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>List</button>
          <button type="button" aria-pressed={layout === "story"} onClick={() => setLayout("story")}>Story</button>
        </div>
      </div>

      {showMore && <div className="advanced-filters" id="advanced-filters">
        <label><span>DETAIL</span><select value={view} onChange={(event) => changeView(event.target.value as ViewPreset)}><option value="curious">Summaries</option><option value="classroom">Classroom: add why it matters</option><option value="enthusiast">Enthusiast: all events, technical notes</option></select></label>
        <label><span>FROM</span><input min={FIRST_YEAR} max={currentYear} value={from} onChange={(event) => setFrom(event.target.value)} type="number" /></label>
        <label><span>TO</span><input min={FIRST_YEAR} max={currentYear} value={to} onChange={(event) => setTo(event.target.value)} type="number" /></label>
        <label><span>PLACE</span><select value={place} onChange={(event) => setPlace(event.target.value)}><option value="all">Everywhere</option><optgroup label="Region of the world">{placeOptions.continents.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="Country">{placeOptions.countries.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="State or province">{placeOptions.subdivisions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup></select></label>
        <label><span>SIGNIFICANCE</span><select value={significance} onChange={(event) => setSignificance(event.target.value)}><option value="all">All levels</option><option value="landmark">Landmarks</option><option value="major">Major</option><option value="context">Context</option></select></label>
        <label><span>DOMAIN</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="all">Protocol + ecosystem</option><option value="protocol">Protocol only</option><option value="ecosystem">Ecosystem only</option></select></label>
        <label><span>EVIDENCE</span><select value={evidence} onChange={(event) => setEvidence(event.target.value)}><option value="all">All evidence states</option><option value="documented">Documented</option><option value="well-supported">Well supported</option><option value="disputed">Disputed</option><option value="estimated">Estimated</option></select></label>
        <div className="kind-filter"><span>WHAT HAPPENED</span><div className="kind-pills">{kindIds.map((kind) => <button className={kinds.includes(kind) ? "active" : ""} onClick={() => toggleKind(kind)} aria-pressed={kinds.includes(kind)} type="button" key={kind}>{kindLabels[kind]}</button>)}</div></div>
        <label className="price-toggle"><input checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} type="checkbox" /><span><b>PRICE CONTEXT</b> Show each event’s BTC/USD price</span></label>
        <button className="clear-button" onClick={clearFilters} type="button">Clear filters</button>
      </div>}
    </section>

    <section className={`timeline-section layout-${layout}${showPrice ? " with-price" : ""}`} id="events" aria-labelledby="timeline-title">
      <div className="timeline-heading">
        <div><p className="eyebrow">VISIBLE CHAIN</p><h2 id="timeline-title">Every event, in its place.</h2></div>
        <Link className="filtered-tour" href={rideHref}><b aria-hidden="true">▶</b>{ridingFilter ? "Ride these results" : `Ride ${defaultShow.title}`}</Link>
      </div>
      {showPrice && <p className="price-key">BTC/USD daily reference at 00:00 UTC on each event’s date, on a log scale. Missing or imprecise dates show no price. <a href={archive.priceDocumentation} target="_blank" rel="noreferrer">Coin Metrics PriceUSD ↗</a></p>}
      {filtered.length ? <div className="year-groups">
        {years.map(({ year, events: inYear }) => <section className="year-group" id={`year-${year}`} data-year={year} key={year} aria-labelledby={`year-label-${year}`}>
          <h3 className="year-label" id={`year-label-${year}`}>{year}<small>{inYear.length} event{inYear.length === 1 ? "" : "s"}</small></h3>
          <ol>
            {inYear.map((event) => <li className={`timeline-event category-${event.category} significance-${event.significance}`} key={event.slug}>
              <div className="timeline-rail" aria-hidden="true"><i /></div>
              <article>
                <div className="event-meta">
                  <time dateTime={event.date}>{formatEventDate(event)}</time>
                  <span className="event-category">{categoryShortLabels[event.category]}</span>
                  {event.significance === "landmark" && <span className="landmark-badge">Landmark</span>}
                </div>
                <h4><Link href={sitePath(`/events/${event.slug}`)}>{event.title}</Link></h4>
                <p>{event.summary}</p>
                {view === "classroom" && <aside className="why-note"><b>WHY IT MATTERS</b>{event.whyItMatters}</aside>}
                {view === "enthusiast" && <div className="technical-row"><span>{event.evidence.replace("-", " ")}</span><span>{event.scope}</span>{event.blockHeight !== undefined && <span>BLOCK {event.blockHeight.toLocaleString()}</span>}{event.bip !== undefined && <span>BIP {event.bip}</span>}{event.technicalNote && <span>{event.technicalNote}</span>}</div>}
                {showPrice && <PriceChip price={event.priceUsd} range={priceRange} />}
                <Link className="read-record" href={sitePath(`/events/${event.slug}`)} tabIndex={-1} aria-hidden="true">Read the record <span>→</span></Link>
              </article>
            </li>)}
          </ol>
        </section>)}
      </div> : <div className="empty-state"><span>NO MATCHING BLOCKS</span><h3>The chain is quiet here.</h3><p>Widen the date range or remove a filter to bring events back into view.</p><button onClick={clearFilters} type="button">Reset the timeline</button></div>}
    </section>

    <section className="method" id="method">
      <p className="eyebrow">HOW WE KNOW</p>
      <h2>History, with receipts.</h2>
      <div><p>Every record includes a direct source wherever one survives: blocks and transactions, BIPs and release notes, court records and enacted laws.</p><p>Claims are labelled when dates are estimated or interpretations are disputed. Exchange failures are never described as protocol failures.</p><p>The archive is editorially reviewed, versioned, and designed to accept corrections without silently rewriting the past.</p></div>
    </section>
    <footer className="site-footer"><span>BITCOIN TIMECHAIN</span><span>ENGLISH · TRANSLATION READY</span><span>UPDATED {archive.updated}</span></footer>
  </main>;
}
