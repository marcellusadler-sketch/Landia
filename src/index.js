/**
 * Score Vision — Secure Worker
 * -----------------------------------------------------------------
 * Tout kle sekrè (Moncash, Natcash, Claude, Groq, Perplexity) rete
 * ISIT LA SÈLMAN, kòm "Secrets" nan Cloudflare. Telefòn moun yo
 * (index.html) sèlman rele wout sa yo — yo pa janm wè okenn kle.
 * -----------------------------------------------------------------
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // ranplase ak domèn ou an pou plis sekirite
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 🔗 LYEN PIBLIK LOGO SCORE VISION LA — sa a se icon ki parèt sou CHAK
// notifikasyon otomatik (menm jan Sofascore toujou montre pwòp logo li,
// kèlkeswa match la). Li DWE yon URL https:// piblik (Firebase Storage,
// Cloudflare R2/Pages, ImgBB, elatriye) — yon data:base64 PA ka mache
// paske sèvè FCM dwe telechaje l li menm. Ranplase valè a anba a ak
// vrè lyen logo Score Vision ou a.
const SCORE_VISION_LOGO_URL = "https://REMPLASE-AK-LYEN-LOGO-SCORE-VISION.png";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (path === "/moncash/create" && request.method === "POST")
        return await moncashCreate(request, env);
      if (path === "/moncash/verify" && request.method === "POST")
        return await moncashVerify(request, env);

      if (path === "/natcash/create" && request.method === "POST")
        return await natcashCreate(request, env);
      if (path === "/natcash/verify" && request.method === "POST")
        return await natcashVerify(request, env);

      if (path === "/sports/events" && request.method === "GET")
        return await sportsEvents(request, env);

      if (path === "/sports/eventstats" && request.method === "GET")
        return await sportsEventStats(request, env);

      if (path === "/ai/chat" && request.method === "POST")
        return await aiClaude(request, env);
      if (path === "/ai/groq" && request.method === "POST")
        return await aiGroq(request, env);
      if (path === "/ai/perplexity" && request.method === "POST")
        return await aiPerplexity(request, env);
      if (path === "/ai/gemini" && request.method === "POST")
        return await aiGemini(request, env);

      // Teste manyèlman detèksyon gòl/notifikasyon (menm kòd ki kouri chak 2 minit)
      if (path === "/run" && request.method === "GET")
        return json(await checkMatchesAndNotify(env));

      // Teste manyèlman voye notifikasyon ki nan liy datant (pushQueue) —
      // itil pou verifye yon "Notifikasyon Manyèl" ou fèk voye nan Admin lan
      // san w pa gen pou tann pwochen sik cron (chak 2 minit) la.
      if (path === "/run-queue" && request.method === "GET")
        return json(await processPushQueue(env));

      if (path === "/" ) return json({ ok: true, service: "score-vision-worker" });

      return json({ error: "Wout la pa egziste" }, 404);
    } catch (err) {
      return json({ error: err.message || "Erè sèvè" }, 500);
    }
  },

  // 🔔 Sa a kouri otomatikman chak 2 minit (wè "crons" nan wrangler.toml) —
  // li detekte gòl/katon/chanjman/match k ap kòmanse/fini, epi voye push
  // notification ak logo Score Vision, san okenn konfigirasyon admin.
  // San SPORTS_API_KEY_V2 ak FIREBASE_SERVICE_ACCOUNT mete kòm Secrets,
  // li senpleman pa fè anyen (san erè, san danje).
  async scheduled(event, env, ctx) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return;
    // Detèksyon otomatik (gòl/katon/chanjman/match) bezwen SPORTS_API_KEY_V2 an plis.
    if (env.SPORTS_API_KEY_V2) ctx.waitUntil(checkMatchesAndNotify(env));
    // Notifikasyon Manyèl (pushQueue) sèlman bezwen FIREBASE_SERVICE_ACCOUNT —
    // li dwe kouri menm si V2 pa konfigire, sinon bouton "Voye Kounye a" nan
    // Admin lan pa janm fè anyen.
    ctx.waitUntil(processPushQueue(env));
  },
};

/* ══════════════════ MONCASH ══════════════════ */

