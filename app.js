const EXPENSE_CATS = [
  { id: "alim", name: "Alimentation", color: "--c1" },
  { id: "transport", name: "Transport", color: "--c2" },
  { id: "logement", name: "Logement", color: "--c3" },
  { id: "loisirs", name: "Loisirs", color: "--c4" },
  { id: "sante", name: "Santé", color: "--c5" },
  { id: "shopping", name: "Shopping", color: "--c6" },
  { id: "factures", name: "Factures & abonnements", color: "--c7" },
  { id: "autre", name: "Autre dépense", color: "--c8" },
];
const INCOME_CATS = [
  { id: "salaire", name: "Salaire", color: "--c3" },
  { id: "prime", name: "Prime", color: "--c1" },
  { id: "extra", name: "Petits boulots & extras", color: "--c4" },
  { id: "aides", name: "Aides & allocations", color: "--c7" },
  { id: "rembours", name: "Remboursements", color: "--c5" },
  { id: "autre-rev", name: "Autre revenu", color: "--c2" },
];
const SAVING_CATS = [
  { id: "urgence", name: "Fonds d'urgence", color: "--c1", target: 3000 },
  { id: "projets", name: "Projets & vacances", color: "--c4", target: 0 },
];
const PALETTE = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6", "--c7", "--c8"];
const PROTECTED = ["autre", "autre-rev"];
const defaultCats = () => JSON.parse(JSON.stringify({ expense: EXPENSE_CATS, income: INCOME_CATS, saving: SAVING_CATS }));
const TYPE_NAMES = { expense: "dépense", income: "revenu", saving: "épargne" };
const KEY = "carnet-depenses-v2", OLD_KEY = "carnet-depenses-v1";
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(s + "T12:00");
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const catsOf = type => state.cats[type] || [];
const catById = id => [...catsOf("expense"), ...catsOf("income"), ...catsOf("saving")].find(c => c.id === id) || { id, name: "Catégorie supprimée", color: "--c8" };
// Effet d'une opération sur le portefeuille : + revenus, − dépenses, − mise de côté, + retrait d'épargne
const walletEffect = t => t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : t.dir === "out" ? t.amount : -t.amount;
const savedEffect = t => t.type !== "saving" ? 0 : t.dir === "out" ? -t.amount : t.amount;
const color = c => `var(${PALETTE.includes(c.color) ? c.color : "--c8"})`;

function sampleData() {
  const now = new Date(), out = [];
  for (let back = 2; back >= 0; back--) {
    const y = now.getFullYear(), m = now.getMonth() - back;
    const last = back === 0 ? now.getDate() : new Date(y, m + 1, 0).getDate();
    const add = (d, type, amount, desc, cat) => { if (d <= last) out.push({ id: `ex${back}-${out.length}`, type, amount, desc, cat, date: isoDate(new Date(y, m, d)), sample: true }); };
    add(3, "expense", 48.6 + back * 7, "Courses", "alim");
    add(5, "expense", 55, "Plein d'essence", "transport");
    add(9, "expense", 27.5 + back * 5, "Cinéma et resto", "loisirs");
    add(10, "expense", 63.2 - back * 4, "Courses de la semaine", "alim");
    add(12, "expense", 14, "Pharmacie", "sante");
    add(14, "income", 120 + back * 40, "Baby-sitting", "extra");
    add(17, "expense", 39.9 + back * 12, "Vêtements", "shopping");
    add(19, "expense", 71.4, "Courses", "alim");
    add(22, "expense", 92, "Électricité", "factures");
    add(26, "expense", 44 + back * 9, "Sortie entre amis", "loisirs");
    if (back === 1) out.push({ id: "exs1", type: "saving", dir: "in", amount: 80, desc: "Pour l'été", cat: "projets", date: isoDate(new Date(y, m, 20)), sample: true });
  }
  return out;
}
function sampleRules() {
  const now = new Date(), s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const start = `${s.getFullYear()}-${pad(s.getMonth() + 1)}`;
  return [
    { id: "exr1", type: "income", amount: 2100, desc: "Salaire", cat: "salaire", day: 1, start, end: null, skip: [], sample: true },
    { id: "exr2", type: "expense", amount: 650, desc: "Loyer", cat: "logement", day: 1, start, end: null, skip: [], sample: true },
    { id: "exr3", type: "expense", amount: 19.99, desc: "Abonnement téléphone", cat: "factures", day: 6, start, end: null, skip: [], sample: true },
    { id: "exr4", type: "saving", dir: "in", amount: 150, desc: "Virement épargne", cat: "urgence", day: 2, start, end: null, skip: [], sample: true },
  ];
}

// ---------- Validation des données (saisie, cache local, synchro) ----------
// Toute donnée relue est considérée comme non fiable : on ne garde que ce qui respecte le format attendu.
const LIMITS = { amount: 1e9, desc: 80, catName: 40, catsPerType: 60, tx: 20000, rec: 200 };
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/, MONTH_RE = /^\d{4}-\d{2}$/;
const TYPES = ["expense", "income", "saving"];
const cleanText = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, max) : "";
const cleanAmount = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= LIMITS.amount ? Math.round(n * 100) / 100 : null; };
const cleanMoney = (v, min = -LIMITS.amount) => { const n = Number(v); return Number.isFinite(n) ? Math.min(LIMITS.amount, Math.max(min, Math.round(n * 100) / 100)) : 0; };
function validDate(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number), dt = new Date(y, m - 1, d);
  return y >= 1970 && y <= 2100 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const validMonth = v => typeof v === "string" && MONTH_RE.test(v) && +v.slice(5) >= 1 && +v.slice(5) <= 12;
function cleanOp(o) {
  if (!o || typeof o !== "object" || !ID_RE.test(o.id) || !TYPES.includes(o.type) || !ID_RE.test(o.cat)) return null;
  const amount = cleanAmount(o.amount); if (amount === null) return null;
  const out = { id: o.id, type: o.type, amount, desc: cleanText(o.desc, LIMITS.desc), cat: o.cat };
  if (o.type === "saving") out.dir = o.dir === "out" ? "out" : "in";
  if (validMonth(o.period)) out.period = o.period;
  if (o.sample === true) out.sample = true;
  return out;
}
function cleanTx(t) { const o = cleanOp(t); if (!o || !validDate(t.date)) return null; o.date = t.date; return o; }
function cleanRule(rl) {
  const o = cleanOp(rl); if (!o || !validMonth(rl.start)) return null;
  const day = Math.trunc(Number(rl.day)); if (!(day >= 1 && day <= 31)) return null;
  delete o.period;
  const offset = Math.trunc(Number(rl.offset)) || 0;
  const overrides = {};
  if (rl.overrides && typeof rl.overrides === "object") for (const [mk, v] of Object.entries(rl.overrides).slice(0, 600)) { const a = cleanAmount(v); if (validMonth(mk) && a !== null) overrides[mk] = a; }
  return { ...o, day, start: rl.start, end: validMonth(rl.end) ? rl.end : null, skip: Array.isArray(rl.skip) ? rl.skip.filter(validMonth).slice(0, 600) : [],
    offset: Math.max(-12, Math.min(12, offset)), overrides };
}
function cleanCats(raw) {
  const def = defaultCats(), out = {};
  for (const k of TYPES) {
    const list = raw && Array.isArray(raw[k]) ? raw[k] : def[k], seen = new Set();
    out[k] = list.map(c => {
      if (!c || !ID_RE.test(c.id) || seen.has(c.id)) return null;
      const name = cleanText(c.name, LIMITS.catName); if (!name) return null;
      seen.add(c.id);
      const cat = { id: c.id, name, color: PALETTE.includes(c.color) ? c.color : "--c8" };
      if (k === "saving") cat.target = cleanMoney(c.target, 0);
      return cat;
    }).filter(Boolean).slice(0, LIMITS.catsPerType);
  }
  // Les catégories « Autre » servent de repli : elles existent toujours
  for (const [k, id] of [["expense", "autre"], ["income", "autre-rev"]]) if (!out[k].some(c => c.id === id)) out[k].push(def[k].find(c => c.id === id));
  return out;
}
function cleanState(raw) {
  const st = raw && typeof raw === "object" ? raw : {};
  return {
    tx: (Array.isArray(st.tx) ? st.tx : []).map(cleanTx).filter(Boolean).slice(0, LIMITS.tx),
    rec: (Array.isArray(st.rec) ? st.rec : []).map(cleanRule).filter(Boolean).slice(0, LIMITS.rec),
    cats: cleanCats(st.cats),
    budget: cleanMoney(st.budget, 0),
    start: cleanMoney(st.start),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return cleanState(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      const real = (Array.isArray(o.expenses) ? o.expenses : []).filter(e => e && !e.sample).map(e => cleanTx({ ...e, type: "expense" })).filter(Boolean);
      return real.length ? { tx: real, rec: [], cats: defaultCats(), budget: o.budget ?? 1200, start: 0 } : { tx: sampleData(), rec: sampleRules(), cats: defaultCats(), budget: o.budget ?? 1200, start: 0 };
    }
  } catch {}
  return { tx: sampleData(), rec: sampleRules(), cats: defaultCats(), budget: 1200, start: 0 };
}
let state = load();
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
function save() { saveLocal(); scheduleFlush(); }

