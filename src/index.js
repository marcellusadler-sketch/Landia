/**
 * Score Vision — Secure Worker (VÈSYON KORIJE + KLOCH PA CHANPYONA)
 * -----------------------------------------------------------------
 * 🆕 CHANJMAN NAN VÈSYON SA A:
 *  → aiGemini() kounye a pase paramèt `tools` la (si li prezan nan kò
 *    rekèt la) bay Gemini — sa pèmèt Worker la sèvi ak "grounding"
 *    (rechèch Google Search reyèl) pou kesyon sou match/rezilta espò,
 *    olye pou modèl la envante repons apati memwa li.
 * -----------------------------------------------------------------
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // ranplase ak domèn ou an pou plis sekirite
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

      if (path === "/notify/admin-push" && request.method === "POST")
        return await notifyAdminPush(request, env);

      if (path === "/notify/user-push" && request.method === "POST")
        return await notifyUserPush(request, env);

      if (path === "/run" && request.method === "GET")
        return json(await checkMatchesAndNotify(env));

      if (path === "/run-queue" && request.method === "GET")
        return json(await processPushQueue(env));

      if (path === "/" ) return json({ ok: true, service: "score-vision-worker" });

      return json({ error: "Wout la pa egziste" }, 404);
    } catch (err) {
      return json({ error: err.message || "Erè sèvè" }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return;
    if (env.SPORTS_API_KEY_V2) ctx.waitUntil(checkMatchesAndNotify(env));
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

const SPORT_MAP = {
  Soccer: "Soccer",
  Basketball: "Basketball",
  "American Football": "American Football",
  Baseball: "Baseball",
  "Ice Hockey": "Ice Hockey",
};

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

  const key = env.SPORTS_API_KEY || "123";

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
  const body = await request.json();
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
  const body = await request.json();
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
  const body = await request.json();
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
        // 🆕 Kite Worker la pase paramèt "tools" bay Gemini (egzanp
        // grounding ak Google Search: [{google_search:{}}]) — sa
        // pèmèt repons yo baze sou vrè rechèch entènèt olye pou
        // modèl la envante enfòmasyon apati memwa li.
        tools: body.tools,
      }),
    }
  );
  const data = await res.json();
  return json(data, res.status);
}

/* ══════════════════ NOTIFIKASYON (ESTIL SOFASCORE) ══════════════════ */

const LIVE_SPORTS = ["Soccer", "Basketball", "American Football", "Baseball", "Ice Hockey"];

const SPORTS_WITH_CARDS = ["Soccer"];
const SPORTS_WITH_SUBS = ["Soccer"];
const SPORTS_WITH_GOALS = ["Soccer"];

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

function buildAutoNotif(sport, evType, lang, data) {
  const L = lang && MATCH_START_TEXT[lang] ? lang : "ht";
  const title = `${data.home} - ${data.away}`;
  const minute = data.minute ? `${data.minute}' ` : "";
  let body;

  if (evType === "matchStart") {
    body = MATCH_START_TEXT[L];
  } else if (evType === "goal") {
    const scoreWord = (SCORE_LABEL[sport] && SCORE_LABEL[sport][L]) || SCORE_LABEL.Soccer[L];
    const scorerText = data.player ? `${data.player} (${data.scorer})` : data.scorer;
    body = `${minute}${scoreWord} : ${data.scoreHome} - ${data.scoreAway}${scorerText ? "  " + scorerText : ""}`;
  } else if (evType === "card") {
    const cardWord = CARD_LABEL[data.cardColor === "red" ? "red" : "yellow"][L];
    body = `${minute}${cardWord} : ${data.player || "?"}${data.team ? " (" + data.team + ")" : ""}`;
  } else if (evType === "substitution") {
    const inP = data.playerIn || "?";
    const outText = data.playerOut ? ` ⇄ ${data.playerOut}` : "";
    body = `${minute}${SUB_LABEL[L]} : ${inP}${outText}${data.team ? " (" + data.team + ")" : ""}`;
  } else if (evType === "matchEnd") {
    body = `${MATCH_END_TEXT[L]} : ${data.scoreHome} - ${data.scoreAway}`;
  } else {
    body = "";
  }

  return { title, body, icon: SCORE_VISION_LOGO_URL };
}

