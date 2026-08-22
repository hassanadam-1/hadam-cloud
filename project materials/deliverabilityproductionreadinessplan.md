# Hadam — Email Deliverability Production-Readiness Plan

Status: **reference document only — no code changes made.** The current email flow (shipped/delivered notifications, the 20-second automatic Resend status check, the startup API-key permission check, and the honest "accepted ≠ Inbox" wording) is untouched and stays exactly as-is.

This document is the plan for later, when you're ready to move toward real customers. It's organized so each item is marked as either **(A) fully automatable by a script I run**, **(B) automatable except for one one-time human action**, or **(C) not automatable by anyone — an inherent limit of how email works.**

---

## 1. Verified sending domain — (B)

You need to own a domain first (this is the still-open decision — WHOIS-check it before buying, same lesson as the `hadam.com` mistake).

Once you own one, here's what's automatable:

- **(A)** A script calls `POST https://api.resend.com/domains` with your domain name. Resend returns the exact SPF, DKIM (and optionally DMARC) DNS records you need — I don't have to hand-write these.
- **(B)** Those records need to exist at your domain's DNS host (registrar or DNS provider). Two paths:
  - If your registrar/DNS provider has an API (Cloudflare, Namecheap, Route 53, Google Domains, etc.) and you're willing to give me an API token for it, a script can insert the records automatically — genuinely zero manual DNS work.
  - If not, this becomes a single one-time manual step: paste 2-3 DNS records into your registrar's dashboard. I'll generate the exact copy-paste values and, if it's the same kind of low-familiarity situation as the API-key upgrade, walk you through it screenshot-by-screenshot the same way.
- **(A)** After records exist, a script polls `POST https://api.resend.com/domains/:id/verify` automatically until Resend confirms verification — no manual "check back later."
- **(A)** Once verified, a script updates `FROM_EMAIL` (and reply-to) away from `onboarding@resend.dev` to your new domain, and restarts the server the same way `start-supabase.sh` already does.

## 2. DMARC — (B), same shape as #1

DMARC is a separate TXT record (`_dmarc.yourdomain.com`) on top of SPF/DKIM, not something Resend auto-adds for you.

- **(A)** I can generate the exact record value and a **staged rollout plan**: start at `p=none` (monitor only, no risk), then automatically schedule a check-in after a set period to move to `p=quarantine`, then eventually `p=reject` — tightening only once we've confirmed nothing legitimate is failing.
- **(B)** Same DNS-insertion choice as above (registrar API vs. one manual paste).

## 3. Real-time bounce/complaint/delivery-event tracking — (A), ready to build now if you want it before the domain move

Right now the system polls Resend once, 20 seconds after each send. Resend also offers a **webhook system** that pushes events to us the instant they happen — this is strictly better and doesn't require a verified domain or any manual step:

- A script calls `POST https://api.resend.com/webhooks` once, registering our server's URL and subscribing to `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.opened`, `email.clicked`.
- I'd add one new route to `server.js` to receive these events, verify Resend's signature (so nobody can spoof fake "delivered" events at us), and store each event in a proper timeline per email instead of only a console log line.
- This replaces the fixed 20-second guess with real, authoritative, timestamped events — including catching a *late* bounce that happens after the current 20-second window would already have logged "looks fine."

I did **not** build this yet, since you asked me to hold off on flow changes for now — but it doesn't depend on the domain decision, so it's a candidate to do independently, whenever you say go.

## 4. Sender reputation & compliant content — (A)

All automatable now, independent of domain:

- Always send a plain-text alternative alongside HTML (reduces spam-filter suspicion).
- Avoid spam-trigger patterns: ALL-CAPS subjects, excessive exclamation points, URL shorteners, mismatched display/actual link text.
- Add a `List-Unsubscribe` header for any non-transactional content (not strictly required for pure order-status transactional emails, but it's a positive reputation signal and costs nothing to add).
- Keep a consistent, recognizable "From" name (e.g. `Hadam Orders <...>`) instead of a bare address.
- Gradual sending "warm-up" if/when order volume ramps up quickly on a brand-new domain — mail providers trust a domain more if its send volume grows gradually rather than spiking on day one.

## 5. Link/domain reputation — (A), depends on #1

Once emails link back to `yourdomain.com` instead of a Resend sandbox link, click-through links inherit your domain's reputation instead of a shared, unrelated one. No separate action beyond completing #1.

## 6. Inbox placement — (C), with one honest caveat

This is the one category where full automation has a hard ceiling, and I want to be direct about it rather than oversell what's buildable:

- **No email API — not Resend's, not Gmail's, not anyone's — exposes true per-message Inbox-vs-Spam placement.** That decision happens entirely inside the recipient's mailbox after acceptance, and mailbox providers deliberately don't expose it (it's exactly the kind of signal spammers would abuse to tune around filters).
- The closest available proxies, if you eventually want them:
  - **Google Postmaster Tools** (free): once your domain is verified and sending meaningful Gmail volume, it shows aggregate domain-level spam-rate and reputation data — not per-email, and Gmail-only, but a real signal I could periodically pull and log.
  - **Third-party seed-list placement testers** (e.g. GlockApps, Validity/250ok): paid services that send test messages to a panel of real mailboxes across providers and report where each landed. This is the closest thing to a real inbox-placement measurement, but it tests *test* messages, not your actual customer emails, and requires its own paid account.
- Whatever we automate here will only ever be a **proxy signal**, never certainty. Per your standing instruction, the system will keep saying "accepted by the mail server" and will never claim "delivered to Inbox" unless one of these proxy sources gives us actual evidence for that specific message — and even then I'll label it clearly as a probabilistic signal, not a guarantee.

## 7. Bounce/complaint-triggered auto-pause — (A), works well once #3 is built

Once real-time webhook events exist (#3), a natural next step: if a specific recipient bounces or complains, automatically stop sending them further notification emails and flag it for an admin, instead of silently retrying forever and damaging sender reputation.

---

## What's genuinely required from you, and when

Nothing right now. When you're ready to move toward real customers, the only unavoidable manual step is picking and owning a domain (and, unless you grant registrar API access, one round of pasting DNS records I generate for you). Everything else in this list — the domain API calls, DNS record generation, verification polling, webhook registration, event storage, content compliance, and the FROM_EMAIL cutover — is scriptable and I can run it for you the same way I've run every patch so far.

Sources:
- [Managing Webhooks via API · Resend](https://resend.com/changelog/managing-webhooks-via-api)
- [resend-skills/skills/resend/references/webhooks.md](https://github.com/resend/resend-skills/blob/main/skills/resend/references/webhooks.md)
- [Domain Verification Events · Resend](https://resend.com/changelog/domain-verification-events)
- [Implementing DMARC - Resend](https://resend.com/docs/dashboard/domains/dmarc)
- [Email Authentication: A Developer's Guide · Resend](https://resend.com/blog/email-authentication-a-developers-guide)