function moncashBase(env) {
  return env.MONCASH_MODE === "live"
    ? "https://moncashbutton.digicelgroup.com"
    : "https://sandbox.moncashbutton.digicelgroup.com";
}

async function moncashGetToken(env) {
  const base = moncashBase(env);
  const creds = btoa(`${env.MONCASH_CLIENT_ID}:${env.MONCASH_SECRET_KEY}`);
  const res = await fetch(`${base}/Api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "scope=read,write&grant_type=client_credentials",
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Pa kapab konekte ak MonCash (token)");
  return data.access_token;
}

async function moncashCreate(request, env) {
  const { orderId, amount } = await request.json();
  if (!orderId || !amount) return json({ error: "orderId ak amount obligatwa" }, 400);

  const base = moncashBase(env);
  const token = await moncashGetToken(env);

  const res = await fetch(`${base}/Api/v1/CreatePayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, orderId }),
  });
  const data = await res.json();
  const payToken = data?.payment_token?.token;
  if (!payToken) return json({ error: data.message || "Pa kapab kreye peman MonCash" }, 400);

  const redirectUrl = `${base}/Moncash.php/Redirect?token=${payToken}`;
  return json({ redirectUrl });
}

async function moncashVerify(request, env) {
  const { orderId } = await request.json();
  if (!orderId) return json({ error: "orderId obligatwa" }, 400);

  const base = moncashBase(env);
  const token = await moncashGetToken(env);

  const res = await fetch(`${base}/Api/v1/RetrieveTransactionPayment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  const payment = data?.payment;

  if (payment && (payment.message === "successful" || payment.status === 1)) {
    return json({ success: true, transactionId: payment.transaction_id || null });
  }
  return json({ success: false });
}

/* ══════════════════ NATCASH ══════════════════ */
/* Sa a itilize URL ou konfigire yo (NATCASH_TOKEN_URL, NATCASH_CREATE_URL,
   NATCASH_VERIFY_URL, NATCASH_REDIRECT_BASE) paske chak founisè Natcash ka
   gen yon fòma ki yon ti kras diferan. Ajiste chan yo si dokiman Natcash ou
   resevwa mande yon lòt non chan. */

async function natcashGetToken(env) {
  const creds = btoa(`${env.NATCASH_CLIENT_ID}:${env.NATCASH_SECRET_KEY}`);
  const res = await fetch(env.NATCASH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Pa kapab konekte ak Natcash (token)");
  return data.access_token;
}

async function natcashCreate(request, env) {
  const { orderId, amount } = await request.json();
  if (!orderId || !amount) return json({ error: "orderId ak amount obligatwa" }, 400);

  const token = await natcashGetToken(env);
  const res = await fetch(env.NATCASH_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId,
      amount,
      redirectUrl: `${env.NATCASH_REDIRECT_BASE}?orderId=${encodeURIComponent(orderId)}`,
    }),
  });
  const data = await res.json();
  const redirectUrl = data.redirectUrl || data.paymentUrl || data.url;
  if (!redirectUrl) return json({ error: data.message || "Pa kapab kreye peman Natcash" }, 400);

  return json({ redirectUrl });
}

async function natcashVerify(request, env) {
  const { orderId } = await request.json();
  if (!orderId) return json({ error: "orderId obligatwa" }, 400);

  const token = await natcashGetToken(env);
  const res = await fetch(env.NATCASH_VERIFY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();

  if (data.success === true || data.status === "completed" || data.status === "paid") {
    return json({ success: true, transactionId: data.transactionId || data.transaction_id || null });
  }
  return json({ success: false });
}

/* ══════════════════ SPORTS (TheSportsDB) ══════════════════ */

// Mape non spò ki soti nan app la (index.html) ak non egzat TheSportsDB mande
const SPORT_MAP = {
  Soccer: "Soccer",
  Basketball: "Basketball",
  "American Football": "American Football",
  Baseball: "Baseball",
  "Ice Hockey": "Ice Hockey",
};

// Gwo chanpyona entènasyonal ki ka "pèdi" nan mitan santèn match chak jou —
// nou chèche yo espesyalman pa ID lig, an plis rekèt jeneral la, pou yo pa janm manke.
const MAJOR_LEAGUE_IDS = {
  Soccer: [
    "4429", // FIFA World Cup
    "4503", // FIFA Club World Cup
  ],
};

async function sportsEvents(request, env) {
  const url = new URL(request.url);
  const d = url.searchParams.get("d");
  if (!d) return json({ error: "Paramèt 'd' (dat) obligatwa" }, 400);

  const sportParam = url.searchParams.get("sport") || "Soccer";
  const sport = SPORT_MAP[sportParam] || "Soccer";

  const key = env.SPORTS_API_KEY || "123"; // '123' se kle gratis piblik TheSportsDB

  const mainReq = fetch(
    `https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${encodeURIComponent(d)}&s=${encodeURIComponent(sport)}`
  );

  const leagueIds = MAJOR_LEAGUE_IDS[sport] || [];
  const extraReqs = leagueIds.map((id) =>
    fetch(`https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${encodeURIComponent(d)}&l=${id}`)
      .then((r) => r.json())
      .catch(() => null)
  );

  const [mainRes, ...extraResults] = await Promise.all([mainReq, ...extraReqs]);
  const mainData = await mainRes.json();

  // Konbine tout match yo, retire doub (menm idEvent)
  const seen = new Set();
  const merged = [];
  const addAll = (events) => {
    (events || []).forEach((e) => {
      if (!seen.has(e.idEvent)) {
        seen.add(e.idEvent);
        merged.push(e);
      }
    });
  };
  addAll(mainData?.events);
  extraResults.forEach((r) => addAll(r?.events));

  // 🔴 KWAZE AK LIVESCORE V2 (menm sous ke notifikasyon yo itilize) —
  // eventsday.php (V1) souvan pa mete strStatus/eskò ajou pandan match
  // la ap jwe. Nou ranplase estati/eskò a ak done V2 an tan reyèl la,
  // lè match la aktyèlman nan lis live la, san nou pa touche match ki
  // poko kòmanse oswa ki fini deja (yo pa parèt nan livescore ankò).
  if (env.SPORTS_API_KEY_V2) {
    try {
      const liveMap = await fetchLiveMap(env, sport);
      merged.forEach((e) => {
        const live = liveMap.get(String(e.idEvent));
        if (live) {
          e.strStatus = live.strStatus ?? e.strStatus;
          e.intHomeScore = live.intHomeScore ?? e.intHomeScore;
          e.intAwayScore = live.intAwayScore ?? e.intAwayScore;
          e.strProgress = live.strProgress ?? e.strProgress;
        }
      });
      const todayUTC = new Date().toISOString().split("T")[0];
      if (d === todayUTC) {
        liveMap.forEach((live, id) => {
          if (seen.has(id)) return;
          merged.push({
            idEvent: id,
            strHomeTeam: live.strHomeTeam || "?",
            strAwayTeam: live.strAwayTeam || "?",
            strLeague: live.strLeague || sport,
            strTime: live.strEventTime || live.strTime || null,
            dateEvent: todayUTC,
            strStatus: live.strStatus || "In Progress",
            intHomeScore: live.intHomeScore ?? null,
            intAwayScore: live.intAwayScore ?? null,
            strProgress: live.strProgress ?? null,
            strVenue: live.strVenue ?? null,
            strCountry: live.strCountry ?? null,
            strRound: live.strRound ?? null,
          });
          seen.add(id);
        });
      }
    } catch (ex) {
      console.log("livescore V2 merge err:", ex.message);
    }
  }

  return json({ events: merged }, mainRes.status);
}

// Jwenn map (idEvent -> done live) pou yon spò bay, soti nan menm API V2
// livescore ke sistèm notifikasyon an (checkMatchesAndNotify) itilize.
async function fetchLiveMap(env, sport) {
  const res = await fetch(
    `https://www.thesportsdb.com/api/v2/json/livescore/${encodeURIComponent(sport)}`,
    { headers: { "X-API-KEY": env.SPORTS_API_KEY_V2 } }
  );
  if (!res.ok) throw new Error(`livescore V2 HTTP ${res.status}`);
  const data = await res.json();
  const list = data.livescore || data.events || [];
  const map = new Map();
  list.forEach((e) => map.set(String(e.idEvent), e));
  return map;
}

