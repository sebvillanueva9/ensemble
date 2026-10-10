# Netflix title identity across regions with one shared account

Research for [#7](https://github.com/sebvillanueva9/ensemble/issues/7). Researched 2026-10-09.

**Setup in question:** two Partners share one Netflix plan (no ads), each on their own profile. One Partner streams in a desktop Chrome browser from Bolivia (BO) and the other from France (FR), at the same time, during one Watch Session.

## Answer in brief

1. **Ids: one id per title, global (inferred, strong).** A movie or episode is a single numeric Netflix id, and as far as all the evidence shows, that id is the same in every country. Region decides whether the id *plays*, not what the id *is*. Netflix does not document this anywhere. It is inferred from how cross-country sync tools and catalog databases behave (see §1).
2. **Catalog: set by where the browser is, not by the account's home country (confirmed).** Each Partner sees the catalog of the country their connection is in. The BO Partner sees the BO catalog and the FR Partner sees the FR catalog, whatever country the account was created in. Profiles do not change the catalog. They only add maturity and language filters.
3. **A title missing in one region is a normal case, not an edge case (confirmed).** Licensed titles vary by country. Netflix Originals are the safest bet. The id is still valid, it just won't play there. An extension can probably detect this client-side (§3), but the exact signal needs a hands-on test.
4. **Two simultaneous streams fit Standard or Premium, not Basic (confirmed).** The cap is per account, not per profile. Standard allows exactly 2 streams, which leaves no headroom.
5. **Household and ToS risk (confirmed rules, unconfirmed enforcement).** Netflix's terms say an account may not be shared outside the household, and that content may be accessed "primarily within the country in which you have established your account". A device outside the Netflix Household can be blocked, with a "Watch Temporarily" code flow. Whether this fires for the Partner abroad in a desktop browser can only be found out by testing from both countries.

## 1. Is the same title or episode the same id in both regions?

### URL shapes (confirmed from code)

- `https://www.netflix.com/title/<id>` is the title page. For a series, `<id>` is the **show** id.
- `https://www.netflix.com/watch/<id>` is the player. The id here is the **movie or episode** id that is playing.
- Netflix's internal (undocumented) metadata endpoint maps an episode id to its show. `GET https://www.netflix.com/nq/website/memberapi/release/metadata?movieid=<id>` returns `video.id` (the show id), `video.type` (for example `movie`), `video.currentEpisode`, and `video.seasons[].episodes[].{id, seq}`. Sources:
  - MALSync's Netflix page handler, which reads the hostname and path from Netflix's page context rather than hard-coding them. Last changed 2024-04-05. [MALSync/MALSync `src/pages/Netflix/main.ts`](https://github.com/MALSync/MALSync/blob/master/src/pages/Netflix/main.ts)
  - PreMiD's Netflix activity, which hard-codes `/nq/website/memberapi/release/metadata?movieid=`. Last changed 2025-02-12. [PreMiD/Activities `websites/N/Netflix/functions/fetchMetadata.ts`](https://github.com/PreMiD/Activities/blob/main/websites/N/Netflix/functions/fetchMetadata.ts)

### Evidence that ids are global (inferred; no first-party statement exists)

- **Netflix Party (the original, now Teleparty) relied on matching ids across users.** It read the video id from `/watch/<id>` with `/^.*\/([0-9]+)\??.*/`. It refused to join a session when the joiner's id differed from the session's (`'That session is for a different video.'`). For next-episode sync it sent the other side to `https://www.netflix.com/watch/<otherEpisode>`. Netflix Party was used internationally, so it would have broken constantly if ids were per region. Source: the unpacked v1.7.8 extension mirrored at [kliu128/netflix-party-reborn `content_script.js`, `popup.js`](https://github.com/kliu128/netflix-party-reborn), last commit 2020-04-29. The code is old, but the URL scheme it relies on is unchanged today.
- **Teleparty's current FAQ** (undated, fetched 2026-10-09) says it works in every country. It tells users to "double-check that the show you want to watch together is available to everyone". In other words, availability is the constraint, not id mismatch. It also says "It is possible to use a shared account to join a party, but the account needs to be on a standard or premium plan." [teleparty.com/support](https://www.teleparty.com/support)
- **uNoGS models one Netflix id with many countries.** Its API has `GET /titlecountries?netflixid=<id>`, documented as "Get all countries associated with a particular Netflix ID". Source: a mirrored RapidAPI schema for `unogsng` ([Mysterchan/learning_to_ask `unogsng.json`](https://github.com/Mysterchan/learning_to_ask/blob/main/src/toolenv/tools/Media/unogsng.json)). The live RapidAPI page and unogs.com would not render for this research, and the mirror's capture date is unknown (likely around 2023).

### Caveats (unknown, test needed)

- **Same work, different id.** Nothing found rules out a licensed film or show existing under two different Netflix ids in two regions, for example a different cut, dub package or licensor. Netflix Originals are very unlikely to be affected. Licensed titles are the risk. **Hands-on test:** open the same licensed title from BO and FR and compare the `/title/<id>` and `/watch/<id>` ids.
- **Season packaging can differ by region.** For licensed series, one region may carry fewer seasons than the other. The episode ids that do exist should match. Season `seq` numbering is not guaranteed to match. Sync on the episode id, never on "S2E3".
- **`/watch/<showId>` is profile-dependent (inferred).** Opening `/watch` with a show id resumes *that profile's* current episode, which the metadata's `currentEpisode` reflects. Ensemble must exchange the **playing episode or movie id**, never a show id.

## 2. Which catalog does each profile see?

**Confirmed: the current location's catalog, determined from the network connection.**

- Netflix Help, "Using Netflix outside of your home" ([node/24853](https://help.netflix.com/en/node/24853), undated, fetched 2026-10-09). It says that when watching outside the sign-up country, the "Selection of TV shows and movies" differs because choices "vary by country", including audio and subtitle options. It also says "My List and Continue Watching titles may not be available", and maturity ratings follow the country you are in.
- Netflix Help, "Netflix thinks I'm in a different country" ([node/26100](https://help.netflix.com/en/node/26100)). Location comes from your connection. It tells you to check the country fast.com reports for your IP, and blames mismatches on VPNs, proxies and DNS.
- Netflix Help, "This title is not available in your current region" (E103, [node/109330](https://help.netflix.com/en/node/109330)). Travellers are told to sign out and back in so the device refreshes its location. **Implication:** a browser session can keep a stale country until it refreshes. If a Partner has just travelled, have them sign out and back in before a Watch Session.
- Netflix Help, VPN ([node/114701](https://help.netflix.com/en/node/114701), via search summary). With a VPN detected, Netflix shows only titles available globally. A Partner on a VPN therefore sees a *smaller* catalog. A VPN is not a fix, and the ToS restricts it.
- Netflix Terms of Use §1.5 ([legal/termsofuse](https://help.netflix.com/legal/termsofuse), "Last Updated: April 10, 2026"). Content is available only where Netflix "has licensed such content" and varies by location.
- Profile language filters browse and search ([node/117967](https://help.netflix.com/en/node/117967), via search summary). Whether it also blocks a direct `/watch/<id>` link is unknown. It probably does not, but this needs testing.

**For Ensemble:** the account's country (wherever it was created) does not decide what each Partner can play. Each Partner's *current country* does. The playable set for a Watch Session is the **intersection** of the BO and FR catalogs.

## 3. What happens when a `/watch/<id>` is not available in one region, and can an extension detect it?

### Confirmed (Netflix Help)

- Streaming: "This title is not available in your current region. Please select a different title." Can carry code **E103**. Causes listed: a VPN, recent travel, the title having been removed, or the wrong detected country ([node/109330](https://help.netflix.com/en/node/109330)).
- Downloads (not relevant to a browser): "This title is not available to watch in your area. (22004)" ([node/100277](https://help.netflix.com/en/node/100277)).
- A title can be missing in a region because rights are held elsewhere or exclusive to another service ([node/125345](https://help.netflix.com/en/node/125345), [node/4976](https://help.netflix.com/en/node/4976)).

### Detection options for an extension (inferred, needs hands-on test)

1. **Preflight with the metadata endpoint.** From the content script on `www.netflix.com`, which has the same origin and the user's cookies, call `…/metadata?movieid=<id>` before navigating. MALSync treats a response with no `video` as "no data found". *Unknown:* what this returns for a valid id that is unavailable in the caller's region (404, an empty body, or a `video` object with an availability flag). This is the best candidate. It lets Ensemble check availability on the *receiving* Partner's side before telling them to navigate.
2. **Observe after navigation.** Navigate to `/watch/<id>` and watch for one of three things: a redirect away from `/watch` (for example to `/browse` or `/title/…`), the E103 error UI, or no `<video>` element appearing within a timeout. This is more brittle because it is DOM and timing dependent, but it works without the internal API.
3. **Prefer Netflix Originals.** Teleparty itself recommends this, and Originals are generally available in every country.

The undocumented `memberapi` path can change without notice. MALSync reads it from the page's `reactContext` instead of hard-coding it, which is the more robust pattern.

**For Ensemble:** the side that changes title or episode should send the episode id. The receiving side checks it and reports "not available here" back to the session. Ensemble must not fail silently. The same check applies on **episode changes**: the next episode can exist in one region and not the other when season counts differ.

## 4. One account, two countries, at the same time

### Concurrent streams (confirmed)

- Netflix Help, Plans and Pricing ([node/24926](https://help.netflix.com/en/node/24926), undated, fetched 2026-10-09): **Basic: 1 device at a time, Standard: 2, Premium: 4.** The page is localized, so plan names and prices vary by country. The stream counts are the stable part.
- ToS §1.5: the number of devices that can watch simultaneously depends on the plan and is shown on the Account page.
- **Implication:** a Watch Session uses 2 streams. On Standard, any third viewer on the account, such as someone else using another profile, pushes the account over the cap, and one Partner's player stops. Ensemble should surface that error rather than retrying blindly. **Unknown:** which device gets kicked and what the browser error looks like. Test this.

### Household and location rules (confirmed rules; enforcement on a desktop browser unknown)

- ToS §1.4: the service "may not be shared with anyone outside of your household", except through Extra Member accounts where available.
- ToS §1.5: content is accessed "primarily within the country in which you have established your account".
- ToS §3.1 and [node/123277](https://help.netflix.com/en/node/123277): an Extra Member can only be activated in the **same country** where the account owner created the account. A BO account cannot add an FR extra member, and the reverse is also true.
- A Netflix Household is "a collection of devices connected to the internet at the main place where you watch Netflix", established "based on IP address, device IDs, and account activity" ([node/124925](https://help.netflix.com/en/node/124925)).
- A device outside the household may see "Your device isn't part of the Netflix Household for this account". On a phone or computer the user can pick **Watch Temporarily**, which sends a code to the account owner's email or SMS. Codes expire after 15 minutes, there is a daily request limit, and repeated failures block the device for 24 hours ([node/127200](https://help.netflix.com/en/node/127200)).
- Travel is explicitly allowed, and so is a second home. For a second home, Netflix advises connecting from the main location about monthly ([node/24853](https://help.netflix.com/en/node/24853)).
- Paid sharing (Extra Member) has been live in France and Bolivia since May 2023. This comes from press reports ([Correo del Sur, 2023-05-26](https://correodelsur.com/genteflash/20230526_netflix-empieza-a-cobrar-por-cuentas-compartidas-en-bolivia.html), [Ozap](https://www.ozap.com/actu/netflix-annonce-la-fin-du-partage-de-compte-gratuit-en-france-et-dans-plus-de-100-pays-des-aujourd-hui/632282)), so household enforcement exists in both countries.

**For Ensemble:** a Partner who is *travelling* is within the rules. A Partner who *lives* abroad on the other Partner's account is outside the ToS, and is the case most likely to hit household blocks. Ensemble cannot and should not work around this. It should detect the household-block screen and report it as a reason the Watch Session cannot start. This is a product risk to note on the map, not a technical problem for Ensemble to solve.

## Risks and unknowns

| # | Unknown | Why it matters | How to settle it |
|---|---|---|---|
| 1 | Do any licensed titles have *different* ids in BO and FR? | Breaks "exchange the id" as the Watch Session's title key | Hands-on test: compare the ids of 2–3 licensed titles and 1 Original from both countries |
| 2 | What does the metadata endpoint return for an id that is unavailable in the caller's region? | Decides whether a preflight availability check is possible | Hands-on test: call it from FR for a BO-only id, and the reverse |
| 3 | What does `/watch/<id>` do in the browser when the id is unavailable (redirect, E103, blank)? | The fallback detection signal | Hands-on test from both countries |
| 4 | Does the household check block the abroad Partner's desktop browser, and how often? | Could make Watch Sessions impossible or cause friction | Hands-on test: an actual session from both countries over several days |
| 5 | What happens on the Standard plan when a third stream starts, and which device is cut? | Error handling in the Watch Session | Hands-on test, or check the plan on the Account page |
| 6 | Which plan does the shared account have? (Basic = 1 stream = blocker) | A hard prerequisite | Check the Account page |
| 7 | Does profile language filtering affect direct `/watch/<id>` links? | Could cause false "not available" results | Hands-on test |
| 8 | Does the undocumented `memberapi` path stay stable? | Maintenance risk | Read the path from the page context the way MALSync does, with DOM detection as a fallback |

## Source recency

| Source | Date |
|---|---|
| Netflix Terms of Use | Last Updated 2026-04-10 (fetched 2026-10-09) |
| Netflix Help Center articles | Undated; live pages fetched 2026-10-09 |
| Teleparty support FAQ | Undated; fetched 2026-10-09 |
| PreMiD Netflix activity (metadata fetch) | Last changed 2025-02-12 |
| MALSync Netflix handler | Last changed 2024-04-05 |
| Netflix Party v1.7.8 source mirror | 2020-04-29 (old; URL scheme still current) |
| uNoGS API schema mirror | Capture date unknown (about 2023) |
| Press reports on paid sharing in BO and FR | May 2023 |
