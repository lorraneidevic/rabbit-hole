/* Rabbit Hole
 * A finite curiosity feed. One thread at a time: an article, a book, a podcast.
 * Data: Wikipedia (articles) · Open Library (books) · iTunes Search (podcasts).
 * No key, no backend, no infinite scroll.
 */

const DAILY_LIMIT = 12;
const STORE_KEY = "rabbit-hole.v1";

const TOPICS = [
  {
    id: "japan", label: "History of Japan", color: "#c0392b",
    articles: ["History of Japan", "Edo period", "Meiji Restoration", "Heian period",
      "Sengoku period", "Tokugawa shogunate", "Samurai", "Bushido"],
    bookQuery: "history of japan", podcastQuery: "japanese history",
  },
  {
    id: "china", label: "History of China", color: "#d68910",
    articles: ["History of China", "Tang dynasty", "Han dynasty", "Ming dynasty",
      "Qin dynasty", "Three Kingdoms", "Forbidden City", "Great Wall of China"],
    bookQuery: "history of china", podcastQuery: "chinese history",
  },
  {
    id: "ww1", label: "World War I", color: "#7b6d55",
    articles: ["World War I", "Assassination of Archduke Franz Ferdinand", "Trench warfare",
      "Battle of the Somme", "Treaty of Versailles", "Gallipoli campaign",
      "Zimmermann Telegram", "Battle of Verdun"],
    bookQuery: "world war i", podcastQuery: "world war one history",
  },
  {
    id: "ww2", label: "World War II", color: "#5b6c3a",
    articles: ["World War II", "Operation Barbarossa", "Battle of Stalingrad",
      "Normandy landings", "Manhattan Project", "Attack on Pearl Harbor",
      "The Holocaust", "Dunkirk evacuation"],
    bookQuery: "world war ii", podcastQuery: "world war two history",
  },
  {
    id: "wars", label: "Wars & conflict", color: "#6c5b7b",
    articles: ["Military history", "Napoleonic Wars", "Crusades", "Punic Wars",
      "Vietnam War", "Cold War", "Crimean War", "Thirty Years' War"],
    bookQuery: "military history", podcastQuery: "military history",
  },
  {
    id: "brazil", label: "History of Brazil", color: "#1f8a4c",
    articles: ["History of Brazil", "Empire of Brazil", "Getúlio Vargas", "Colonial Brazil",
      "Brazilian military dictatorship", "Palmares (quilombo)", "Bossa nova", "Rio de Janeiro"],
    bookQuery: "history of brazil", podcastQuery: "brazil history",
  },
  {
    id: "space", label: "Space", color: "#2a5d9f",
    articles: ["Space exploration", "Apollo 11", "International Space Station", "Voyager 1",
      "Space Race", "Black hole", "Mars rover", "Hubble Space Telescope"],
    bookQuery: "space exploration", podcastQuery: "space exploration",
  },
  {
    id: "physics", label: "Physics", color: "#0f6f7a",
    articles: ["Physics", "Quantum mechanics", "Theory of relativity", "Standard Model",
      "Entropy", "Thermodynamics", "Electromagnetism", "Gravitational wave"],
    bookQuery: "physics", podcastQuery: "physics",
  },
  {
    id: "curiosity", label: "Curiosity itself", color: "#a04b8f",
    articles: ["Curiosity", "Serendipity", "Wonder (emotion)", "Flow (psychology)",
      "Information seeking", "Lateral thinking", "Wanderlust", "Epistemology"],
    bookQuery: "curiosity", podcastQuery: "curiosity",
  },
];

const $ = (id) => document.getElementById(id);

/* ---------------- state ---------------- */
function todayKey() { return new Date().toISOString().slice(0, 10); }

let state = load();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* ignore */ }
  const base = { trail: [], day: todayKey(), count: 0, total: 0 };
  s = Object.assign(base, s || {});
  if (s.day !== todayKey()) { s.day = todayKey(); s.count = 0; }
  if (!Array.isArray(s.trail)) s.trail = [];
  return s;
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/* ---------------- helpers ---------------- */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function truncate(text, max = 340) {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd()) + "…";
}