// Estatistik REYÈL yon match espesifik (pou match k ap jwe oswa ki fini) —
// pa gen okenn IA la, se vrè done TheSportsDB retounen sou match la.
async function sportsEventStats(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "Paramèt 'id' (match) obligatwa" }, 400);

  const key = env.SPORTS_API_KEY || "123";

  const [eventRes, statsRes, timelineRes] = await Promise.all([
    fetch(`https://www.thesportsdb.com/api/v1/json/${key}/lookupevent.php?id=${encodeURIComponent(id)}`),
    fetch(`https://www.thesportsdb.com/api/v1/json/${key}/lookupeventstats.php?id=${encodeURIComponent(id)}`),
    fetch(`https://www.thesportsdb.com/api/v1/json/${key}/lookuptimeline.php?id=${encodeURIComponent(id)}`),
  ]);

  const [eventData, statsData, timelineData] = await Promise.all([
    eventRes.json().catch(() => null),
    statsRes.json().catch(() => null),
    timelineRes.json().catch(() => null),
  ]);

  return json({
    event: eventData?.events?.[0] || null,
    stats: statsData?.eventstats || null,
    timeline: timelineData?.timeline || null,
  });
}

/* ══════════════════ AI (Claude / Groq / Perplexity / Gemini) ══════════════════ */