// ---------- Synchronisation avec le compte claude.ai ----------
// Chaque personne a son propre espace privé : data/users/<id>/settings (récurrentes, catégories, budget, solde de départ)
// et un document par mois data/users/<id>/m-AAAA-MM (opérations du mois).
const cloud = { col: null, bodies: {}, ready: false, writing: false, again: false, timer: null, recent: {} };
const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v);
function setSync(mode) {
  const txt = { local: "Sur cet appareil seulement", busy: "Synchronisation…", on: "Synchronisé avec votre compte", error: "Synchro interrompue, gardé sur cet appareil" }[mode];
  $("sync").dataset.s = mode; $("syncText").textContent = txt;
  $("storeHint").textContent = mode === "local" ? "Vos opérations restent dans ce navigateur, sur cet appareil."
    : (window.CARNET_BACKEND && window.CARNET_BACKEND.hint) || "Vos opérations sont enregistrées dans votre compte claude.ai, en privé. Ouvrez ce même lien sur votre téléphone pour les retrouver.";
}
function docsFromState() {
  const out = { settings: { rec: state.rec.filter(r => !r.sample), cats: state.cats, budget: Number(state.budget) || 0, start: Number(state.start) || 0 } };
  for (const t of state.tx) {
    if (t.sample) continue;
    const { sample, ...clean } = t;
    const mk0 = "m-" + t.date.slice(0, 7); if (!out[mk0]) out[mk0] = { tx: [] }; out[mk0].tx.push(clean);
  }
  return out;
}
function scheduleFlush() {
  if (!cloud.ready) return;
  clearTimeout(cloud.timer);
  setSync("busy");
  cloud.timer = setTimeout(() => { cloud.timer = null; flush(); }, 600);
}
async function flush() {
  if (cloud.writing) { cloud.again = true; return; }
  cloud.writing = true;
  try {
    do {
      cloud.again = false;
      const want = docsFromState();
      for (const k of new Set([...Object.keys(want), ...Object.keys(cloud.bodies)])) {
        const w = want[k] ? canon(want[k]) : null, h = cloud.bodies[k] ? canon(cloud.bodies[k]) : null;
        if (w === h) continue;
        if (w) { await cloud.col.doc(k).set(want[k]); cloud.bodies[k] = want[k]; }
        else { await cloud.col.doc(k).delete(); delete cloud.bodies[k]; }
        cloud.recent[k] = { body: w, at: Date.now() };
      }
    } while (cloud.again);
    setSync("on");
  } catch (e) {
    console.warn("Synchro", e && e.code);
    setSync("error");
    if (e && e.code === "quota_exceeded") toast("Espace de stockage plein : supprimez d'anciennes opérations.");
  } finally { cloud.writing = false; }
}
function applyCloud(bodies) {
  const b = JSON.parse(JSON.stringify(bodies));
  const st = b.settings && typeof b.settings === "object" ? b.settings : {};
  state = cleanState({
    tx: Object.keys(b).filter(k => /^m-\d{4}-\d{2}$/.test(k)).flatMap(k => Array.isArray(b[k].tx) ? b[k].tx : []),
    rec: st.rec, cats: st.cats, budget: st.budget ?? state.budget, start: st.start,
  });
  saveLocal(); pendingDelete = null; render();
}
// Une autre version de l'appli (par exemple sur GitHub Pages) peut fournir son propre stockage
// via window.CARNET_BACKEND, avec la même interface : doc(id).set / doc(id).delete / onSnapshot.
async function openCollection() {
  if (window.CARNET_BACKEND) return window.CARNET_BACKEND.collection();
  if (!window.claude?.use) return null;
  const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
  const uid = user && await user.id();
  return db && uid ? db.collection("data/users/" + uid) : null;
}
async function startSync() {
  try {
    const col = await openCollection();
    if (!col) return;
    cloud.col = col;
    setSync("busy");
    cloud.col.onSnapshot(snap => {
      const bodies = {};
      snap.docs.forEach(d => { bodies[d.id] = d.data(); });
      if (!cloud.ready) {
        cloud.ready = true;
        cloud.bodies = bodies;
        // Premier lancement synchronisé : on envoie ce qui est déjà noté sur cet appareil
        if (snap.empty) { if (state.tx.some(t => !t.sample) || state.rec.some(r => !r.sample)) flush(); else setSync("on"); return; }
        applyCloud(bodies); setSync("on"); return;
      }
      // Ignore un instantané plus ancien que nos propres écritures récentes (sinon une catégorie tout juste créée disparaîtrait)
      const stale = Object.entries(cloud.recent).some(([k, r]) => Date.now() - r.at < 15000 && (bodies[k] ? canon(bodies[k]) : null) !== r.body);
      if (stale) return;
      cloud.bodies = bodies;
      if (!cloud.writing && !cloud.timer && !snap.metadata.hasPendingWrites) applyCloud(bodies);
    }, () => setSync("error"));
  } catch (e) { console.warn("Synchro indisponible", e && e.code); }
}

let pref = {};
try { pref = JSON.parse(localStorage.getItem(KEY + "-ui") || "{}"); } catch {}
const ui = { gran: pref.gran || "month", anchor: new Date(), cat: "", search: "", type: "", formType: "expense", cmKind: "expense", rankBy: pref.rankBy || "month" };
let pendingDelete = null;

