# Research: unlisted Chrome Web Store delivery

Ticket: [#5](https://github.com/sebvillanueva9/ensemble/issues/5). Researched 2026-10-09.

**Question.** Can Ensemble v1 ship as an **unlisted** Chrome Web Store (CWS) item, and what does that require of the design?

**Short answer.** Yes. Unlisted is a supported CWS visibility setting: the item is installable by anyone who has the link and does not show up in search. It costs a one-time developer registration fee (historically US$5) and nothing per month. It goes through the same review and policies as a public item, so "unlisted" does not loosen any rule. The policies that matter for the design are:

- all logic must ship in the package (no remotely hosted code);
- host access limited to Netflix;
- one narrow purpose;
- privacy disclosures filled in, plus a privacy policy, because the extension sends playback state to a server or peer.

A Netflix sync extension is clearly allowed: Teleparty, formerly "Netflix Party", is listed today with roughly 10M users. If the item were ever rejected, the fallback is "Load unpacked" in Developer mode, with manual updates. On Windows and macOS, Chrome blocks every other route that avoids the store, except enterprise policy, and that route still points at the CWS.

Legend: **Confirmed** means a primary source states it, and that source is cited. **Inferred** means it is my reasoning from confirmed facts, or something no primary source states.

---

## 1. Developer account and how unlisted works

| Claim | Status | Source (last-updated date shown on the page) |
|---|---|---|
| Registration requires agreeing to the developer agreement and policies and paying a **one-time** registration fee. | Confirmed | [Register your developer account](https://developer.chrome.com/docs/webstore/register) (2024-02-13) |
| The fee is **US$5**. | Confirmed in Google's 2020 announcement. **Not restated** on today's docs page (the amount appears only in a dashboard screenshot). | [Chromium Blog, 2020-03-12](https://blog.chromium.org/2020/03/new-developer-dashboard-and.html); the amount was not stated on the current register page when fetched |
| The account email **cannot be changed** after creation. Google recommends a dedicated address that someone checks often. | Confirmed | [Register](https://developer.chrome.com/docs/webstore/register) (2024-02-13) |
| **Bolivia and France** are both supported developer countries. | Confirmed | [Register, "Supported countries and regions"](https://developer.chrome.com/docs/webstore/register) (2024-02-13) |
| **2-Step Verification** is required on the developer account before publishing. | Confirmed | [Program Policies, "2-Step Verification"](https://developer.chrome.com/docs/webstore/program-policies/policies) (2025-05-22) |
| Every developer must declare **trader / non-trader** status (EU Digital Services Act). For a non-trader, users see a notice that EU consumer-protection rights don't apply. Traders must provide a verified legal name and contact details, which are shown to users. | Confirmed | [Trader/Non-Trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure) (2024-02-09) |
| Ensemble should declare **non-trader** (personal use, no business, no money). | Inferred. Google says this is the developer's own call. | same |
| Visibility options are **Public** (listed), **Unlisted** ("anyone with the link can install"; not in search or listings), and **Private** (only trusted testers or Google Groups). | Confirmed | [Distribution tab](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) (2020-12-07) |
| **All three visibility settings follow the same policy requirements and the same review.** | Confirmed | same |
| Private / trusted testers is an alternative to Unlisted: the item can be restricted to the two Partners' Google account emails. | Confirmed (the mechanism exists) | same |
| Unlisted is the better fit: the macOS Partner doesn't need to be signed into Chrome with a particular Google account. Desktop installs from the CWS don't require sign-in. | Inferred, based on the [Chrome Web Store help page](https://support.google.com/chrome_webstore/answer/2664769) saying desktop install has no sign-in step | (help page, undated) |

## 2. Review times and update propagation

| Claim | Status | Source |
|---|---|---|
| Most reviews finish "within a few days" but can take "up to a few weeks". Contact support if an item is pending more than 3 weeks. Google gives no percentages or SLA. | Confirmed | [Review process](https://developer.chrome.com/docs/webstore/review-process) (2021-12-10; the page says practices may change without notice) |
| Reviews take longer for **new developers, new extensions**, broad host permissions (e.g. `<all_urls>`), sensitive permissions (`tabs`, `cookies`, `webRequest`, `downloads`…), large code changes, and hard-to-read code. They can also take longer after a previous rejection. | Confirmed | same |
| **Updates go through the same review** as new items. Submitting an update doesn't affect the live version until it is approved. | Confirmed | [Update your item](https://developer.chrome.com/docs/webstore/update) (2020-12-03); [Review process](https://developer.chrome.com/docs/webstore/review-process) |
| Each update needs a full zip and a **strictly higher `version`**. | Confirmed | [Update your item](https://developer.chrome.com/docs/webstore/update) |
| **Deferred publish**: after an update passes review, you have up to 30 days to publish it before it goes back to draft. | Confirmed | [Publish](https://developer.chrome.com/docs/webstore/publish) (2014-02-28, old date); [Update](https://developer.chrome.com/docs/webstore/update) |
| Partial (percentage) rollout requires more than 10,000 seven-day active users, so Ensemble can't use it. Irrelevant for two users anyway. | Confirmed | [Update your item](https://developer.chrome.com/docs/webstore/update) |
| Chrome checks installed extensions for updates "**every few hours**". A user can force a check from `chrome://extensions` with Developer mode → **Update**. | Confirmed for the update mechanism in general (the page is about self-hosting). Applying it to CWS-installed items is **inferred**: same updater, and the CWS update URL is the default. | [Self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux) (2017-12-14, old date) |
| If an update adds a permission that **triggers a new warning**, Chrome **disables the extension until the user accepts**. | Confirmed | [Permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings) (2024-02-05) |

**Expected time from submitting a fix to both Partners running it.** Inferred: about 1–3 days of review, plus a few hours for auto-update. The first submission will probably be slower, because it is a new developer and a new extension. A non-technical Partner can't be expected to force the update, so plan as if a fix takes days.

## 3. Store policies that shape the design

| Policy | What it says | Design consequence (inferred unless marked) | Source |
|---|---|---|---|
| **MV3: no remotely hosted code** | "The full functionality of an extension must be easily discernible from its submitted code." Banned: `<script>` tags pointing outside the package, `eval` of fetched strings, and building an interpreter that runs commands fetched as data. Allowed: fetching data and configuration that contain no logic, syncing data with a remote server, and server-side processing. | Every line of Ensemble's logic ships in the zip. The sync channel (relay, WebSocket, WebRTC signalling, etc.) may only carry **data**: Playback Commands and positions, never code or instructions that get interpreted. A remote feature-flag config is fine if all the behaviour it switches already lives in the package. | [MV3 additional requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) (2024-04-03) |
| **Remote code declaration** | The Privacy tab asks whether the extension runs remote code. An undeclared remote call is grounds for rejection. | Answer "No, I am not using remote code". This stays true as long as the rule above holds. | [Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) (2020-06-12) |
| **Use of permissions** | "Request access to the narrowest permissions necessary." Broader permissions than needed "may cause your extension to be rejected". Each permission needs a written justification. | Use `host_permissions` / content-script `matches` only for `https://www.netflix.com/*`. No `<all_urls>`, and avoid `tabs`, `cookies` and `webRequest`. The relay server's origin needs host permission only if the extension does something cross-origin that requires it (check this when the transport is chosen). Adding hosts later disables the extension until the user accepts (see §2), so **decide the full permission set before the first release**. | [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) (2025-05-22); [Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) |
| **Single purpose** | "An extension must have a single purpose that is narrow and easy to understand." A narrow focus can include several related functions. Permissions unrelated to the purpose count as unrelated functionality. | Purpose statement: "Keep two people's Netflix playback in sync." Chat, reactions and similar features are probably acceptable if they serve watching together (Teleparty bundles chat), but keeping v1 to sync only makes review easiest. | [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq) (2024-07-10) |
| **Code readability** | No obfuscation. Minification is allowed but makes review slower. | Ship readable, ideally unminified, bundles. | [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies); [Review process](https://developer.chrome.com/docs/webstore/review-process) |
| **Privacy policy and Limited Use** | Any product that handles user data must post an accurate privacy policy. Collect only what the single purpose needs. Fill in the data-usage disclosures and the Limited Use certification. | Ensemble sends playback position, Playback Commands and probably a session ID to the other Partner (through a server or peer). It likely counts as "user activity" data, so publish a short privacy policy page (a GitHub Pages / repo Markdown URL costs $0) and declare that data in the Privacy tab. | [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies); [Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) |
| **Unauthorized access / copyright** | "Do not facilitate unauthorized access to content on websites, such as circumventing paywalls or login restrictions." "Do not encourage, facilitate, or enable the unauthorized access, download, or streaming of copyrighted content." | Each Partner watches on their **own** Netflix account. Ensemble must never stream, capture or re-broadcast video, and must never share credentials. It only sends control messages. This matches how Teleparty operates. | [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) (2025-05-22) |
| **Impersonation / IP** | "Don't pretend to be someone else." No infringement of others' IP. | Don't use the Netflix logo or name as the extension's branding or icon. Mentioning "works with Netflix" in the description is fine (Teleparty does it). | same |
| **Listing requirements** | Listings need accurate metadata, a description, an icon and screenshots. This applies to unlisted items too, since the policies are the same. | Prepare a 128px icon, at least one screenshot and a plain description. | same; [Distribution tab](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) |

Nothing in the CWS policies **specifically** governs interaction with third-party streaming sites. The relevant rules are the general ones above (permissions, unauthorized access, copyright, IP). Netflix's own Terms of Use are a separate matter and are not in scope here.

## 4. Rejection risk and fallback

**Prior art (confirmed).** "Netflix Party is now Teleparty" is publicly listed on the CWS: around 10M users, version 5.8.5, updated 2026-10-08. It names Netflix as a supported service ([listing](https://chromewebstore.google.com/detail/teleparty/oocalimimngaihdkbihfgmpkcpnmlaoa), fetched 2026-10-09). The category itself is therefore acceptable to Google.

**Likely rejection causes (inferred from the policies above).**
1. Permissions broader than Netflix, or missing or vague permission justifications.
2. Remote code: for example, injecting a script loaded from a server, or a message protocol that carries executable instructions.
3. Missing privacy policy or data disclosures while the extension sends data off the machine.
4. Missing listing assets or a vague single-purpose statement.
5. Netflix branding in the icon or name.

**If rejected (confirmed).** Google emails the developer, naming the policy that was violated and how to appeal. Rejections of non-egregious violations don't affect the existing listing. A violation decision can be appealed once. Support replies can take 3–7+ days ([Review process](https://developer.chrome.com/docs/webstore/review-process); [Program Policies, Enforcement](https://developer.chrome.com/docs/webstore/program-policies/policies)). Usually you just fix the issue and resubmit.

**Fallback channels.**

| Option | Works on Windows and macOS? | Notes |
|---|---|---|
| **Private** visibility (trusted testers) | Yes | Same review, so it doesn't help if the item was *rejected*. Useful only if unlisted somehow becomes unavailable. Confirmed in the [Distribution tab](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) doc. |
| **Load unpacked** (Developer mode) | Yes | Confirmed: `chrome://extensions` → Developer mode → Load unpacked ([Hello World tutorial](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world), 2022-10-04). No auto-update: each new version means replacing the folder and clicking reload. Too fiddly for the non-technical macOS Partner without hand-holding, but workable as an emergency path. Whether the extension persists across restarts and whether Chrome shows warning banners is **inferred**, not verified for Chrome as of 2026-10. |
| **Self-hosted .crx / external install** | **No** | Confirmed: "Linux is the only platform where Chrome users can install extensions that are hosted outside of the Chrome Web Store." On Windows and macOS, external installs (registry / preferences JSON) must point their `update_url` at the CWS, and local CRX paths are blocked ([Self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux), 2017-12-14; [Alternative install methods](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions), 2012-09-17, old date). |
| **Enterprise policy** | Technically yes | It still points at the CWS, and setting up managed Chrome on a personal Mac isn't reasonable for this project. Ruled out (inferred). |

## 5. Install steps for the non-technical macOS Partner (unlisted)

Based on the [Chrome Web Store help page](https://support.google.com/chrome_webstore/answer/2664769). The exact button labels for the toolbar pin are inferred from the current UI.

1. Open **Google Chrome** (not Safari) on the Mac. Install Chrome from google.com/chrome if it's missing.
2. Click the unlisted **Chrome Web Store link** the other Partner sends (for example in WhatsApp). It opens the Ensemble store page; it can't be found by searching the store.
3. Click **Add to Chrome**. Read the prompt, which should only mention Netflix (something like "Read and change your data on www.netflix.com"), then click **Add extension**.
4. Click the puzzle-piece **Extensions** icon in the toolbar, then the **pin** next to Ensemble so it stays visible.
5. That's it. Updates install automatically in the background, within hours.

Notes: you can't install from Incognito or a Guest window. Signing into Chrome is not needed. If an update ever adds a permission, Chrome turns Ensemble off and shows a prompt: click to accept it (see §2).

## 6. Risks and unknowns

- **Fee amount.** Today's register page says "one-time fee" but doesn't print the amount. US$5 comes from Google's 2020 announcement. It is a one-time cost, so it doesn't conflict with the "$0/month" budget, but someone has to pay it once with a card.
- **Review latency is unpredictable.** Google promises nothing beyond "a few days, up to a few weeks". The first review will be on the slow side (new developer, new item). This makes hot-fixing a broken Netflix integration slow. Netflix DOM or player changes could break Ensemble for days.
- **Permission changes after release cost a user prompt.** Getting `host_permissions` right in v1 matters, especially if the transport needs a server origin.
- **Old doc dates.** Several Google pages are dated 2012–2021 (publish, update, distribution, alternative installs). The behaviour they describe still matches the 2024–2025 policy pages, but some details (for example the update interval) could have drifted.
- **Load-unpacked behaviour in current Chrome** (persistence, warnings, Mac quirks) was not verified against a primary source dated 2026.
- **Developer-account identity.** Whoever registers is the permanent publisher and email (it can't be changed). Decide whose Google account owns it.
- **Netflix Terms of Use** are outside CWS policy and weren't researched here.