async function aiClaude(request, env) {
  const body = await request.json(); // { system, messages, max_tokens }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: body.max_tokens || 400,
      system: body.system,
      messages: body.messages,
    }),
  });
  const data = await res.json();
  return json(data, res.status);
}

async function aiGroq(request, env) {
  const body = await request.json(); // pase tout jan l soti a (model, messages, temperature, response_format, elatriye)
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", ...body }),
  });
  const data = await res.json();
  return json(data, res.status);
}

async function aiPerplexity(request, env) {
  const body = await request.json();
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return json(data, res.status);
}

async function aiGemini(request, env) {
  const body = await request.json(); // { model, contents, systemInstruction, generationConfig }
  const model = body.model || "gemini-3.1-flash-lite";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: body.contents,
        systemInstruction: body.systemInstruction,
        generationConfig: body.generationConfig,
      }),
    }
  );
  const data = await res.json();
  return json(data, res.status);
}

/* ══════════════════ NOTIFIKASYON (ESTIL SOFASCORE) ══════════════════ */
/* Bezwen: env.MATCH_STATE (KV binding), env.SPORTS_API_KEY_V2 (Secret),
   env.FIREBASE_SERVICE_ACCOUNT (Secret — tout kontni fichye JSON la).

   ⚠️ CHANJMAN: nou retire SISTÈM MODÈL PÈSONALIZE ADMIN LAN nèt
   (config/notifTemplates, buildNotifContent ki t ap li Firestore,
   fillTemplatePlaceholders, elatriye). Kounye a, TOUT notifikasyon
   OTOMATIK yo swiv EGZAKTEMAN menm fòma "estil Sofascore" a, ak logo
   Score Vision (SCORE_VISION_LOGO_URL) — pa gen okenn chan pou
   pèsonalize tit/mesaj/icon nan Admin.html ankò pou evènman otomatik.
   Sèl bagay Admin gade se: (1) Notifikasyon Manyèl (pushQueue, pi ba),
   ak (2) siveyans/estatistik match yo. */

// Spò nou siveye an tan reyèl pou notifikasyon yo.
const LIVE_SPORTS = ["Soccer", "Basketball", "American Football", "Baseball", "Ice Hockey"];

// Spò kote nou ka jwenn detay "Katon" ak "Chanjman" fyab nan TheSportsDB
// (timeline endpoint la pi konplè pou Soccer). Lòt spò yo kontinye resevwa
// notifikasyon kickoff/pwen/fen nòmalman — n ap ka ajoute yo isit la pita
// si done TheSportsDB pou yo vin pi konplè.
const SPORTS_WITH_CARDS = ["Soccer"];
const SPORTS_WITH_SUBS = ["Soccer"];