/* ---------------- fetchers ---------------- */
async function fetchArticle(title) {
  const data = await getJSON(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  if (!data.extract) throw new Error("no extract");
  return {
    title: data.title || title,
    extract: truncate(data.extract),
    url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

async function fetchBook(articleTitle, topicQuery) {
  // Try a book specific to the article first; fall back to the broad topic
  // if there aren't enough English-language matches.
  const queries = [articleTitle, topicQuery];
  for (const q of queries) {
    try {
      const data = await getJSON(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
        `&language=eng&limit=50&fields=title,author_name,first_publish_year,cover_i,key,edition_count`
      );
      const docs = (data.docs || []).filter((d) => d.title);
      if (docs.length < 3) continue;
      const withCover = docs.filter((d) => d.cover_i);
      // Prefer widely-held books: edition_count is a rough popularity signal.
      const pool = (withCover.length ? withCover : docs)
        .sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
      const b = pick(pool.slice(0, 8));
      return {
        title: b.title,
        meta: [b.author_name?.[0], b.first_publish_year].filter(Boolean).join(" · ") || "Open Library",
        cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
        url: `https://openlibrary.org${b.key}`,
      };
    } catch { /* try next query */ }
  }
  return null;
}

async function fetchPodcast(query) {
  try {
    const data = await getJSON(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}` +
      `&media=podcast&entity=podcast&limit=25&country=US`
    );
    let results = (data.results || []).filter((r) => r.collectionName);
    if (!results.length) return null;
    // Keep iTunes' relevance order; just drop tiny/one-episode shows and take the top few.
    const solid = results.filter((r) => (r.trackCount || 0) >= 5);
    results = (solid.length ? solid : results).slice(0, 8);
    const p = pick(results);
    return {
      title: p.collectionName,
      meta: [p.artistName, p.trackCount ? `${p.trackCount} episodes` : null].filter(Boolean).join(" · "),
      url: p.collectionViewUrl,
      feed: p.feedUrl || null,
    };
  } catch {
    return null;
  }
}

/* ---------------- rendering ---------------- */
function setBusy() {
  $("card").innerHTML = `
    <div class="card-inner skeleton">
      <div class="sk-line w40"></div>
      <div class="sk-line w90"></div>
      <div class="sk-line w90"></div>
      <div class="sk-line w70"></div>
      <div class="sk-block"></div>
      <div class="sk-block"></div>
    </div>`;
  $("save-btn").disabled = true;
}

function setError(message) {
  $("card").innerHTML = `
    <div class="error-box">
      <p>That thread came up empty.</p>
      <p style="font-size:13px">${esc(message)}</p>
      <button class="action primary" id="retry-btn">Try again</button>
    </div>`;
  $("retry-btn").addEventListener("click", () => newCard({ count: false }));
}

function renderCard(card) {
  const tpl = $("card-tpl").content.cloneNode(true);
  const set = (name, value) => {
    const el = tpl.querySelector(`[data-el="${name}"]`);
    if (el) el.textContent = value ?? "";
  };
  const node = tpl.querySelector(".card-inner");
  node.style.setProperty("--chip", card.color);
  set("tag", card.topicLabel);
  set("title", card.wiki.title);
  set("extract", card.wiki.extract);

  const wikiLink = tpl.querySelector('[data-el="wiki-link"]');
  wikiLink.href = card.wiki.url;

  const bookEl = tpl.querySelector('[data-el="book"]');
  if (card.book) {
    set("book-title", card.book.title);
    set("book-meta", card.book.meta);
    bookEl.href = card.book.url;
  } else {
    bookEl.hidden = true;
  }

  const podEl = tpl.querySelector('[data-el="pod"]');
  if (card.podcast) {
    set("pod-title", card.podcast.title);
    set("pod-meta", card.podcast.meta);
    podEl.href = card.podcast.url;
  } else {
    podEl.hidden = true;
  }

  const saveBtn = tpl.querySelector('[data-el="card-save"]');
  const isSaved = state.trail.some((t) => t.id === card.id);
  saveBtn.classList.toggle("on", isSaved);
  saveBtn.textContent = isSaved ? "★" : "☆";
  saveBtn.addEventListener("click", () => toggleSave(card, saveBtn));

  $("card").replaceChildren(node);
  $("save-btn").disabled = false;
  $("save-btn").querySelector(".ico").textContent = isSaved ? "★" : "☆";
  syncSaveButton(card);
}

let currentCard = null;

function syncSaveButton(card) {
  const saved = card && state.trail.some((t) => t.id === card.id);
  const btn = $("save-btn");
  btn.querySelector(".ico").textContent = saved ? "★" : "☆";
  btn.querySelector(".lbl").textContent = saved ? "Saved" : "Save";
}

function toggleSave(card, cardBtn) {
  const i = state.trail.findIndex((t) => t.id === card.id);
  if (i >= 0) state.trail.splice(i, 1);
  else state.trail.unshift(card);
  save();
  const saved = state.trail.some((t) => t.id === card.id);
  if (cardBtn) { cardBtn.classList.toggle("on", saved); cardBtn.textContent = saved ? "★" : "☆"; }
  syncSaveButton(card);
  updateTrailCount();
  renderTrail();
}

/* ---------------- flow ---------------- */
let selectedTopicId = null; // null = surprise me
let busy = false;

async function newCard(opts = {}) {
  const shouldCount = opts.count !== false;
  if (busy) return;
  if (state.count >= DAILY_LIMIT) { renderLimit(); return; }
  busy = true;
  setBusy();

  try {
    let card = null;
    let lastErr = null;

    // A few tries: some article titles 404 or have no summary.
    for (let attempt = 0; attempt < 3 && !card; attempt++) {
      const topics = selectedTopicId ? TOPICS.filter((t) => t.id === selectedTopicId) : TOPICS;
      const topic = pick(topics.length ? topics : TOPICS);
      const article = pick(topic.articles);
      try {
        const [wiki, book, podcast] = await Promise.all([
          fetchArticle(article),
          fetchBook(article, topic.bookQuery),
          fetchPodcast(topic.podcastQuery),
        ]);
        card = {
          id: uid(), topicId: topic.id, topicLabel: topic.label, color: topic.color,
          wiki, book, podcast, savedAt: Date.now(),
        };
      } catch (e) {
        lastErr = e;
      }
    }

    if (!card) throw lastErr || new Error("No article found");

    currentCard = card;
    if (shouldCount) state.count += 1;
    state.total += 1;
    save();
    renderCard(currentCard);
    updateMeter();
    if (card.book?.cover) { const img = new Image(); img.src = card.book.cover; }
  } catch (err) {
    setError(err.message || "Network error");
  } finally {
    busy = false;
  }
}

function renderLimit() {
  $("card").innerHTML = `
    <div class="error-box">
      <p style="font-size:40px;margin:0">🌙</p>
      <p><strong>That's your fill for today.</strong></p>
      <p style="font-size:13.5px">You explored ${state.count} threads. Resting is part of the point —
      come back tomorrow and the well refills.</p>
      <button class="action ghost" id="one-more-btn">One more won't hurt</button>
    </div>`;
  $("one-more-btn").addEventListener("click", () => {
    state.count = DAILY_LIMIT - 1; save(); updateMeter(); newCard();
  });
}

/* ---------------- meter + trail ---------------- */
function updateMeter() {
  $("meter-text").textContent = `${state.count} / ${DAILY_LIMIT}`;
  $("meter").classList.toggle("full", state.count >= DAILY_LIMIT);
}

function updateTrailCount() {
  $("trail-count").textContent = String(state.trail.length);
}

function renderTrail() {
  const body = $("drawer-body");
  updateTrailCount();
  $("drawer-sub").textContent = state.trail.length
    ? `${state.trail.length} saved thread${state.trail.length > 1 ? "s" : ""} to come back to.`
    : "Things you save will land here.";

  if (!state.trail.length) {
    body.innerHTML = `<div class="empty-trail">Nothing saved yet.<br>Tap ☆ on a thread to keep it.</div>`;
    return;
  }

  body.innerHTML = state.trail.map((t) => `
    <div class="trail-item" data-id="${esc(t.id)}">
      <span class="t-tag" style="color:${esc(t.color)}">${esc(t.topicLabel)}</span>
      <h3>${esc(t.wiki.title)}</h3>
      <div class="t-row">
        <a href="${esc(t.wiki.url)}" target="_blank" rel="noopener">Wikipedia</a>
        ${t.book ? `<a href="${esc(t.book.url)}" target="_blank" rel="noopener">📖 Book</a>` : ""}
        ${t.podcast ? `<a href="${esc(t.podcast.url)}" target="_blank" rel="noopener">🎧 Podcast</a>` : ""}
        <button class="trail-remove" data-remove="${esc(t.id)}">Remove</button>
      </div>
    </div>`).join("");

  body.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove");
      const i = state.trail.findIndex((t) => t.id === id);
      if (i >= 0) state.trail.splice(i, 1);
      save();
      renderTrail();
      if (currentCard && currentCard.id === id) syncSaveButton(currentCard);
    });
  });
}

/* ---------------- chips ---------------- */
function renderChips() {
  const nav = $("chips");
  nav.innerHTML = "";
  const surprise = document.createElement("button");
  surprise.className = "chip surprise";
  surprise.textContent = "✨ Surprise me";
  surprise.addEventListener("click", () => { selectedTopicId = null; renderChips(); newCard(); });
  surprise.setAttribute("aria-pressed", String(selectedTopicId === null));
  nav.appendChild(surprise);

  for (const t of TOPICS) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = t.label;
    chip.style.setProperty("--chip", t.color);
    chip.addEventListener("click", () => { selectedTopicId = t.id; renderChips(); newCard(); });
    chip.setAttribute("aria-pressed", String(selectedTopicId === t.id));
    nav.appendChild(chip);
  }
}

/* ---------------- drawer ---------------- */
function openDrawer() { $("drawer").hidden = false; $("scrim").hidden = false; renderTrail(); }
function closeDrawer() { $("drawer").hidden = true; $("scrim").hidden = true; }

/* ---------------- init ---------------- */
function init() {
  renderChips();
  updateMeter();
  updateTrailCount();

  $("next-btn").addEventListener("click", newCard);
  $("save-btn").addEventListener("click", () => { if (currentCard) toggleSave(currentCard); });
  $("trail-btn").addEventListener("click", openDrawer);
  $("drawer-close").addEventListener("click", closeDrawer);
  $("scrim").addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "n" || e.key === " ") { e.preventDefault(); newCard(); }
    if (e.key === "Escape") closeDrawer();
  });

  newCard({ count: false });
}

init();