async function checkMatchesAndNotify(env) {
  const log = { checked: 0, notifications: 0, muted: 0, errors: [], statusesSeen: [] };

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

      const isLive = status === "In Progress" || status === "1H" || status === "2H" || status === "HT";
      const needsTimeline =
        isLive &&
        (SPORTS_WITH_CARDS.includes(sport) || SPORTS_WITH_SUBS.includes(sport) || SPORTS_WITH_GOALS.includes(sport));

      let timeline = [];
      if (needsTimeline) {
        try {
          timeline = await fetchTimelineEvents(env, matchId);
        } catch (ex) {
          log.errors.push(`timeline ${matchId}: ${ex.message}`);
        }
      }

      const findGoalScorer = (teamName) => {
        for (const t of timeline) {
          if (t.strTimeline !== "Goal" && t.strTimeline !== "Goal - Penalty") continue;
          const tid = String(t.idTimeline || `${t.strTimeline}-${t.intTime}-${t.idPlayer || ""}`);
          if (seenTimeline.includes(tid)) continue;
          const evTeam =
            String(t.idTeam) === String(ev.idHomeTeam) ? ev.strHomeTeam :
            String(t.idTeam) === String(ev.idAwayTeam) ? ev.strAwayTeam : "";
          if (evTeam === teamName && t.strPlayer) {
            seenTimeline = [...seenTimeline, tid];
            return t.strPlayer;
          }
        }
        return null;
      };

      if (!prev) {
        if (status === "In Progress" || status === "1H") {
          toNotify.push({ type: "matchStart", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null, player: null, minute });
        }
      } else {
        if (homeScore > prev.homeScore) {
          const scorerPlayer = SPORTS_WITH_GOALS.includes(sport) ? findGoalScorer(ev.strHomeTeam) : null;
          toNotify.push({ type: "goal", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strHomeTeam, player: scorerPlayer, minute });
        }
        if (awayScore > prev.awayScore) {
          const scorerPlayer = SPORTS_WITH_GOALS.includes(sport) ? findGoalScorer(ev.strAwayTeam) : null;
          toNotify.push({ type: "goal", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: ev.strAwayTeam, player: scorerPlayer, minute });
        }
        if (prev.status !== "Match Finished" && status === "Match Finished") {
          toNotify.push({ type: "matchEnd", sport, league, h: ev.strHomeTeam, a: ev.strAwayTeam, hs: homeScore, as_: awayScore, scorer: null, player: null, minute });
        }
      }

      if (isLive && (SPORTS_WITH_CARDS.includes(sport) || SPORTS_WITH_SUBS.includes(sport))) {
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
            toNotify.push({
              type: "substitution", sport, league,
              h: ev.strHomeTeam, a: ev.strAwayTeam,
              playerIn: t.strPlayer || "", playerOut: t.strAssist || "",
              team, minute: tMinute
            });
          } else {
            continue;
          }
          seenTimeline = [...seenTimeline, tid];
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
      const targetTokens = [];
      for (const t of tokens) {
        if ((t.sport || "Soccer") !== ev.sport) continue;
        const muted = Array.isArray(t.mutedLeagues) && ev.league && t.mutedLeagues.includes(ev.league);
        if (muted) {
          log.muted++;
          continue;
        }
        targetTokens.push(t);
      }

      for (const t of targetTokens) {
        try {
          const data = {
            home: ev.h,
            away: ev.a,
            scoreHome: ev.hs,
            scoreAway: ev.as_,
            scorer: ev.scorer,
            player: ev.player,
            playerIn: ev.playerIn,
            playerOut: ev.playerOut,
            team: ev.team,
            cardColor: ev.cardColor,
            minute: ev.minute,
          };
          const content = buildAutoNotif(ev.sport, ev.type, t.lang, data);
          await sendPush(accessToken, projectId, t.token, content.title, content.body, content.icon);
          log.notifications++;
        } catch (e) {
          log.errors.push(e.message);
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
  const byToken = new Map();
  data.documents.forEach((doc) => {
    const raw = doc.fields?.token?.stringValue;
    if (!raw) return;
    const token = raw.trim();
    if (!token) return;

    const mutedRaw = doc.fields?.mutedLeagues;
    let mutedLeagues = [];
    if (mutedRaw) {
      const parsed = fsValueToJs(mutedRaw);
      if (Array.isArray(parsed)) mutedLeagues = parsed.filter((x) => typeof x === "string");
    }

    byToken.set(token, {
      token,
      lang: doc.fields?.lang?.stringValue || "ht",
      sport: doc.fields?.sport?.stringValue || "Soccer",
      mutedLeagues,
      docName: doc.name,
    });
  });
  return [...byToken.values()];
}

/* ══════════════════ NOTIFIKASYON ADMIN (push menm si Admin.html fèmen) ══════════════════ */

async function getAdminPushTokens(env, accessToken, projectId) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/adminPushTokens`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Firestore adminPushTokens HTTP ${res.status}`);
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map((doc) => ({
    token: doc.name.split("/").pop(),
    docName: doc.name,
  }));
}