// Mo "evènman ki fè pwen" an chanje selon spò a — men prensip la (yon
// notifikasyon chak fwa eskò a chanje) rete menm jan pou tout spò.
const SCORE_LABEL = {
  Soccer: { ht: "But", fr: "But", en: "Goal", es: "Gol" },
  "Ice Hockey": { ht: "But", fr: "But", en: "Goal", es: "Gol" },
  Basketball: { ht: "Pwen", fr: "Point", en: "Score", es: "Puntos" },
  "American Football": { ht: "Pwen", fr: "Point", en: "Score", es: "Puntos" },
  Baseball: { ht: "Pwen", fr: "Point", en: "Run", es: "Carrera" },
};

const MATCH_START_TEXT = {
  ht: "Match la kòmanse",
  fr: "Le match commence",
  en: "Match has started",
  es: "Comenzó el partido",
};
const MATCH_END_TEXT = {
  ht: "Match fini",
  fr: "Match terminé",
  en: "Match finished",
  es: "Partido finalizado",
};
const CARD_LABEL = {
  yellow: { ht: "Katon jòn", fr: "Carton jaune", en: "Yellow card", es: "Tarjeta amarilla" },
  red: { ht: "Katon wouj", fr: "Carton rouge", en: "Red card", es: "Tarjeta roja" },
};
const SUB_LABEL = {
  ht: "Chanjman", fr: "Changement", en: "Substitution", es: "Cambio",
};

// Konstwi tit/kò yon notifikasyon otomatik — estil Sofascore: TIT la se
// non match la ("Kay - Deyò"), KÒ a se liy evènman an (minit + detay).
// Pa gen okenn emoji nan tèks la — jis logo Score Vision kòm icon.
function buildAutoNotif(sport, evType, lang, data) {
  const L = lang && MATCH_START_TEXT[lang] ? lang : "ht";
  const title = `${data.home} - ${data.away}`;
  const minute = data.minute ? `${data.minute}' ` : "";
  let body;

  if (evType === "matchStart") {
    body = MATCH_START_TEXT[L];
  } else if (evType === "goal") {
    const scoreWord = (SCORE_LABEL[sport] && SCORE_LABEL[sport][L]) || SCORE_LABEL.Soccer[L];
    body = `${minute}${scoreWord} : ${data.scoreHome} - ${data.scoreAway}${data.scorer ? "  " + data.scorer : ""}`;
  } else if (evType === "card") {
    const cardWord = CARD_LABEL[data.cardColor === "red" ? "red" : "yellow"][L];
    body = `${minute}${cardWord} : ${data.player || "?"}${data.team ? " (" + data.team + ")" : ""}`;
  } else if (evType === "substitution") {
    body = `${minute}${SUB_LABEL[L]} : ${data.player || "?"}${data.team ? " (" + data.team + ")" : ""}`;
  } else if (evType === "matchEnd") {
    body = `${MATCH_END_TEXT[L]} : ${data.scoreHome} - ${data.scoreAway}`;
  } else {
    body = "";
  }

  return { title, body, icon: SCORE_VISION_LOGO_URL };
}

