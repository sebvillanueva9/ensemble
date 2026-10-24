// PROTOTYPE — throwaway. Never merged. Answers wayfinder ticket
// "Probe Netflix player behaviour: seek precision and episode transitions"
// (https://github.com/sebvillanueva9/ensemble/issues/13).
//
// How to run: open a Netflix /watch/<id> page in Chrome, open DevTools → Console,
// paste this whole file, press Enter. (Chrome may ask you to type "allow pasting" first.)
// The transition logger starts at once. Then run, one at a time:
//
//   await ensembleProbe.clockTest()      // ~30s, player clock vs <video> clock
//   await ensembleProbe.seekTest()       // ~2 min, 24 seeks of various sizes
//   await ensembleProbe.freezeTest()     // ~1 min, short pause/resume; WATCH THE SCREEN for jank
//   ensembleProbe.mark("clicked Next")   // annotate the transition log as you do things
//   copy(ensembleProbe.report())         // copies all results as JSON to the clipboard
//
// Transitions to try with the logger running: let the credits countdown autoplay the
// next episode; click Next episode; pick another episode from the episode list; press
// browser Back. If the page does a full reload, paste the snippet again: the log is kept
// in sessionStorage and the re-run records that a full load happened.
(() => {
  const STORE = "ensembleProbe.v1";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();
  const saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
  const results = saved || { clock: [], seeks: [], freezes: [], transitions: [], loads: [] };
  const save = () => sessionStorage.setItem(STORE, JSON.stringify(results));

  if (window.ensembleProbe) window.ensembleProbe.stop();

  // Wall-clock stamps so logs from separate page loads line up.
  const log = (kind, data = {}) => {
    const entry = { at: Date.now(), kind, ...data };
    results.transitions.push(entry);
    save();
    console.log("[probe]", kind, data);
  };
  const previousOrigin = saved?.loads.at(-1)?.timeOrigin;
  results.loads.push({ at: Date.now(), timeOrigin: performance.timeOrigin, path: location.pathname });
  if (saved) log("snippet re-run", { fullLoadSincePrevious: previousOrigin !== performance.timeOrigin });

  // --- Netflix internal API, as recommended by the player-control research ---
  const vp = () => window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
  const watchId = () => location.pathname.match(/\/watch\/(\d+)/)?.[1];
  const sessionInfo = () => {
    const api = vp();
    return api.getAllPlayerSessionIds().map((id) => {
      const p = api.getVideoPlayerBySessionId(id);
      const el = typeof p.getElement === "function" ? p.getElement() : null;
      return {
        id,
        movieId: String(p.getMovieId()),
        t: Math.round(p.getCurrentTime()),
        paused: p.isPaused(),
        inWatchVideo: el ? !!el.closest(".watch-video") : null,
      };
    });
  };
  const pickSessionId = () =>
    sessionInfo().find((s) => s.id.startsWith("watch") && s.movieId === watchId() && s.inWatchVideo !== false)?.id;
  const player = () => {
    const id = pickSessionId();
    if (!id) throw new Error("no matching watch session for /watch/" + watchId());
    return vp().getVideoPlayerBySessionId(id);
  };
  const video = () => document.querySelector(".watch-video video") || document.querySelector("video");

  const until = async (pred, timeoutMs) => {
    const start = now();
    while (now() - start < timeoutMs) {
      if (pred()) return now();
      await sleep(10);
    }
    return null;
  };
  const once = (el, ev, timeoutMs) =>
    new Promise((res) => {
      const h = () => { clearTimeout(t); res(now()); };
      const t = setTimeout(() => { el.removeEventListener(ev, h); res(null); }, timeoutMs);
      el.addEventListener(ev, h, { once: true });
    });
  const ensurePlaying = async () => {
    const p = player();
    if (p.isPaused()) { p.play(); await sleep(1500); }
  };
  const stats = (xs) => {
    const s = xs.filter((x) => x != null).sort((a, b) => a - b);
    if (!s.length) return null;
    const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return { n: s.length, min: s[0], median: q(0.5), p90: q(0.9), max: s.at(-1), mean: Math.round(mean) };
  };

  // --- Player clock vs <video> clock ---
  async function clockTest({ seconds = 30, everyMs = 100 } = {}) {
    await ensurePlaying();
    const samples = [];
    const end = now() + seconds * 1000;
    while (now() < end) {
      const p = player(), v = video();
      samples.push({ wall: now(), player: p.getCurrentTime(), video: v.currentTime * 1000 });
      await sleep(everyMs);
    }
    const offsets = samples.map((s) => Math.round(s.video - s.player));
    const first = samples[0], last = samples.at(-1);
    const run = { at: Date.now(), offsetMs: stats(offsets), playerRate: (last.player - first.player) / (last.wall - first.wall) };
    results.clock.push(run);
    save();
    console.table(run.offsetMs);
    console.log("player clock rate vs wall:", run.playerRate.toFixed(4));
    return run;
  }

  // --- Seek latency and precision ---
  // Deltas cover the small corrections a Resync would make and the large jumps a Partner makes.
  const DELTAS = [300, -300, 700, -700, 1500, -1500, 3000, -3000, 10000, -10000, 60000, -60000];
  async function seekTest({ rounds = 2, settleMs = 2000 } = {}) {
    for (let r = 0; r < rounds; r++) {
      for (const delta of DELTAS) {
        await ensurePlaying();
        await sleep(settleMs);
        const p = player(), v = video();
        const dur = p.getDuration();
        const target = Math.max(5000, Math.min(dur - 300000, p.getCurrentTime() + delta));
        const seeked = once(v, "seeked", 10000);
        const t0 = now();
        p.seek(target);
        const tSeeked = await seeked;
        const landed = p.getCurrentTime();
        const atSeeked = landed;
        const tResumed = await until(() => p.getCurrentTime() > atSeeked + 20 && !p.isPaused(), 10000);
        await sleep(1000);
        const pos = p.getCurrentTime();
        // If playback restarted at `target` exactly when it resumed, pos would equal this:
        const expected = tResumed ? target + (now() - tResumed) : null;
        const sample = {
          delta,
          toSeekedMs: tSeeked && Math.round(tSeeked - t0),
          toResumedMs: tResumed && Math.round(tResumed - t0),
          landingErrMs: Math.round(landed - target),
          settledErrMs: expected && Math.round(pos - expected),
          videoMinusPlayerMs: Math.round(v.currentTime * 1000 - pos),
        };
        results.seeks.push(sample);
        save();
        console.log("[probe] seek", sample);
      }
    }
    return summarizeSeeks();
  }
  function summarizeSeeks() {
    const s = results.seeks;
    const small = s.filter((x) => Math.abs(x.delta) <= 3000), large = s.filter((x) => Math.abs(x.delta) > 3000);
    const row = (xs) => ({
      toSeeked: stats(xs.map((x) => x.toSeekedMs)),
      toResumed: stats(xs.map((x) => x.toResumedMs)),
      absLandingErr: stats(xs.map((x) => Math.abs(x.landingErrMs))),
      absSettledErr: stats(xs.map((x) => x.settledErrMs == null ? null : Math.abs(x.settledErrMs))),
    });
    const summary = { "small (≤3s)": row(small), "large (>3s)": row(large) };
    for (const [k, v] of Object.entries(summary)) { console.log(k); console.table(v); }
    return summary;
  }

  // --- Freeze-to-correct: pause briefly, resume, see how much Drift was actually shed ---
  async function freezeTest({ durations = [150, 300, 600, 1000], repeats = 3 } = {}) {
    console.log("[probe] freeze test: watch the picture and sound for stutter, black frames or spinners");
    for (const d of durations) {
      for (let i = 0; i < repeats; i++) {
        await ensurePlaying();
        await sleep(2500);
        const p = player();
        const pos0 = p.getCurrentTime(), t0 = now();
        p.pause();
        await sleep(d);
        p.play();
        const tResumed = await until(() => p.getCurrentTime() > pos0 + 20 && !p.isPaused(), 10000);
        await sleep(1000);
        const shed = now() - t0 - (p.getCurrentTime() - pos0);
        const sample = { pauseMs: d, shedMs: Math.round(shed), overheadMs: Math.round(shed - d), toResumedMs: tResumed && Math.round(tResumed - t0) };
        results.freezes.push(sample);
        save();
        console.log("[probe] freeze", sample);
      }
    }
    const byDur = Object.fromEntries(durations.map((d) => [d, stats(results.freezes.filter((f) => f.pauseMs === d).map((f) => f.overheadMs))]));
    console.table(byDur);
    console.log('[probe] now note what you saw: ensembleProbe.mark("freeze: 150ms invisible, 1000ms shows spinner")');
    return byDur;
  }

  // --- Transition logger: URL changes, sessions, post-play UI, video events ---
  const UIA = /next|autoplay|interrupt|postplay|credits|seamless|still|draining/i;
  const videoIds = new WeakMap();
  let nextVideoId = 1;
  const VIDEO_EVENTS = ["play", "pause", "waiting", "playing", "seeking", "seeked", "ended", "emptied", "loadstart", "stalled", "ratechange"];
  const hooked = new WeakSet();
  const hookVideo = (v) => {
    if (hooked.has(v)) return;
    hooked.add(v);
    videoIds.set(v, nextVideoId++);
    for (const ev of VIDEO_EVENTS) v.addEventListener(ev, () => log("video:" + ev, { video: videoIds.get(v), t: Math.round(v.currentTime * 1000), path: location.pathname }));
  };
  const snapshot = () => {
    let sessions = null, chosen = null, err = null;
    try { sessions = sessionInfo(); chosen = pickSessionId() || null; } catch (e) { err = String(e.message); }
    const videos = [...document.querySelectorAll("video")];
    videos.forEach(hookVideo);
    return {
      path: location.pathname,
      // positions omitted so the snapshot only changes on structural changes
      sessions: sessions && sessions.map(({ id, movieId, paused, inWatchVideo }) => ({ id, movieId, paused, inWatchVideo })),
      chosen,
      err,
      videos: videos.map((v) => videoIds.get(v)),
      uia: [...new Set([...document.querySelectorAll("[data-uia]")].map((e) => e.dataset.uia).filter((u) => UIA.test(u)))].sort(),
    };
  };

  const origPush = History.prototype.pushState, origReplace = History.prototype.replaceState;
  History.prototype.pushState = function (...a) { log("history.pushState", { url: String(a[2]) }); return origPush.apply(this, a); };
  History.prototype.replaceState = function (...a) { log("history.replaceState", { url: String(a[2]) }); return origReplace.apply(this, a); };
  const onPop = () => log("popstate", { path: location.pathname });
  const onNavigate = (e) => log("navigation:navigate", { type: e.navigationType, url: e.destination.url });
  const onUnload = () => log("beforeunload", { path: location.pathname });
  addEventListener("popstate", onPop);
  addEventListener("beforeunload", onUnload);
  window.navigation?.addEventListener("navigate", onNavigate);

  let last = "";
  const poll = setInterval(() => {
    const snap = snapshot();
    const key = JSON.stringify(snap);
    if (key !== last) {
      last = key;
      log("snapshot", snap);
    }
  }, 250);

  function stop() {
    clearInterval(poll);
    History.prototype.pushState = origPush;
    History.prototype.replaceState = origReplace;
    removeEventListener("popstate", onPop);
    removeEventListener("beforeunload", onUnload);
    window.navigation?.removeEventListener("navigate", onNavigate);
  }

  window.ensembleProbe = {
    clockTest,
    seekTest,
    freezeTest,
    mark: (note) => log("mark", { note }),
    report: () => JSON.stringify({ ua: navigator.userAgent, results, seekSummary: results.seeks.length ? summarizeSeeks() : null }, null, 1),
    reset: () => { sessionStorage.removeItem(STORE); console.log("[probe] cleared; paste the snippet again"); },
    stop,
    results,
  };
  console.log("[probe] ready. Logger running. Try: await ensembleProbe.clockTest()");
})();