async function notifyAdminPush(request, env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT pa konfigire sou Worker la" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "JSON envalid" }, 400);
  }
  const { title, body: msgBody, target } = body || {};
  if (!title || !msgBody) return json({ error: "title ak body obligatwa" }, 400);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    const tokens = await getAdminPushTokens(env, accessToken, projectId);

    if (tokens.length === 0) {
      return json({ ok: true, sent: 0, note: "Pa gen telefòn admin anrejistre (adminPushTokens vid)" });
    }

    let sent = 0;
    const errors = [];
    for (const t of tokens) {
      try {
        await sendPush(accessToken, projectId, t.token, title, msgBody, SCORE_VISION_LOGO_URL, null, target ? { target } : null);
        sent++;
      } catch (e) {
        errors.push(e.message);
        if (e.invalidToken) {
          try {
            await deleteFcmToken(accessToken, t.docName);
          } catch (_) {}
        }
      }
    }
    return json({ ok: true, sent, total: tokens.length, errors: errors.slice(0, 3) });
  } catch (e) {
    return json({ error: e.message || "Erè sèvè" }, 500);
  }
}

/* ══════════════════ NOTIFIKASYON ITILIZATÈ (repons Admin nan tchat Kontak) ══════════════════ */

async function notifyUserPush(request, env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    return json({ error: "FIREBASE_SERVICE_ACCOUNT pa konfigire sou Worker la" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "JSON envalid" }, 400);
  }
  const { token, title, body: msgBody, target } = body || {};
  if (!token || !title || !msgBody) {
    return json({ error: "token, title ak body obligatwa" }, 400);
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT).project_id;
    await sendPush(
      accessToken,
      projectId,
      token,
      title,
      msgBody,
      SCORE_VISION_LOGO_URL,
      null,
      target ? { target } : null
    );
    return json({ ok: true, sent: 1 });
  } catch (e) {
    return json({ error: e.message || "Erè sèvè", invalidToken: !!e.invalidToken }, 500);
  }
}

/* ══════════════════ NOTIFIKASYON MANYÈL (pushQueue) ══════════════════ */

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
function fsFieldsToObj(fields) {
  const out = {};
  for (const key in fields) out[key] = fsValueToJs(fields[key]);
  return out;
}

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

async function deleteFcmToken(accessToken, docName) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${docName}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Firestore delete ${res.status}`);
}

function isHttpImageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

async function sendPush(accessToken, projectId, token, title, body, icon, bigImage, data) {
  const message = { token, notification: { title, body } };

  if (data && typeof data === "object") {
    message.data = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  }

  const image = isHttpImageUrl(bigImage) ? bigImage : (isHttpImageUrl(icon) ? icon : null);
  if (image) message.notification.image = image;

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