async function checkMatchesAndNotify(env) {
  const log = { checked: 0, notifications: 0, errors: [], statusesSeen: [] };

  try {
    const events = await fetchLiveEvents(env);
    log.checked = events.length;
    log.statusesSeen = [...new Set(events.map((e) => e.strStatus))];
    if (events.length === 0) return log;

    const toNotify = [];
    for (const ev of events) {
      const matchId = ev.idEvent;
      const homeScore = parseInt(ev.intHomeScore ?? "0") || 0;
      const awayScore = parseInt(ev.intAwayScore ?? "0") || 0;
      const status = ev.strStatus || "";
      const minute = ev.strProgress || null;

      const prevRaw = await env.MATCH_STATE.get(`match:${matchId}`);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;

      const sport = ev._sport || "Soccer";
      const league = ev.strLeague || "";

      let seenTimeline = prev?.seenTimeline || [];

      if (!prev) {
        if (status === "In Progress" || status === "1H") {
          toNotify.push({ type: "matchStart", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null, minute });
        }
      } else {
        if (homeScore > prev.homeScore) {
          toNotify.push({ type: "goal", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strHomeTeam, minute });
        }
        if (awayScore > prev.awayScore) {
          toNotify.push({ type: "goal", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strAwayTeam, minute });
        }
        if (prev.status !== "Match Finished" && status === "Match Finished") {
          toNotify.push({ type: "matchEnd", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null, minute });
        }
      }

      // 🟨🟥🔁 Katon ak Chanjman — sèlman pou spò ki nan SPORTS_WITH_CARDS/
      // SPORTS_WITH_SUBS, epi sèlman pandan match la ap jwe (pa gen anyen
      // pou detekte si match la poko kòmanse oswa deja fini).
      const isLive = status === "In Progress" || status === "1H" || status === "2H" || status === "HT";
      if (isLive && (SPORTS_WITH_CARDS.includes(sport) || SPORTS_WITH_SUBS.includes(sport))) {
        try {
          const timeline = await fetchTimelineEvents(env, matchId);
          for (const t of timeline) {
            const tid = String(t.idTimeline || `${t.strTimeline}-${t.intTime}-${t.idPlayer || ""}`);
            if (seenTimeline.includes(tid)) continue;

            const team =
              String(t.idTeam) === String(ev.idHomeTeam) ? ev.strHomeTeam :
              String(t.idTeam) === String(ev.idAwayTeam) ? ev.strAwayTeam : "";
            const player = t.strPlayer || "";
            const tMinute = t.intTime || minute;

            if (SPORTS_WITH_CARDS.includes(sport) && t.strTimeline === "Yellow Card") {
              toNotify.push({ type: "card", cardColor: "yellow", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, player, team, minute: tMinute });
            } else if (SPORTS_WITH_CARDS.includes(sport) && t.strTimeline === "Red Card") {
              toNotify.push({ type: "card", cardColor: "red", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, player, team, minute: tMinute });
            } else if (SPORTS_WITH_SUBS.includes(sport) && t.strTimeline === "Substitution") {
              toNotify.push({ type: "substitution", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, player, team, minute: tMinute });
            } else {
              continue; // lòt kalite antre nan timeline (egzanp "Goal") — deja jere pi wo a
            }
            seenTimeline = [...seenTimeline, tid];
          }
        } catch (ex) {
          // Si timeline echwe (kota, match san detay, elatriye), nou senpleman
          // pa detekte katon/chanjman pou match sa a fwa sa a — pa kase rès la.
          log.errors.push(`timeline ${matchId}: ${ex.message}`);
        }
      }

      await env.MATCH_STATE.put(
        `match:${matchId}`,
        JSON.stringify({ homeScore, awayScore, status, sport, seenTimeline }),
        { expirationTtl: 60 * 60 * 6 }
      );
    }

    if (toNotify.length === 0) return log;

    const accessToken = await getGoogleAccessToken(env);
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    const tokens = await getFcmTokens(env, accessToken, projectId);

    for (const ev of toNotify) {
      // Sèlman moun ki gen menm spò a chwazi nan app la resevwa notifikasyon sa a.
      const targetTokens = tokens.filter((t) => (t.sport || "Soccer") === ev.sport);
      for (const t of targetTokens) {
        try {
          const data = {
            home: ev.h,
            away: ev.a,
            scoreHome: ev.hs,
            scoreAway: ev.as_,
            scorer: ev.scorer,
            player: ev.player,
            team: ev.team,
            cardColor: ev.cardColor,
            minute: ev.minute,
          };
          const content = buildAutoNotif(ev.sport, ev.type, t.lang, data);
          await sendPush(accessToken, projectId, t.token, content.title, content.body, content.icon);
          log.notifications++;
        } catch (e) {
          log.errors.push(e.message);
          // Si FCM di kle sa a pa valab ankò (aparèy dezenstale/deteni),
          // retire l nan Firestore pou li sispann akimile e voye doublon.
          if (e.invalidToken && t.docName) {
            try {
              await deleteFcmToken(accessToken, t.docName);
            } catch (delErr) {
              log.errors.push(`Pa kapab retire token mouri a: ${delErr.message}`);
            }
          }
        }
      }
    }
  } catch (e) {
    log.errors.push(e.message);
  }

  return log;
}