// ---------- Opérations récurrentes ----------
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
// Génère les occurrences mensuelles de chaque règle jusqu'à la date "until" (incluse)
function allTx(until) {
  const out = state.tx.slice();
  for (const rule of state.rec) {
    const [sy, sm] = rule.start.split("-").map(Number);
    for (let d = new Date(sy, sm - 1, 1); ; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const mk = monthKey(d);
      if (rule.end && mk > rule.end) break;
      const day = Math.min(rule.day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
      const date = isoDate(new Date(d.getFullYear(), d.getMonth(), day));
      if (date > until) break;
      if (rule.skip.includes(mk)) continue;
      const per = rule.offset ? monthKey(new Date(d.getFullYear(), d.getMonth() + rule.offset, 1)) : undefined;
      out.push({ id: `r:${rule.id}:${mk}`, type: rule.type, dir: rule.dir, amount: rule.overrides?.[mk] ?? rule.amount, edited: rule.overrides?.[mk] != null, desc: rule.desc, cat: rule.cat, date, period: per, sample: rule.sample, recurring: true });
    }
  }
  return out;
}

// Date « comptable » : le mois concerné quand il diffère du mois de la date réelle (ex. salaire de septembre versé le 1er octobre)
const eff = t => t.period && t.period !== t.date.slice(0, 7) ? t.period + "-01" : t.date;
const monthLabel = mk => { const t = parseDate(mk + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };

// ---------- Périodes ----------
function periodRange() {
  const a = ui.anchor;
  if (ui.gran === "week") {
    const s = new Date(a.getFullYear(), a.getMonth(), a.getDate() - ((a.getDay() + 6) % 7));
    return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)];
  }
  if (ui.gran === "month") return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 0)];
  return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear(), 11, 31)];
}
function periodLabel([s, e]) {
  if (ui.gran === "week") {
    const sameMonth = s.getMonth() === e.getMonth();
    const left = s.toLocaleDateString("fr-FR", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
    return `Semaine du ${left} au ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (ui.gran === "month") { const t = s.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); }
  return String(s.getFullYear());
}
function shift(dir) {
  const a = ui.anchor;
  ui.anchor = ui.gran === "week" ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * dir)
    : ui.gran === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
    : new Date(a.getFullYear() + dir, 0, 1);
  pendingDelete = null; render();
}
function buckets([s, e]) {
  const out = [];
  if (ui.gran === "year") {
    for (let m = 0; m < 12; m++) {
      const d = new Date(s.getFullYear(), m, 1);
      out.push({ from: isoDate(d), to: isoDate(new Date(s.getFullYear(), m + 1, 0)), short: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""), long: d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) });
    }
  } else {
    for (let d = new Date(s); d <= e; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const k = isoDate(d);
      out.push({ from: k, to: k, short: ui.gran === "week" ? d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "") + " " + d.getDate() : String(d.getDate()), long: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) });
    }
  }
  return out;
}

// ---------- Rendu ----------
function fillCatSelect() {
  const prev = $("cat").value;
  const newLabel = { expense: "+ Nouvelle catégorie…", income: "+ Nouvelle source de revenu…", saving: "+ Nouvelle épargne…" }[ui.formType];
  $("cat").innerHTML = catsOf(ui.formType).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("") + `<option value="__new">${newLabel}</option>`;
  if (prev === "__new" || catsOf(ui.formType).some(c => c.id === prev)) $("cat").value = prev;
  else if (!catsOf(ui.formType).length) $("cat").value = "__new";
  $("newCatRow").hidden = $("cat").value !== "__new";
  $("desc").placeholder = { income: "Salaire, prime, vente…", expense: "Courses, café, essence…", saving: "Virement épargne, cagnotte…" }[ui.formType];
  $("submitBtn").textContent = { income: "Ajouter le revenu", expense: "Ajouter la dépense", saving: "Enregistrer le mouvement" }[ui.formType];
  $("catLabel").textContent = ui.formType === "saving" ? "Épargne" : "Catégorie";
  $("dirRow").hidden = ui.formType !== "saving";
  document.querySelectorAll(".type-toggle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.type === ui.formType)));
}
function fillFilterSelect() {
  const opts = list => list.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("filterCat").innerHTML = `<option value="">Toutes les catégories</option>`
    + `<optgroup label="Dépenses">${opts(catsOf("expense"))}</optgroup>`
    + `<optgroup label="Revenus">${opts(catsOf("income"))}</optgroup>`
    + `<optgroup label="Épargne">${opts(catsOf("saving"))}</optgroup>`;
  if (![...$("filterCat").options].some(o => o.value === ui.cat)) ui.cat = "";
  $("filterCat").value = ui.cat;
}
$("date").value = isoDate(new Date());
// Sélecteurs « mois concerné » : suivent la date tant que l'utilisateur ne les a pas changés
const MONTHS = Array.from({ length: 12 }, (_, i) => { const t = new Date(2020, i, 1).toLocaleDateString("fr-FR", { month: "long" }); return t[0].toUpperCase() + t.slice(1); });
let perTouched = false;
function fillPeriodSelects() {
  const y = new Date().getFullYear(), d = $("date").value || isoDate(new Date());
  $("perMonth").innerHTML = MONTHS.map((m, i) => `<option value="${pad(i + 1)}">${m}</option>`).join("");
  $("perYear").innerHTML = Array.from({ length: 8 }, (_, i) => y - 5 + i).map(v => `<option value="${v}">${v}</option>`).join("");
  syncPeriodToDate(d);
}
function syncPeriodToDate(d) {
  if (perTouched || !validDate(d)) return;
  $("perMonth").value = d.slice(5, 7);
  if (![...$("perYear").options].some(o => o.value === d.slice(0, 4))) $("perYear").insertAdjacentHTML("beforeend", `<option value="${esc(d.slice(0, 4))}">${esc(d.slice(0, 4))}</option>`);
  $("perYear").value = d.slice(0, 4);
}
$("date").addEventListener("change", () => syncPeriodToDate($("date").value));
$("perMonth").addEventListener("change", () => { perTouched = true; });
$("perYear").addEventListener("change", () => { perTouched = true; });
fillPeriodSelects();

const sum = list => list.reduce((s, t) => s + t.amount, 0);

function render() {
  document.querySelectorAll("#gran button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.g === ui.gran)));
  const range = periodRange();
  const [from, to] = range.map(isoDate);
  $("periodLabel").textContent = periodLabel(range);

  // Solde du portefeuille (toutes opérations jusqu'à aujourd'hui, sans filtre)
  const todayIso = isoDate(new Date());
  const mEnd = isoDate(new Date(ui.anchor.getFullYear(), ui.anchor.getMonth() + 1, 0));
  const horizon = [to, mEnd, todayIso].sort().pop(), hz = parseDate(horizon);
  const all = allTx(isoDate(new Date(hz.getFullYear(), hz.getMonth() + 2, 0)));
  const past = all.filter(t => t.date <= todayIso);
  const wallet = (Number(state.start) || 0) + past.reduce((s, t) => s + walletEffect(t), 0);
  $("wallet").textContent = eur.format(wallet);
  $("wallet").className = "big " + (wallet < 0 ? "neg" : "");
  const future = state.tx.filter(t => t.date > todayIso).length;  // les récurrentes à venir ne sont pas signalées
  $("walletHint").textContent = future ? `${future} opération${future > 1 ? "s" : ""} à venir non comptée${future > 1 ? "s" : ""}` : "Revenus moins dépenses et épargne, depuis le début";

  // Opérations de la période + filtre catégorie
  const inPeriod = all.filter(t => eff(t) >= from && eff(t) <= to && (!ui.cat || t.cat === ui.cat));
  const inc = inPeriod.filter(t => t.type === "income"), exp = inPeriod.filter(t => t.type === "expense"), sav = inPeriod.filter(t => t.type === "saving");
  const savedNet = sav.reduce((s, t) => s + savedEffect(t), 0);
  const totInc = sum(inc), totExp = sum(exp), net = totInc - totExp;
  $("kIncome").textContent = eur.format(totInc);
  $("kIncomeN").textContent = `${inc.length} revenu${inc.length > 1 ? "s" : ""}`;
  $("kExpense").textContent = eur.format(totExp);
  $("kExpenseN").textContent = `${exp.length} dépense${exp.length > 1 ? "s" : ""}`;
  $("kNet").textContent = (net > 0 ? "+" : "") + eur.format(net);
  $("kNet").className = "v " + (net > 0 ? "pos" : net < 0 ? "neg" : "");
  $("kRate").textContent = totInc > 0 ? (net >= 0 ? `Il vous reste ${Math.round(net / totInc * 100)} % de vos revenus` : `Vous dépensez ${Math.round(-net / totInc * 100)} % de plus que vos revenus`) : "Revenus moins dépenses";
  $("kSaved").textContent = (savedNet > 0 ? "+" : "") + eur.format(savedNet);
  $("kSavedN").textContent = totInc > 0 && savedNet > 0 ? `${Math.round(savedNet / totInc * 100)} % de vos revenus` : `${sav.length} mouvement${sav.length > 1 ? "s" : ""}`;

  // Budget (mois du point d'ancrage)
  const budget = Number(state.budget) || 0;
  const mFrom = isoDate(new Date(ui.anchor.getFullYear(), ui.anchor.getMonth(), 1)), mTo = isoDate(new Date(ui.anchor.getFullYear(), ui.anchor.getMonth() + 1, 0));
  const monthExp = sum(all.filter(t => t.type === "expense" && eff(t) >= mFrom && eff(t) <= mTo));
  $("budgetKpi").hidden = !budget || ui.gran === "year";
  if (budget) {
    $("kBudget").textContent = eur0.format(Math.max(0, budget - monthExp));
    $("budgetFill").style.width = Math.min(100, monthExp / budget * 100) + "%";
    $("budgetBar").classList.toggle("over", monthExp > budget);
    $("budgetText").innerHTML = monthExp > budget ? `<span class="neg">Dépassé de ${eur.format(monthExp - budget)}</span>` : `restant sur ${eur0.format(budget)} en ${new Date(mFrom + "T12:00").toLocaleDateString("fr-FR", { month: "long" })}`;
  }
  if (document.activeElement !== $("budget")) $("budget").value = budget || "";
  if (document.activeElement !== $("start")) $("start").value = state.start || "";

  renderChart(range, inPeriod);
  renderCats("catsExp", exp, catsOf("expense"), "Aucune dépense sur la période.");
  renderCats("catsInc", inc, catsOf("income"), "Aucun revenu sur la période. Ajoutez votre salaire avec « Revenu ».");
  renderList(inPeriod);
  renderRules(todayIso);
  renderSavings(past);
  renderSavHistory(past);
  renderRanking(past);
  renderCatManager(all);
  fillFilterSelect(); fillCatSelect();
  $("sampleNotice").hidden = !state.tx.some(t => t.sample) && !state.rec.some(r => r.sample);
}

function renderCats(el, list, cats, emptyMsg) {
  const total = sum(list);
  const rows = cats.map(c => ({ c, s: sum(list.filter(t => t.cat === c.id)) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  $(el).innerHTML = rows.length ? rows.map(({ c, s }) => `
    <div class="cat">
      <span><span class="dot" style="background:${color(c)}"></span>${esc(c.name)}</span>
      <span class="num">${eur.format(s)} <small style="color:var(--muted)">${Math.round(s / total * 100)} %</small></span>
      <div class="bar"><i style="width:${s / rows[0].s * 100}%;background:${color(c)}"></i></div>
    </div>`).join("") : `<p class="hint">${emptyMsg}</p>`;
}

let chartData = [];
function niceScale(v) {
  if (v <= 0) return { top: 100, step: 25 };
  const raw = v / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  return { top: Math.ceil(v / step) * step, step };
}
function renderChart(range, list) {
  chartData = buckets(range).map(b => {
    const items = list.filter(t => eff(t) >= b.from && eff(t) <= b.to);
    return { ...b, inc: sum(items.filter(t => t.type === "income")), exp: sum(items.filter(t => t.type === "expense")) };
  });
  const svg = $("svg"), W = Math.max(280, $("chart").clientWidth), H = 240;
  const m = { l: 52, r: 8, t: 10, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const { top: max, step: tick } = niceScale(Math.max(...chartData.map(d => Math.max(d.inc, d.exp))));
  const y = v => m.t + ih - (v / max) * ih;
  const n = chartData.length, band = iw / n;
  const barW = Math.max(2, Math.min(18, (band - (n > 12 ? 2 : 8)) / 2 - 1));
  const fmtAxis = v => v >= 1000 ? (v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " k€" : Math.round(v).toLocaleString("fr-FR") + " €";
  let g = `<rect id="hl" x="0" y="${m.t}" width="${band}" height="${ih}" fill="var(--grid)" visibility="hidden"/>`;
  for (let v = 0; v <= max + 1e-9; v += tick) {
    const yy = y(v);
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${fmtAxis(v)}</text>`;
  }
  const step = n > 20 ? 5 : 1;
  const bar = (x, v, c) => {
    if (v <= 0) return "";
    const h = Math.max(1, ih - (y(v) - m.t)), r = Math.min(4, barW / 2, h);
    const top = y(v), bot = m.t + ih;
    return `<path d="M${x},${bot}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bot}Z" fill="var(${c})"/>`;
  };
  chartData.forEach((d, i) => {
    const cx = m.l + band * i + band / 2;
    g += bar(cx - barW - 1, d.inc, "--inc") + bar(cx + 1, d.exp, "--exp");
    const dayNum = Number(d.short);
    if (ui.gran !== "month" || dayNum === 1 || dayNum % step === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(d.short)}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" fill="transparent"/>`;
  });
  g += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--line)" stroke-width="1"/>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = g;

  $("tbl").innerHTML = `<thead><tr><th>${ui.gran === "year" ? "Mois" : "Jour"}</th><th>Revenus</th><th>Dépenses</th><th>Solde</th></tr></thead><tbody>`
    + chartData.filter(d => d.inc || d.exp).map(d => `<tr><td>${esc(d.long)}</td><td class="num">${eur.format(d.inc)}</td><td class="num">${eur.format(d.exp)}</td><td class="num">${eur.format(d.inc - d.exp)}</td></tr>`).join("")
    + `</tbody>`;
}
$("svg").addEventListener("pointermove", ev => {
  const hit = ev.target.closest(".hit"), tip = $("tip");
  const hl = $("hl");
  if (!hit) { tip.hidden = true; hl.setAttribute("visibility", "hidden"); return; }
  hl.setAttribute("x", hit.getAttribute("x")); hl.setAttribute("visibility", "visible");
  const d = chartData[+hit.dataset.i], net = d.inc - d.exp;
  tip.innerHTML = `<b>${esc(d.long)}</b><div><span>Revenus</span><span class="num">${eur.format(d.inc)}</span></div><div><span>Dépenses</span><span class="num">${eur.format(d.exp)}</span></div><div><span>Solde</span><span class="num">${(net > 0 ? "+" : "") + eur.format(net)}</span></div>`;
  tip.hidden = false;
  const box = $("chart").getBoundingClientRect();
  let x = ev.clientX - box.left + 12; if (x + tip.offsetWidth > box.width) x = ev.clientX - box.left - tip.offsetWidth - 12;
  tip.style.left = Math.max(0, x) + "px"; tip.style.top = "8px";
});
$("svg").addEventListener("pointerleave", () => { $("tip").hidden = true; $("hl")?.setAttribute("visibility", "hidden"); });

