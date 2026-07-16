/**
 * Football IA — Secure Worker
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

      if (path === "/" ) return json({ ok: true, service: "football-ia-worker" });

      return json({ error: "Wout la pa egziste" }, 404);
    } catch (err) {
      return json({ error: err.message || "Erè sèvè" }, 500);
    }
  },

  // 🔔 Sa a kouri otomatikman chak 2 minit (wè "crons" nan wrangler.toml) —
  // li detekte gòl/match k ap kòmanse/fini, epi voye push notification.
  // San SPORTS_API_KEY_V2 ak FIREBASE_SERVICE_ACCOUNT mete kòm Secrets,
  // li senpleman pa fè anyen (san erè, san danje).
  async scheduled(event, env, ctx) {
    if (!env.SPORTS_API_KEY_V2 || !env.FIREBASE_SERVICE_ACCOUNT) return;
    ctx.waitUntil(checkMatchesAndNotify(env));
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
        }
      });
      // ➕ Match ki AP JWE kounye a (dapre livescore V2) men ki pa parèt nan
      // rezilta eventsday.php a ditou (egzanp: dat/lig pa matche egzakteman) —
      // san sa a, match sa yo t ap voye notifikasyon gòl men pa janm parèt
      // nan lis app la. Nou ajoute yo kanmenm.
      liveMap.forEach((live, id) => {
        if (seen.has(id)) return;
        merged.push({
          idEvent: id,
          strHomeTeam: live.strHomeTeam || "?",
          strAwayTeam: live.strAwayTeam || "?",
          strLeague: live.strLeague || sport,
          strTime: live.strEventTime || live.strTime || null,
          dateEvent: live.dateEvent || d,
          strStatus: live.strStatus || "In Progress",
          intHomeScore: live.intHomeScore ?? null,
          intAwayScore: live.intAwayScore ?? null,
        });
        seen.add(id);
      });
    } catch (ex) {
      // Si V2 echwe pou nenpòt rezon (kota, rezo, elatriye), nou senpleman
      // kontinye ak done V1 yo — pa kite tout wout la tonbe pou sa.
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

/* ══════════════════ AI (Claude / Groq / Perplexity) ══════════════════ */

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

/* ══════════════════ NOTIFIKASYON (GÒL / MATCH) ══════════════════ */
/* Bezwen: env.MATCH_STATE (KV binding), env.SPORTS_API_KEY_V2 (Secret),
   env.FIREBASE_SERVICE_ACCOUNT (Secret — tout kontni fichye JSON la). */

// Spò nou siveye an tan reyèl pou notifikasyon yo (pa sèlman Soccer ankò).
const LIVE_SPORTS = ["Soccer", "Basketball", "American Football", "Baseball", "Ice Hockey"];

// Icon ki reprezante chak spò — konsa notifikasyon an pa toujou parèt ak
// yon boul foutbòl menm lè se yon match baskètbòl/foutbòl ameriken/elatriye.
const SPORT_ICON = {
  Soccer: "⚽",
  Basketball: "🏀",
  "American Football": "🏈",
  Baseball: "⚾",
  "Ice Hockey": "🏒",
};

// Tradiksyon mesaj notifikasyon yo — matche ak lang moun nan chwazi nan app
// la (ht/fr/en/es), anrejistre nan chan "lang" doc fcmTokens la. Titr yo pa
// gen okenn icon "codé an dur" ankò — icon ki koresponn ak spò a mete devan
// pa notifText() pi ba, dinamikman.
const NOTIF_TEXT = {
  ht: {
    matchStart: (h, a) => ({ title: `Match kòmanse!`, body: `${h} vs ${a} vin kòmanse.` }),
    goal: (scorer, h, a, hs, as_) => ({ title: `GÒL! ${scorer}`, body: `${h} ${hs} - ${as_} ${a}` }),
    matchEnd: (h, a, hs, as_) => ({ title: `🏁 Match fini`, body: `${h} ${hs} - ${as_} ${a}` }),
  },
  fr: {
    matchStart: (h, a) => ({ title: `Le match a commencé !`, body: `${h} vs ${a} vient de commencer.` }),
    goal: (scorer, h, a, hs, as_) => ({ title: `BUT ! ${scorer}`, body: `${h} ${hs} - ${as_} ${a}` }),
    matchEnd: (h, a, hs, as_) => ({ title: `🏁 Match terminé`, body: `${h} ${hs} - ${as_} ${a}` }),
  },
  en: {
    matchStart: (h, a) => ({ title: `Match started!`, body: `${h} vs ${a} has kicked off.` }),
    goal: (scorer, h, a, hs, as_) => ({ title: `GOAL! ${scorer}`, body: `${h} ${hs} - ${as_} ${a}` }),
    matchEnd: (h, a, hs, as_) => ({ title: `🏁 Match finished`, body: `${h} ${hs} - ${as_} ${a}` }),
  },
  es: {
    matchStart: (h, a) => ({ title: `¡Comenzó el partido!`, body: `${h} vs ${a} ha comenzado.` }),
    goal: (scorer, h, a, hs, as_) => ({ title: `¡GOL! ${scorer}`, body: `${h} ${hs} - ${as_} ${a}` }),
    matchEnd: (h, a, hs, as_) => ({ title: `🏁 Partido finalizado`, body: `${h} ${hs} - ${as_} ${a}` }),
  },
};
// icon: pou matchStart/goal, mete icon spò a devan titr la. Pou matchEnd,
// titr la deja gen 🏁 (drapo fini a se inivèsèl, li fè sans pou tout spò).
function notifText(lang, type, icon, ...args) {
  const dict = NOTIF_TEXT[lang] || NOTIF_TEXT.ht;
  const { title, body } = dict[type](...args);
  const finalTitle = type === "matchEnd" ? title : `${icon} ${title}`;
  return { title: finalTitle, body };
}