// Li timeline yon match espesifik (Katon/Chanjman/Gòl) — se menm
// lookuptimeline.php TheSportsDB ki sèvi tou nan sportsEventStats().
async function fetchTimelineEvents(env, matchId) {
  const key = env.SPORTS_API_KEY || "123";
  const res = await fetch(
    `https://www.thesportsdb.com/api/v1/json/${key}/lookuptimeline.php?id=${encodeURIComponent(matchId)}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.timeline || [];
}

async function fetchLiveEvents(env) {
  const results = await Promise.all(
    LIVE_SPORTS.map(async (sport) => {
      try {
        const res = await fetch(
          `https://www.thesportsdb.com/api/v2/json/livescore/${encodeURIComponent(sport)}`,
          { headers: { "X-API-KEY": env.SPORTS_API_KEY_V2 } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        const list = data.livescore || data.events || [];
        return list.map((e) => ({ ...e, _sport: sport }));
      } catch (ex) {
        // Yon spò ki echwe pa dwe anpeche lòt spò yo mache.
        console.log(`livescore V2 err (${sport}):`, ex.message);
        return [];
      }
    })
  );
  return results.flat();
}

async function getGoogleAccessToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaim = base64url(JSON.stringify(claim));
  const unsigned = `${encHeader}.${encClaim}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64urlFromBuffer(signature)}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Pa kapab otantifye ak Firebase (verifye FIREBASE_SERVICE_ACCOUNT)");
  return data.access_token;
}

async function importPrivateKey(pem) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(str) {
  return base64urlFromBuffer(new TextEncoder().encode(str));
}
function base64urlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFcmTokens(env, accessToken, projectId) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcmTokens`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!data.documents) return [];
  // Dedup pa VALÈ token la (pa doc ID sèlman) — si de dokiman diferan
  // ta gen menm valè token (kopi/erè done), nou voye yon sèl fwa.
  const byToken = new Map();
  data.documents.forEach((doc) => {
    const raw = doc.fields?.token?.stringValue;
    if (!raw) return;
    const token = raw.trim();
    if (!token) return;
    byToken.set(token, {
      token,
      lang: doc.fields?.lang?.stringValue || "ht",
      sport: doc.fields?.sport?.stringValue || "Soccer", // spò/chanpyona moun nan chwazi nan app la
      docName: doc.name, // rezoud chemen konplè Firestore a — bezwen l pou ka retire token mouri
    });
  });
  return [...byToken.values()];
}

/* ══════════════════ NOTIFIKASYON MANYÈL (pushQueue) — rete jan l te ye ══════════════════
   Sa a se SÈL fason ki rete pou "pèsonalize" yon notifikasyon: Admin ekri yon
   tit/mesaj limenm nan panel la (ak yon imaj si l vle), sa kreye yon dokiman
   nan pushQueue ak status:'pending', epi Worker la voye l bay tout moun (oswa
   yon spò espesifik) — endepandan de sistèm otomatik gòl/katon/chanjman anwo a. */

// Li tout dokiman ki nan koleksyon Firestore `pushQueue` ak status:'pending'
// (kreye pa bouton "📣 Voye Notifikasyon Manyèl" nan panel Admin lan).
async function getPendingPushQueue(env, accessToken, projectId) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/pushQueue`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Firestore pushQueue HTTP ${res.status}`);
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents
    .map((doc) => ({ ...fsFieldsToObj(doc.fields || {}), docName: doc.name }))
    .filter((d) => (d.status || "pending") === "pending");
}

