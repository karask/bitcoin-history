"use client";

import Link from "@/components/SiteLink";
import { sitePath } from "@/lib/site-path";
import { useEffect, useMemo, useState } from "react";
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
import priceContext from "@/content/price-context.json";

type ViewPreset = "curious" | "enthusiast" | "classroom";
type ScopePreset = "curated" | "all";

function PriceContext({ events }: { events: TimelineEvent[] }) {
  if (events.length < 2) return null;
  const monthly = priceContext.values as Record<string, number>;
  const logs = events.map((event) => Math.log10(Math.max(monthly[event.date.slice(0, 7)] ?? 0.01, 0.01)));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  const height = Math.max(325, events.length * 305);
  const points = logs.map((value, index) => {
    const x = 22 + ((value - min) / Math.max(max - min, 1)) * 176;
    const y = 12 + (index / (logs.length - 1)) * (height - 24);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  return <svg className="price-context-graphic" viewBox={`0 0 220 ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><filter id="price-glow" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    <path d={points} vectorEffect="non-scaling-stroke" filter="url(#price-glow)" />
  </svg>;
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

export default function TimelineExplorer({ events }: { events: TimelineEvent[] }) {
  // Derived from the archive rather than `new Date()`: a clock read during render can
  // disagree between server and client across a year boundary, which breaks hydration.
  const currentYear = useMemo(
    () => events.reduce((latest, event) => Math.max(latest, Number(event.date.slice(0, 4))), Number(FIRST_YEAR)),
    [events],
  );
  const [view, setView] = useState<ViewPreset>("curious");
  const [scope, setScope] = useState<ScopePreset>("curated");
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = readParams(currentYear);
      setView(params.view);
      setScope(params.scope);
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

  const activeFilterCount = categories.length
    + kinds.length
    + (query ? 1 : 0)
    + (from !== FIRST_YEAR ? 1 : 0)
    + (to !== String(currentYear) ? 1 : 0)
    + (place !== "all" ? 1 : 0)
    + (significance !== "all" ? 1 : 0)
    + (domain !== "all" ? 1 : 0)
    + (evidence !== "all" ? 1 : 0);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (view !== "curious") params.set("view", view);
    if (scope !== "curated") params.set("scope", scope);
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
  }, [ready, view, scope, categories, kinds, query, from, to, currentYear, place, significance, domain, evidence, showPrice]);

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
  presentationParams.set("setlist", activeFilterCount || scope === "all" ? "filtered" : "grand-tour");
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

  return <main>
    <a className="skip-link" href="#events">Skip to events</a>
    <header className="site-header">
      <Link className="brand" href={sitePath("/")} aria-label="Bitcoin Timechain home"><span className="brand-mark" aria-hidden="true">₿</span><span>BITCOIN TIMECHAIN</span></Link>
      <nav aria-label="Primary navigation">
        <a href="#explore">Explore</a>
        <Link href={sitePath(`/present?${presentationParams.toString()}`)}>Present</Link>
        <a href="#method">Method</a>
      </nav>
      <span className="archive-status"><i aria-hidden="true" /> ARCHIVE 1983—NOW</span>
    </header>

    <section className="hero" id="top">
      <div className="hero-grid" aria-hidden="true" />
      <p className="hero-kicker">THE HISTORY OF AN IDEA IN MOTION <span>01 / ORIGINS</span></p>
      <h1>History doesn’t move<br />in a <em>straight line.</em></h1>
      <div className="hero-orbit" aria-hidden="true"><div className="hero-coin">₿</div></div>
      <div className="hero-footer">
        <p>Follow the breakthroughs, arguments, crises, and unlikely moments that carried Bitcoin from a cryptography mailing list into world history.</p>
        <Link className="ride-button" href={sitePath(`/present?${presentationParams.toString()}`)}><b aria-hidden="true">▶</b><span><small>CINEMATIC MODE</small>Start the journey</span></Link>
      </div>
    </section>

    <section className="archive-intro" id="explore">
      <div><p className="eyebrow">EXPLORE THE ARCHIVE</p><h2>One chain. Hundreds<br />of turning points.</h2></div>
      <div className="archive-counts"><span><strong>{events.filter((event) => event.curated).length}</strong> CURATED</span><span><strong>{events.length}</strong> ALL EVENTS</span></div>
    </section>

    <section className="filter-shell" aria-label="Timeline controls">
      <div className="primary-filters">
        <label className="view-picker"><span className="sr-only">Audience view</span><select value={view} onChange={(event) => changeView(event.target.value as ViewPreset)}><option value="curious">CURIOUS PUBLIC</option><option value="enthusiast">ENTHUSIAST</option><option value="classroom">CLASSROOM / MUSEUM</option></select></label>
        <div className="scope-tabs" aria-label="Archive scope"><button className={scope === "curated" ? "active" : ""} onClick={() => setScope("curated")} aria-pressed={scope === "curated"} type="button">CURATED</button><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")} aria-pressed={scope === "all"} type="button">ALL EVENTS</button></div>
        <div className="category-pills" aria-label="Event categories"><button className={categories.length === 0 ? "active" : ""} onClick={() => setCategories([])} aria-pressed={categories.length === 0} type="button">ALL</button>{categoryIds.map((category) => <button className={categories.includes(category) ? "active" : ""} onClick={() => toggleCategory(category)} aria-pressed={categories.includes(category)} type="button" key={category}>{categoryShortLabels[category]}</button>)}</div>
        <button className={`more-button ${activeFilterCount ? "has-filters" : ""}`} onClick={() => setShowMore((open) => !open)} aria-expanded={showMore} aria-controls="advanced-filters" type="button">FILTERS{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
      </div>

      {showMore && <div className="advanced-filters" id="advanced-filters">
        <label className="search-field"><span>SEARCH</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pizza, Taproot, El Salvador…" type="search" /></label>
        <label><span>FROM</span><input min={FIRST_YEAR} max={currentYear} value={from} onChange={(event) => setFrom(event.target.value)} type="number" /></label>
        <label><span>TO</span><input min={FIRST_YEAR} max={currentYear} value={to} onChange={(event) => setTo(event.target.value)} type="number" /></label>
        <label><span>PLACE</span><select value={place} onChange={(event) => setPlace(event.target.value)}><option value="all">Everywhere</option><optgroup label="Region of the world">{placeOptions.continents.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="Country">{placeOptions.countries.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup><optgroup label="State or province">{placeOptions.subdivisions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup></select></label>
        <label><span>SIGNIFICANCE</span><select value={significance} onChange={(event) => setSignificance(event.target.value)}><option value="all">All levels</option><option value="landmark">Landmarks</option><option value="major">Major</option><option value="context">Context</option></select></label>
        <label><span>DOMAIN</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="all">Protocol + ecosystem</option><option value="protocol">Protocol only</option><option value="ecosystem">Ecosystem only</option></select></label>
        <label><span>EVIDENCE</span><select value={evidence} onChange={(event) => setEvidence(event.target.value)}><option value="all">All evidence states</option><option value="documented">Documented</option><option value="well-supported">Well supported</option><option value="disputed">Disputed</option><option value="estimated">Estimated</option></select></label>
        <div className="kind-filter"><span>WHAT HAPPENED</span><div className="kind-pills">{kindIds.map((kind) => <button className={kinds.includes(kind) ? "active" : ""} onClick={() => toggleKind(kind)} aria-pressed={kinds.includes(kind)} type="button" key={kind}>{kindLabels[kind]}</button>)}</div></div>
        <label className="price-toggle"><input checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} type="checkbox" /><span><b>PRICE CONTEXT</b> Approximate BTC/USD log curve</span></label>
        <button className="clear-button" onClick={clearFilters} type="button">CLEAR FILTERS</button>
      </div>}
    </section>

    <section className={`timeline-section ${showPrice ? "with-price" : ""}`} id="events" aria-labelledby="timeline-title">
      <div className="timeline-heading"><div><p className="eyebrow">VISIBLE CHAIN</p><p className="result-count" aria-live="polite">{filtered.length} of {events.length} events</p></div><h2 id="timeline-title">Every event, in its place.</h2><Link className="filtered-tour" href={sitePath(`/present?${presentationParams.toString()}`)}>PRESENT THESE RESULTS <span aria-hidden="true">▶</span></Link></div>
      {showPrice && <div className="price-key"><span>BTC / USD</span><b>LOG CONTEXT</b><a href={priceContext.source.documentation} target="_blank" rel="noreferrer">COIN METRICS PRICEUSD ↗</a><small>Monthly closing snapshots · checked 24 Aug 2026 · not investment data</small></div>}
      <div className="explorer-events">
        {showPrice && <PriceContext events={filtered} />}
        {filtered.length ? <ol>
          {filtered.map((event, index) => <li className={`timeline-event category-${event.category}`} key={event.slug}>
            <time dateTime={event.date}>{event.date.slice(0, 4)}</time>
            <div className="timeline-rail" aria-hidden="true"><i /></div>
            <article>
              <div className="event-meta"><span>{formatEventDate(event)}</span><span>{categoryShortLabels[event.category]}</span><span>{event.scope}</span><span>{String(index + 1).padStart(3, "0")}</span></div>
              <h3><Link href={sitePath(`/events/${event.slug}`)}>{event.title}</Link></h3>
              <p>{event.summary}</p>
              {view === "classroom" && <aside className="why-note"><b>WHY IT MATTERS</b>{event.whyItMatters}</aside>}
              {view === "enthusiast" && <div className="technical-row"><span>{event.evidence.replace("-", " ")}</span>{event.blockHeight !== undefined && <span>BLOCK {event.blockHeight.toLocaleString()}</span>}{event.bip !== undefined && <span>BIP {event.bip}</span>}{event.technicalNote && <span>{event.technicalNote}</span>}</div>}
              <Link className="read-record" href={sitePath(`/events/${event.slug}`)}>READ THE RECORD <span aria-hidden="true">↗</span></Link>
            </article>
          </li>)}
        </ol> : <div className="empty-state"><span>NO MATCHING BLOCKS</span><h3>The chain is quiet here.</h3><p>Widen the date range or remove a filter to bring events back into view.</p><button onClick={clearFilters} type="button">RESET THE TIMELINE</button></div>}
      </div>
    </section>

    <section className="method" id="method">
      <p className="eyebrow">HOW WE KNOW</p>
      <h2>History, with receipts.</h2>
      <div><p>Every record includes a direct source wherever one survives: blocks and transactions, BIPs and release notes, court records and enacted laws.</p><p>Claims are labelled when dates are estimated or interpretations are disputed. Exchange failures are never described as protocol failures.</p><p>The archive is editorially reviewed, versioned, and designed to accept corrections without silently rewriting the past.</p></div>
    </section>
    <footer className="site-footer"><span>BITCOIN TIMECHAIN</span><span>ENGLISH · TRANSLATION READY</span><span>UPDATED 24 AUG 2026</span></footer>
  </main>;
}