async function checkMatchesAndNotify(env) {
  const log = { checked: 0, notifications: 0, errors: [], statusesSeen: [] };

  try {
    const events = await fetchLiveEvents(env);
    log.checked = events.length;
    // Dyagnostik: montre egzakteman ki valè estati TheSportsDB voye, pou
    // konfime yo matche ak "In Progress"/"1H"/"Match Finished" anba a.
    log.statusesSeen = [...new Set(events.map((e) => e.strStatus))];
    if (events.length === 0) return log;

    const toNotify = [];
    for (const ev of events) {
      const matchId = ev.idEvent;
      const homeScore = parseInt(ev.intHomeScore ?? "0") || 0;
      const awayScore = parseInt(ev.intAwayScore ?? "0") || 0;
      const status = ev.strStatus || "";

      const prevRaw = await env.MATCH_STATE.get(`match:${matchId}`);
      const prev = prevRaw ? JSON.parse(prevRaw) : null;

      const sport = ev._sport || "Soccer";

      if (!prev) {
        if (status === "In Progress" || status === "1H") {
          toNotify.push({ type: "matchStart", sport, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null });
        }
      } else {
        if (homeScore > prev.homeScore) {
          toNotify.push({ type: "goal", sport, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strHomeTeam });
        }
        if (awayScore > prev.awayScore) {
          toNotify.push({ type: "goal", sport, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strAwayTeam });
        }
        if (prev.status !== "Match Finished" && status === "Match Finished") {
          toNotify.push({ type: "matchEnd", sport, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null });
        }
      }

      await env.MATCH_STATE.put(
        `match:${matchId}`,
        JSON.stringify({ homeScore, awayScore, status, sport }),
        { expirationTtl: 60 * 60 * 6 }
      );
    }

    if (toNotify.length === 0) return log;

    const accessToken = await getGoogleAccessToken(env);
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    const tokens = await getFcmTokens(env, accessToken, projectId);

    for (const ev of toNotify) {
      const icon = SPORT_ICON[ev.sport] || "⚽";
      for (const t of tokens) {
        try {
          const { title, body } =
            ev.type === "matchStart"
              ? notifText(t.lang, "matchStart", icon, ev.h, ev.a)
              : ev.type === "matchEnd"
              ? notifText(t.lang, "matchEnd", icon, ev.h, ev.a, ev.hs, ev.as_)
              : notifText(t.lang, "goal", icon, ev.scorer, ev.h, ev.a, ev.hs, ev.as_);
          await sendPush(accessToken, projectId, t.token, title, body);
          log.notifications++;
        } catch (e) {
          log.errors.push(e.message);
          // 🧹 Si FCM di kle sa a pa valab ankò (aparèy dezenstale/deteni),
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
  // 🧹 Dedup pa VALÈ token la (pa doc ID sèlman) — si de dokiman diferan
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
      docName: doc.name, // rezoud chemen konplè Firestore a — bezwen l pou ka retire token mouri
    });
  });
  return [...byToken.values()];
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

async function sendPush(accessToken, projectId, token, title, body) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: { token, notification: { title, body } },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // Si FCM reponn ak yon erè (kle envalid, move projet, token ekspire,
    // elatriye), nou dwe voye sa monte kòm erè — pa kite l pase an silans,
    // sinon log.notifications++ ap kontinye konte "siksè" ki pa t janm rive.
    const err = new Error(`FCM ${res.status} pou token ${token.slice(0, 12)}...: ${errText}`);
    // 🔎 Idantifye si se yon token ki mouri pou tout tan (aparèy dezenstale,
    // app dezabòne, elatriye) — sa a se sèl ka kote nou ta dwe netwaye
    // Firestore. Lòt erè (rezo, kota, kle envalid) rete jis erè tanporè.
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