function renderList(inPeriod) {
  const q = ui.search.trim().toLowerCase();
  const shown = inPeriod.filter(t => (!ui.type || t.type === ui.type) && (!q || (t.desc || "").toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!shown.length) {
    $("list").innerHTML = `<p class="empty">${inPeriod.length ? "Aucune opération ne correspond à ce filtre." : "Rien de noté sur cette période. Ajoutez une dépense, un revenu ou de l'épargne avec le formulaire."}</p>`;
    return;
  }
  const groups = {};
  shown.forEach(t => { if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
  let html = "";
  for (const [d, list] of Object.entries(groups)) {
    const dayNet = list.reduce((s, t) => s + walletEffect(t), 0);
    html += `<div class="day"><span>${parseDate(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: ui.gran === "year" ? "numeric" : undefined })}</span><span class="num">${(dayNet > 0 ? "+" : "") + eur.format(dayNet)}</span></div>`;
    html += list.map(t => {
      const c = catById(t.cat), isInc = walletEffect(t) > 0;
      const kind = t.type === "saving" ? (t.dir === "out" ? "Retrait d'épargne · " : "Mis de côté · ") : "";
      return `<div class="item">
        <div class="what"><b>${esc(t.desc || c.name)}</b><small><span class="dot" style="background:${color(c)}"></span>${kind}${esc(c.name)}${t.recurring ? " · chaque mois" : ""}${t.period && t.period !== t.date.slice(0, 7) ? " · pour " + esc(monthLabel(t.period).toLowerCase()) : ""}${t.edited ? " · montant ajusté" : ""}${t.sample ? " · exemple" : ""}</small>
          ${editing === t.id ? `<form class="edit-amt" data-edit="${esc(t.id)}" novalidate><input class="num" type="number" step="0.01" min="0.01" inputmode="decimal" value="${t.amount}" aria-label="Nouveau montant"><button class="small-btn" type="submit">OK</button><button class="del" type="button" data-cancel>Annuler</button></form>` : ""}</div>
        <span class="num ${isInc ? "pos" : ""}" ${t.type === "saving" ? 'style="color:var(--sav)"' : ""}>${isInc ? "+" : "−"}${eur.format(t.amount)}</span>
        <span class="item-actions"><button class="del" type="button" data-editid="${esc(t.id)}" aria-label="Modifier le montant">Modifier</button><button class="del${pendingDelete === t.id ? " confirm" : ""}" data-id="${esc(t.id)}" aria-label="Supprimer ${esc(t.desc || c.name)}">${pendingDelete === t.id ? "Confirmer ?" : "Supprimer"}</button></span>
      </div>`;
    }).join("");
  }
  $("list").innerHTML = html;
}

function renderRules(todayIso) {
  const curMonth = todayIso.slice(0, 7);
  const active = state.rec.filter(r => !r.end).sort((a, b) => (a.type === b.type ? b.amount - a.amount : a.type === "income" ? -1 : 1));
  if (!active.length) { $("recList").innerHTML = `<p class="hint">Aucune opération récurrente. Cochez « Répéter chaque mois » en ajoutant votre salaire ou votre loyer.</p>`; return; }
  const incM = active.reduce((s, r) => s + Math.max(0, walletEffect(r)), 0), expM = active.reduce((s, r) => s + Math.max(0, -walletEffect(r)), 0);
  $("recList").innerHTML = active.map(r => {
    const c = catById(r.cat), isInc = walletEffect(r) > 0, key = "rule:" + r.id;
    return `<div class="rec">
      <div class="what"><b>${esc(r.desc || c.name)}</b><small><span class="dot" style="background:${color(c)}"></span>le ${r.day}${r.day === 1 ? "er" : ""} du mois${r.offset ? ` · compte pour le mois ${r.offset < 0 ? "précédent" : "suivant"}` : ""}${r.type === "saving" ? " · " + esc(c.name) : ""}${r.sample ? " · exemple" : ""}</small></div>
      <span class="num ${isInc ? "pos" : ""}">${isInc ? "+" : "−"}${eur.format(r.amount)}</span>
      <button class="del${pendingDelete === key ? " confirm" : ""}" data-rule="${esc(r.id)}" aria-label="Arrêter ${esc(r.desc || c.name)}">${pendingDelete === key ? "Confirmer ?" : "Arrêter"}</button>
    </div>`;
  }).join("") + `<p class="hint" style="padding-top:8px">Chaque mois : <span class="num pos">+${eur.format(incM)}</span> entrent, <span class="num">−${eur.format(expM)}</span> sortent (épargne comprise)</p>`;
}
$("recList").addEventListener("click", ev => {
  const btn = ev.target.closest(".del"); if (!btn) return;
  const id = btn.dataset.rule, key = "rule:" + id;
  if (pendingDelete !== key) { pendingDelete = key; render(); return; }
  const rule = state.rec.find(r => r.id === id);
  const now = new Date(), cur = monthKey(now);
  // Garde le mois en cours si l'opération a déjà eu lieu, sinon s'arrête au mois précédent
  const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  rule.end = now.getDate() >= rule.day ? cur : prev;
  if (rule.end < rule.start) state.rec = state.rec.filter(r => r.id !== id);
  pendingDelete = null; save(); render(); toast("Opération récurrente arrêtée");
});

// ---------- Épargne ----------
function renderSavings(past) {
  const pots = catsOf("saving").map(c => ({ c, bal: past.filter(t => t.type === "saving" && t.cat === c.id).reduce((s, t) => s + savedEffect(t), 0) }));
  const total = past.reduce((s, t) => s + savedEffect(t), 0);
  $("savTotal").textContent = eur.format(total);
  $("pots").innerHTML = pots.length ? pots.map(({ c, bal }) => {
    const pct = c.target > 0 ? Math.min(100, Math.max(0, bal / c.target * 100)) : 0;
    return `<div class="pot">
      <span><span class="dot" style="background:${color(c)}"></span>${esc(c.name)}</span>
      <span class="num">${eur.format(bal)}</span>
      ${c.target > 0 ? `<div class="bar"><i style="width:${pct}%;background:${color(c)}"></i></div><small>${Math.round(pct)} % de l'objectif de ${eur0.format(c.target)}${bal < c.target ? `, encore ${eur.format(c.target - bal)}` : ", objectif atteint"}</small>` : ""}
    </div>`;
  }).join("") : `<p class="hint">Aucune épargne pour l'instant. Créez la première avec le bouton ci-dessous.</p>`;
}

// ---------- Historique de l'épargne ----------
const sh = { pot: "", year: String(new Date().getFullYear()), month: "" };
function renderSavHistory(past) {
  const all = past.filter(t => t.type === "saving");
  const years = [...new Set(all.map(t => eff(t).slice(0, 4)).concat(String(new Date().getFullYear())))].sort().reverse();
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  $("shPot").innerHTML = opt("", "Toutes les épargnes") + catsOf("saving").map(c => opt(c.id, c.name)).join("");
  $("shYear").innerHTML = opt("", "Toutes les années") + years.map(y => opt(y, y)).join("");
  $("shMonth").innerHTML = opt("", "Tous les mois") + MONTHS.map((m, i) => opt(pad(i + 1), m)).join("");
  if (![...$("shPot").options].some(o => o.value === sh.pot)) sh.pot = "";
  $("shPot").value = sh.pot; $("shYear").value = sh.year; $("shMonth").value = sh.month;
  const list = all.filter(t => (!sh.pot || t.cat === sh.pot) && (!sh.year || eff(t).startsWith(sh.year)) && (!sh.month || eff(t).slice(5, 7) === sh.month))
    .sort((a, b) => eff(b).localeCompare(eff(a)) || b.date.localeCompare(a.date));
  const vIn = sum(list.filter(t => t.dir !== "out")), vOut = sum(list.filter(t => t.dir === "out"));
  $("shSum").innerHTML = `<span>Versé : <b class="num" style="color:var(--sav)">${eur.format(vIn)}</b></span><span>Retiré : <b class="num">${eur.format(vOut)}</b></span><span>Net : <b class="num">${eur.format(vIn - vOut)}</b></span>`;
  if (!list.length) { $("shList").innerHTML = `<p class="hint">Aucun versement pour ce filtre. Ajoutez-en avec « + Ajouter une opération », mode Épargne.</p>`; return; }
  const groups = {};
  list.forEach(t => { const g = eff(t).slice(0, 7); if (!groups[g]) groups[g] = []; groups[g].push(t); });
  $("shList").innerHTML = Object.entries(groups).map(([mk, items]) => {
    const net = items.reduce((s, t) => s + savedEffect(t), 0);
    return `<div class="sav-month"><span>${esc(monthLabel(mk))}</span><span class="num" style="color:var(--sav)">${net >= 0 ? "+" : ""}${eur.format(net)}</span></div>`
      + items.map(t => { const c = catById(t.cat); return `<div class="sav-line"><span><span class="dot" style="background:${color(c)}"></span>${esc(c.name)}<small>${esc(t.desc || (t.dir === "out" ? "Retrait" : "Versement"))} · ${parseDate(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}${t.recurring ? " · chaque mois" : ""}</small></span><span class="num">${t.dir === "out" ? "−" : "+"}${eur.format(t.amount)}</span></div>`; }).join("");
  }).join("");
}
$("shPot").addEventListener("change", e => { sh.pot = e.target.value; render(); });
$("shYear").addEventListener("change", e => { sh.year = e.target.value; render(); });
$("shMonth").addEventListener("change", e => { sh.month = e.target.value; render(); });

// ---------- Classement ----------
function weekStart(iso) { const d = parseDate(iso); return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))); }
function renderRanking(past) {
  document.querySelectorAll("#rankTabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === ui.rankBy)));
  const expCat = ui.cat && catsOf("expense").some(c => c.id === ui.cat) ? ui.cat : "";
  const items = past.filter(t => t.type === "expense" && (!expCat || t.cat === expCat));
  const keyOf = { month: t => eff(t).slice(0, 7), week: t => weekStart(eff(t)), year: t => eff(t).slice(0, 4) }[ui.rankBy];
  const groups = {};
  items.forEach(t => { const k = keyOf(t); groups[k] = (groups[k] || 0) + t.amount; });
  const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const label = k => {
    if (ui.rankBy === "year") return k;
    if (ui.rankBy === "month") { const t = parseDate(k + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); }
    const s = parseDate(k), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    return `Semaine du ${s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  };
  const unit = { month: "mois", week: "semaine", year: "année" }[ui.rankBy];
  const avg = rows.length ? sum(rows.map(([, v]) => ({ amount: v }))) / rows.length : 0;
  $("rankHint").textContent = rows.length
    ? `${expCat ? "Dépenses en " + catById(expCat).name : "Toutes les dépenses"}, ${rows.length} ${unit}${rows.length > 1 && unit !== "mois" ? "s" : ""} au total. Moyenne : ${eur.format(avg)} par ${unit}. Touchez une ligne pour l'ouvrir.`
    : "Pas encore de dépenses à classer.";
  $("rank").innerHTML = rows.slice(0, 10).map(([k, v], i) => `
    <button data-k="${esc(k)}">
      <span class="pos-n">${i + 1}</span><span>${esc(label(k))}</span><span class="num">${eur.format(v)}</span>
      <div class="bar"><i style="width:${v / rows[0][1] * 100}%"></i></div>
    </button>`).join("");
}
$("rank").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-k]"); if (!b) return;
  const k = b.dataset.k;
  ui.gran = ui.rankBy;
  ui.anchor = ui.rankBy === "year" ? new Date(+k, 0, 1) : ui.rankBy === "month" ? parseDate(k + "-01") : parseDate(k);
  pendingDelete = null; render();
  try { scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } catch (e) { scrollTo(0, 0); }
});
document.querySelectorAll("#rankTabs button").forEach(b => b.onclick = () => {
  ui.rankBy = b.dataset.r;
  try { localStorage.setItem(KEY + "-ui", JSON.stringify({ gran: ui.gran, rankBy: ui.rankBy })); } catch {}
  render();
});

// ---------- Mes catégories ----------
function usage(id, all) { return all.filter(t => t.cat === id).length + state.rec.filter(r => r.cat === id && !r.end).length; }
function renderCatManager(all) {
  const k = ui.cmKind;
  document.querySelectorAll("#cmTabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
  $("cmForm").classList.toggle("with-target", k === "saving");
  $("cmTarget").hidden = k !== "saving";
  $("cmName").placeholder = { expense: "Nouvelle catégorie de dépense", income: "Nouvelle source de revenu", saving: "Nouvelle épargne (ex. Voiture)" }[k];
  $("cmList").innerHTML = catsOf(k).map(c => {
    const key = "cat:" + c.id, n = usage(c.id, all), locked = PROTECTED.includes(c.id);
    return `<div class="cm-row">
      <span><span class="dot" style="background:${color(c)}"></span>${esc(c.name)} <small style="color:var(--muted)">${n ? n + " op." : ""}</small></span>
      ${k === "saving" ? `<input class="num" type="number" min="0" step="10" data-target="${esc(c.id)}" value="${c.target || ""}" placeholder="Objectif €" aria-label="Objectif pour ${esc(c.name)}">` : "<span></span>"}
      ${locked ? `<span class="hint">par défaut</span>` : `<button class="del${pendingDelete === key ? " confirm" : ""}" data-cat="${esc(c.id)}" aria-label="Supprimer ${esc(c.name)}">${pendingDelete === key ? "Confirmer ?" : "Supprimer"}</button>`}
    </div>`;
  }).join("");
}
document.querySelectorAll("#cmTabs button").forEach(b => b.onclick = () => { ui.cmKind = b.dataset.k; $("cmError").hidden = true; render(); });
// Ajoute une catégorie ; renvoie un message d'erreur ou null
function addCategory(k, name, target) {
  if (!TYPES.includes(k)) return "Type de catégorie inconnu.";
  name = cleanText(name, LIMITS.catName);
  if (!name) return "Donnez un nom à la catégorie.";
  if (catsOf(k).length >= LIMITS.catsPerType) return `Vous avez atteint la limite de ${LIMITS.catsPerType} catégories.`;
  if (catsOf(k).some(c => c.name.toLowerCase() === name.toLowerCase())) return "Cette catégorie existe déjà.";
  const used = catsOf(k).map(c => c.color);
  const col = PALETTE.find(p => !used.includes(p)) || PALETTE[catsOf(k).length % PALETTE.length];
  const cat = { id: "c" + Date.now().toString(36), name, color: col };
  if (k === "saving") cat.target = cleanMoney(target, 0);
  state.cats[k].push(cat);
  save(); render();
  return null;
}
$("cmForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const k = ui.cmKind, err = $("cmError");
  const msg = addCategory(k, $("cmName").value, $("cmTarget").value);
  if (msg) { err.textContent = msg; err.hidden = false; $("cmName").focus(); return; }
  err.hidden = true; $("cmName").value = ""; $("cmTarget").value = "";
  toast(k === "saving" ? "Épargne créée" : "Catégorie ajoutée");
});
$("cat").addEventListener("change", () => {
  const isNew = $("cat").value === "__new";
  $("newCatRow").hidden = !isNew;
  if (isNew) $("newCatName").focus();
});
function createFromForm() {
  const k = ui.formType, err = $("formError");
  const msg = addCategory(k, $("newCatName").value, 0);
  if (msg) { err.textContent = msg; err.hidden = false; $("newCatName").focus(); return; }
  err.hidden = true; $("newCatName").value = "";
  const created = catsOf(k)[catsOf(k).length - 1];
  $("cat").value = created.id; $("newCatRow").hidden = true;
  toast(k === "saving" ? "Épargne créée" : "Catégorie créée");
}
$("newCatOk").onclick = createFromForm;
$("newCatName").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); createFromForm(); } });
$("newPotBtn").onclick = () => { $("potForm").hidden = false; $("newPotBtn").hidden = true; $("potName").focus(); };
$("potForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const err = $("potError"), msg = addCategory("saving", $("potName").value, $("potTarget").value);
  if (msg) { err.textContent = msg; err.hidden = false; $("potName").focus(); return; }
  err.hidden = true; $("potName").value = ""; $("potTarget").value = "";
  $("potForm").hidden = true; $("newPotBtn").hidden = false;
  toast("Épargne créée");
});
$("cmList").addEventListener("change", ev => {
  const inp = ev.target.closest("input[data-target]"); if (!inp) return;
  const c = catsOf("saving").find(c => c.id === inp.dataset.target);
  if (c) { c.target = cleanMoney(inp.value, 0); save(); render(); }
});
$("cmList").addEventListener("click", ev => {
  const btn = ev.target.closest(".del"); if (!btn) return;
  const id = btn.dataset.cat, key = "cat:" + id, k = ui.cmKind, err = $("cmError");
  if (pendingDelete !== key) { pendingDelete = key; render(); return; }
  pendingDelete = null;
  if (k === "saving") {
    const bal = allTx(isoDate(new Date())).filter(t => t.type === "saving" && t.cat === id).reduce((s, t) => s + savedEffect(t), 0);
    if (Math.abs(bal) > 0.004) { err.textContent = `Il reste ${eur.format(bal)} dans cette épargne. Retirez-les avant de la supprimer.`; err.hidden = false; render(); return; }
    if (state.rec.some(r => r.cat === id && !r.end)) { err.textContent = "Arrêtez d'abord le versement mensuel vers cette épargne."; err.hidden = false; render(); return; }
  } else {
    // Les opérations de cette catégorie passent dans « Autre »
    const fallback = k === "income" ? "autre-rev" : "autre";
    state.tx.forEach(t => { if (t.cat === id) t.cat = fallback; });
    state.rec.forEach(r => { if (r.cat === id) r.cat = fallback; });
  }
  err.hidden = true;
  state.cats[k] = catsOf(k).filter(c => c.id !== id);
  if (ui.cat === id) ui.cat = "";
  save(); render(); toast(k === "saving" ? "Épargne supprimée" : "Catégorie supprimée, ses opérations sont dans « Autre »");
});