// Konvèti yon sèl valè Firestore REST (fòma { stringValue }, { mapValue }, elatriye)
// an yon valè JavaScript senp (string/number/boolean/null/objè/tablo).
function fsValueToJs(value) {
  if (value == null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return parseInt(value.integerValue, 10);
  if ("doubleValue" in value) return value.doubleValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return fsFieldsToObj(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fsValueToJs);
  return null;
}
// Konvèti yon objè "fields" Firestore REST konplè an yon objè JS nòmal.
function fsFieldsToObj(fields) {
  const out = {};
  for (const key in fields) out[key] = fsValueToJs(fields[key]);
  return out;
}

// Make yon dokiman pushQueue kòm trete (sent/error), pou li pa voye an doub
// nan pwochen sik cron (chak 2 minit) la.
async function markPushQueueDone(accessToken, docName, status, sentCount, errorMsg) {
  const fields = {
    status: { stringValue: status },
    sentCount: { integerValue: String(sentCount || 0) },
    processedAt: { timestampValue: new Date().toISOString() },
  };
  if (errorMsg) fields.error = { stringValue: String(errorMsg).slice(0, 500) };
  const masks = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join("&");
  const res = await fetch(`https://firestore.googleapis.com/v1/${docName}?${masks}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore pushQueue update HTTP ${res.status}`);
}

// Trete "Notifikasyon Manyèl" yo: li chak dokiman 'pending' nan pushQueue,
// jwenn bon sib la (tout moun, oswa sèlman yon spò espesifik), voye push la
// bay FCM, epi make dokiman an kòm trete pou l pa voye an doub.
async function processPushQueue(env) {
  const log = { queued: 0, sent: 0, errors: [] };
  if (!env.FIREBASE_SERVICE_ACCOUNT) return log;

  try {
    const accessToken = await getGoogleAccessToken(env);
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;

    const pending = await getPendingPushQueue(env, accessToken, projectId);
    log.queued = pending.length;
    if (pending.length === 0) return log;

    const tokens = await getFcmTokens(env, accessToken, projectId);

    for (const q of pending) {
      try {
        if (!q.title || !q.body) {
          await markPushQueueDone(accessToken, q.docName, "error", 0, "tit oswa mesaj vid");
          continue;
        }
        const targetTokens =
          q.target && q.target !== "all"
            ? tokens.filter((t) => (t.sport || "Soccer") === q.target)
            : tokens;

        // Si Admin pa presize yon icon/imaj pou notifikasyon manyèl la,
        // nou tonbe sou logo Score Vision an, menm jan ak notifikasyon otomatik yo.
        const icon = q.icon || SCORE_VISION_LOGO_URL;

        let sentCount = 0;
        const errs = [];
        for (const t of targetTokens) {
          try {
            await sendPush(accessToken, projectId, t.token, q.title, q.body, icon, q.image);
            sentCount++;
          } catch (e) {
            errs.push(e.message);
            if (e.invalidToken && t.docName) {
              try {
                await deleteFcmToken(accessToken, t.docName);
              } catch (_) {}
            }
          }
        }
        log.sent += sentCount;
        if (errs.length) log.errors.push(...errs);
        await markPushQueueDone(accessToken, q.docName, "sent", sentCount, errs[0]);
      } catch (e) {
        log.errors.push(e.message);
        try {
          await markPushQueueDone(accessToken, q.docName, "error", 0, e.message);
        } catch (_) {}
      }
    }
  } catch (e) {
    log.errors.push(e.message);
  }

  return log;
}

// Retire yon dokiman fcmTokens ki gen yon token FCM ki pa valab ankò
// (aparèy dezenstale, token ekspire, elatriye) — sa anpeche akimilasyon
// tokens mouri ki ka lakòz doublon notifikasyon sou tan.
async function deleteFcmToken(accessToken, docName) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${docName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Firestore delete ${res.status}`);
}

// ⚠️ IMAJ/ICON: FCM (Android "big picture" ak Web Push icon) mande yon URL
// https:// piblik li ka telechaje — yon "data:image/..;base64,.." PA ka
// mache isit la, paske sèvè Google/FCM pa ka "telechaje" yon data URI konsa.
function isHttpImageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

async function sendPush(accessToken, projectId, token, title, body, icon, bigImage) {
  const message = { token, notification: { title, body } };

  // Big picture / imaj rich — sèlman si se yon lyen https:// piblik.
  const image = isHttpImageUrl(bigImage) ? bigImage : (isHttpImageUrl(icon) ? icon : null);
  if (image) message.notification.image = image;

  // Icon/imaj Web Push (navigatè/PWA) — rezoud kote NAVIGATÈ moun nan ye,
  // kidonk yon chemen relatif tankou "/icon-192.png" mache tou.
  if (icon || image) {
    message.webpush = { notification: {} };
    if (icon) message.webpush.notification.icon = icon;
    if (image) message.webpush.notification.image = image;
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`FCM ${res.status} pou token ${token.slice(0, 12)}...: ${errText}`);
    try {
      const parsed = JSON.parse(errText);
      const detail = parsed?.error?.details?.find((d) => d.errorCode);
      if (detail && (detail.errorCode === "UNREGISTERED" || detail.errorCode === "INVALID_ARGUMENT")) {
        err.invalidToken = true;
      }
    } catch (_) {}
    throw err;
  }
}