// ---------- Navigation mobile ----------
const VIEWS = ["home", "ops", "stats", "savings", "settings", "add"];
const mobile = matchMedia("(max-width: 899px)");
let prevView = "home";
function setView(v) {
  if (!VIEWS.includes(v)) v = "home";
  if (v === "add" && document.body.dataset.view !== "add") prevView = document.body.dataset.view || "home";
  document.body.dataset.view = v;
  document.querySelectorAll("#tabbar button").forEach(b => { if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (v !== "add") { try { localStorage.setItem(KEY + "-view", v); } catch {} }
  render();
  // Remonte en haut de la page (marche aussi quand la page est dans un cadre)
  if (mobile.matches) { try { document.querySelector(".wrap").scrollIntoView({ block: "start" }); } catch {} scrollTo(0, 0); }
}
// Un seul écouteur délégué : robuste aux re-rendus et aux cibles internes (icône, texte)
$("tabbar").addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
function openSheet() { setView("add"); if (!mobile.matches) $("amount").focus(); else setTimeout(() => $("amount").focus({ preventScroll: true }), 50); }
function closeSheet() { $("formError").hidden = true; setView(prevView); }
$("addBtn").addEventListener("click", openSheet);
$("fab").addEventListener("click", openSheet);
// Barre fixe en bas, sauf si le cadre est plus haut que l'écran : elle serait alors hors de vue.
function placeNav() {
  const tall = mobile.matches && window.innerHeight > (screen.height || 0) + 100;
  document.body.classList.toggle("nav-inflow", tall);
}
$("closeSheet").addEventListener("click", closeSheet);
// Safari iOS 13 et plus anciens ne connaissent que addListener
const onMobileChange = () => { placeNav(); render(); };
if (mobile.addEventListener) mobile.addEventListener("change", onMobileChange); else if (mobile.addListener) mobile.addListener(onMobileChange);

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2000);
}

// ---------- Événements ----------
document.querySelectorAll(".type-toggle button").forEach(b => b.onclick = () => { ui.formType = b.dataset.type; fillCatSelect(); });
$("form").addEventListener("submit", ev => {
  ev.preventDefault();
  const amount = cleanAmount(String($("amount").value).replace(",", "."));
  const date = $("date").value, err = $("formError");
  if (amount === null) { err.textContent = "Indiquez un montant entre 0,01 € et 1 000 000 000 €."; err.hidden = false; $("amount").focus(); return; }
  if (!validDate(date)) { err.textContent = "Choisissez une date valide (entre 1970 et 2100)."; err.hidden = false; $("date").focus(); return; }
  if (state.tx.length >= LIMITS.tx || state.rec.length >= LIMITS.rec) { err.textContent = "Le carnet est plein. Supprimez d'anciennes opérations pour en ajouter."; err.hidden = false; return; }
  err.hidden = true;
  const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!$("cat").value || $("cat").value === "__new") { err.textContent = "Choisissez une catégorie, ou créez-la avec « Créer »."; err.hidden = false; return; }
  if (!$("cat").value) { err.textContent = "Créez d'abord une catégorie dans « Mes catégories »."; err.hidden = false; return; }
  if (!catsOf(ui.formType).some(c => c.id === $("cat").value)) { err.textContent = "Choisissez une catégorie de la liste."; err.hidden = false; return; }
  const op = { type: ui.formType, amount, desc: cleanText($("desc").value, LIMITS.desc), cat: $("cat").value };
  if (ui.formType === "saving") op.dir = document.querySelector('input[name="dir"]:checked')?.value === "out" ? "out" : "in";
  const per = `${$("perYear").value}-${$("perMonth").value}`;
  const perOffset = validMonth(per) ? (Number(per.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(per.slice(5)) - Number(date.slice(5, 7)) : 0;
  if (Math.abs(perOffset) > 12) { err.textContent = "Le mois concerné doit être à moins d'un an de la date."; err.hidden = false; return; }
  if ($("repeat").checked) state.rec.push({ id: newId, ...op, day: Number(date.slice(8, 10)), start: date.slice(0, 7), end: null, skip: [], offset: perOffset, overrides: {} });
  else state.tx.push({ id: newId, ...op, date, ...(perOffset ? { period: per } : {}) });
  perTouched = false;
  const wasRepeat = $("repeat").checked; $("repeat").checked = false;
  save();
  ui.anchor = parseDate(perOffset ? per + "-01" : date);
  $("amount").value = ""; $("desc").value = ""; syncPeriodToDate($("date").value);
  if (!mobile.matches) $("amount").focus();
  if (mobile.matches) setView("ops");
  render(); toast(wasRepeat ? "Ajouté, chaque mois" : { income: "Revenu ajouté", expense: "Dépense ajoutée", saving: "Épargne enregistrée" }[ui.formType]);
});
let editing = null;
$("list").addEventListener("submit", ev => {
  const f = ev.target.closest("form[data-edit]"); if (!f) return;
  ev.preventDefault();
  const id = f.dataset.edit, amount = cleanAmount(String(f.querySelector("input").value).replace(",", "."));
  if (amount === null) { f.querySelector("input").setCustomValidity("Montant invalide"); f.querySelector("input").reportValidity(); return; }
  if (id.startsWith("r:")) {
    // Occurrence d'une opération mensuelle : on ajuste seulement ce mois-là
    const [, rid, mk] = id.split(":"), rule = state.rec.find(r => r.id === rid);
    if (rule) { if (!rule.overrides) rule.overrides = {}; if (amount === rule.amount) delete rule.overrides[mk]; else rule.overrides[mk] = amount; }
  } else {
    const t = state.tx.find(t => t.id === id); if (t) t.amount = amount;
  }
  editing = null; save(); render(); toast("Montant modifié");
});
$("list").addEventListener("click", ev => {
  const ed = ev.target.closest("[data-editid]");
  if (ed) { editing = ed.dataset.editid; pendingDelete = null; render(); document.querySelector(".edit-amt input")?.focus(); return; }
  if (ev.target.closest("[data-cancel]")) { editing = null; render(); return; }
  const btn = ev.target.closest(".del[data-id]"); if (!btn) return;
  const id = btn.dataset.id;
  if (pendingDelete === id) {
    if (id.startsWith("r:")) { const [, rid, mk] = id.split(":"); state.rec.find(r => r.id === rid)?.skip.push(mk); }
    else state.tx = state.tx.filter(t => t.id !== id);
    pendingDelete = null; save(); render(); toast("Opération supprimée");
  }
  else { pendingDelete = id; render(); }
});
document.querySelectorAll("#gran button").forEach(b => b.onclick = () => {
  ui.gran = b.dataset.g; pendingDelete = null;
  try { localStorage.setItem(KEY + "-ui", JSON.stringify({ gran: ui.gran, rankBy: ui.rankBy })); } catch {}
  render();
});
$("prev").onclick = () => shift(-1);
$("next").onclick = () => shift(1);
$("today").onclick = () => { ui.anchor = new Date(); render(); };
$("filterCat").onchange = e => { ui.cat = e.target.value; render(); };
$("filterType").onchange = e => { ui.type = e.target.value; render(); };
$("search").oninput = e => { ui.search = e.target.value; render(); };
$("budget").oninput = e => { state.budget = cleanMoney(e.target.value, 0); save(); render(); };
$("start").oninput = e => { state.start = cleanMoney(e.target.value); save(); render(); };
$("clearSamples").onclick = () => { state.tx = state.tx.filter(t => !t.sample); state.rec = state.rec.filter(r => !r.sample); save(); render(); toast("Exemples effacés"); };
// Sur un appareil partagé : retire la copie locale. Les données du compte restent intactes si la synchro est active.
let wipeArmed = false;
$("wipeLocal").onclick = () => {
  if (!wipeArmed) {
    wipeArmed = true;
    $("wipeLocal").textContent = "Confirmer l'effacement";
    $("wipeHint").hidden = false;
    $("wipeHint").textContent = cloud.ready ? "La copie de cet appareil sera effacée. Vos données restent dans votre compte." : "Attention : la synchro n'est pas active, vos opérations seront définitivement perdues sur cet appareil.";
    return;
  }
  try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + "-ui"); localStorage.removeItem(OLD_KEY); } catch {}
  wipeArmed = false; $("wipeLocal").textContent = "Effacer les données de cet appareil"; $("wipeHint").hidden = true;
  if (!cloud.ready) { state = { tx: [], rec: [], cats: defaultCats(), budget: 0, start: 0 }; render(); }
  toast("Données de cet appareil effacées");
};
// ---------- Sauvegarde : export et import ----------
function exportJSON() {
  const data = { tx: state.tx.filter(t => !t.sample).map(({ sample, ...t }) => t), rec: state.rec.filter(r => !r.sample).map(({ sample, ...r }) => r), cats: state.cats, budget: state.budget, start: state.start };
  return JSON.stringify({ app: "carnet-depenses", format: 1, exportedAt: new Date().toISOString(), data }, null, 1);
}
$("exportBtn").onclick = async () => {
  const txt = exportJSON(), filename = "carnet-depenses-" + isoDate(new Date()) + ".json";
  $("importBox").hidden = true; $("exportBox").hidden = false; $("exportText").value = txt;
  // Sur claude.ai, le fichier passe par la plateforme (la personne confirme l'enregistrement)
  if (window.claude && window.claude.use) {
    try {
      const downloads = await claude.use("downloads");
      if (downloads) { await downloads.save({ filename, data: txt }); toast("Sauvegarde enregistrée"); }
    } catch (e) { /* refus ou indisponible : le texte reste affiché pour être copié */ }
    return;
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { /* le texte reste affiché pour être copié */ }
};
$("copyExport").onclick = async () => {
  const ta = $("exportText");
  try { await navigator.clipboard.writeText(ta.value); toast("Texte copié"); return; } catch (e) {}
  try { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); if (document.execCommand("copy")) { toast("Texte copié"); return; } } catch (e) {}
  toast("Sélectionnez le texte puis copiez-le");
};
let importArmed = null;
function setImportMsg(m) { $("importMsg").textContent = m; }
$("importBtn").onclick = () => { $("exportBox").hidden = true; $("importBox").hidden = false; importArmed = null; $("importGo").textContent = "Remplacer mes données"; setImportMsg(""); };
$("importFile").onchange = e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (f.size > 5e6) { setImportMsg("Ce fichier est trop gros pour être une sauvegarde de l'appli."); return; }
  const rd = new FileReader();
  rd.onload = () => { $("importText").value = String(rd.result || ""); importArmed = null; $("importGo").textContent = "Remplacer mes données"; setImportMsg("Fichier chargé. Appuyez sur « Remplacer mes données »."); };
  rd.onerror = () => setImportMsg("Impossible de lire ce fichier.");
  rd.readAsText(f);
};
$("importText").oninput = () => { importArmed = null; $("importGo").textContent = "Remplacer mes données"; };
$("importGo").onclick = () => {
  const raw = $("importText").value;
  if (!raw.trim()) { setImportMsg("Choisissez un fichier ou collez le texte exporté."); return; }
  if (raw.length > 5e6) { setImportMsg("Ce texte est trop long pour être une sauvegarde de l'appli."); return; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { setImportMsg("Ce texte n'est pas une sauvegarde de l'appli. Vérifiez qu'il a été copié en entier."); return; }
  if (!parsed || parsed.app !== "carnet-depenses" || !parsed.data) { setImportMsg("Ce texte n'est pas une sauvegarde de l'appli."); return; }
  const next = cleanState(parsed.data);
  if (!importArmed) {
    importArmed = next;
    $("importGo").textContent = "Confirmer le remplacement";
    setImportMsg(`La sauvegarde contient ${next.tx.length} opération${next.tx.length > 1 ? "s" : ""} et ${next.rec.length} opération${next.rec.length > 1 ? "s" : ""} récurrente${next.rec.length > 1 ? "s" : ""}. Elles remplaceront vos données actuelles.`);
    return;
  }
  state = importArmed; importArmed = null;
  save(); pendingDelete = null; render();
  $("importGo").textContent = "Remplacer mes données"; $("importText").value = ""; $("importFile").value = "";
  $("importBox").hidden = true;
  toast("Données importées");
};

let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { placeNav(); render(); }, 120); });

let startView = "home";
try { startView = localStorage.getItem(KEY + "-view") || "home"; } catch {}
document.body.dataset.view = VIEWS.includes(startView) ? startView : "home";
document.querySelectorAll("#tabbar button").forEach(b => { if (b.dataset.view === document.body.dataset.view) b.setAttribute("aria-current", "page"); });
try { placeNav(); } catch (e) { reportError(e); }
try { render(); } catch (e) { reportError(e); }
try { startSync(); } catch (e) { reportError(e); }
booted = true;
$("bootMsg").hidden = true;
