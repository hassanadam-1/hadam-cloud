# Hadam Marketplace — User Guide

This guide covers everything a normal user — shopper, store owner, or Marketplace-only business — can do on Hadam. It reflects the system as actually built, not planned features.

---

## 1. What Hadam Is

Hadam is two things at once:

- **A hosting platform for online stores.** Anyone can create their own store on a subdomain (`yourstore.hadam.com`) with a full catalog, cart, checkout, and admin panel.
- **A shared Marketplace directory.** Stores (and businesses with no Hadam store at all) can be listed in one shared, searchable directory so shoppers can browse across every seller at once.

You can use either independently, or both together.

---

## 2. Getting Around

- **Platform site** (`hadam.com`): home page, the Marketplace & Stores directory, "Sell on Hadam" (create a store / join the Marketplace / add Marketplace to an existing store / renew), and Contact.
- **Each store's own site** (`yourstore.hadam.com`): that store's catalog, cart, checkout, your orders, and (if you're staff) the admin panel and Fulfillment Queue.

Language: use the toggle in the top navigation on any page (English, Arabic, French). Arabic pages switch to right-to-left layout automatically.

---

## 3. Buying From a Store

1. Browse a store's products, or find one via the Marketplace directory.
2. Add items to your cart (top-right cart icon).
3. Click **Checkout**.
4. If you don't have an account yet, register (name, email, password) or log in.
5. For physical products, choose **Ship to address** or **Pick up in store** (if the store offers pickup), and enter your address if shipping.
6. Enter payment details: card number, expiry (MM/YY), CVV (exactly 3 digits), and cardholder name. All four are required and validated as you type.
7. Click **Pay**.

**Test card for this environment:** `4111 1111 1111 1111` succeeds. `0000 0000 0000 0000` is declined, useful for previewing what a failed payment looks like.

After a successful order you'll see a receipt. Digital products are available to download immediately from there and from **My Orders**.

### Booking a service

If a store sells bookable services (consultations, appointments), add the service to your cart and check out the same way — no separate flow. The store's staff will confirm and schedule your booking; you'll see it under **My Orders** once confirmed.

---

## 4. My Orders

Go to **My Orders** (top navigation, when logged into a store) to see every order you've placed at that store, with:

- Current status (pending, processing, shipped, delivered, etc.)
- Any tracking note the store's staff has added
- A download link for digital products
- Actions for delivered shipping items (see below)
- Actions for requesting a refund

### Confirming delivery

Once a store marks a shipping item as **delivered**, you'll get an email and see two options on that order:

- **Confirm Receipt** — tells the store you got it. This is tracked separately from the store's own "delivered" status, so there's a clear record that you personally confirmed it.
- **Report a Problem** — for a missing, damaged, or wrong item. Type what went wrong; this notifies the store's staff immediately.

If you do nothing for a few days, you'll get a reminder email.

### Requesting a refund

1. On the relevant order item, click **Request Refund** and give a reason.
2. The store's staff is notified immediately and will approve or reject your request, with a reason if rejected.
3. If **approved**, you'll be emailed and prompted, from **My Orders**, to confirm a refund payment method — enter card details (this can be a different card than the one you originally paid with; only the last 4 digits are ever stored).
4. Once you submit that, the refund is processed: the item is marked refunded, physical stock is restored automatically if applicable, and you get a final confirmation email.
5. If **rejected**, you're told why and nothing else happens automatically.

A digital product that's already been downloaded can no longer be refunded.

---

## 5. Creating Your Own Store

From the platform site, go to **Sell on Hadam** → **Create a Store**.

1. Choose a subdomain (2-30 lowercase letters/numbers/hyphens) and store name.
2. Choose what you want:
   - **Just a store** — sell on your own subdomain, not listed in the Marketplace
   - **Marketplace only** — your own store and subdomain, listed in the Marketplace
   - **Both** — your own store, listed in the Marketplace
3. Choose a subscription tier:

| Tier | Monthly | Product limit | Commission |
|---|---|---|---|
| Starter | Free | 10 | 15% |
| Professional | $29 | 100 | 8% |
| Enterprise | $99 | Unlimited | 3% |

4. Starter needs no payment. Professional/Enterprise require card details (same validation as checkout).
5. Enter your own name, email, and password — this becomes your store's Admin account.
6. Submit. Your store is live immediately at `yourstore.hadam.com`.

One email can only have one active store at a time — if you already have one, you'll be told to log into it instead.

### Managing your store

Log into `yourstore.hadam.com` as Admin, then use the **Admin** panel to:

- Add categories (physical/shipping, digital/download, service/booking) and products
- Manage employees (add/remove staff, reset their MFA if locked out)
- View and fulfill orders (**Fulfillment Queue**)
- Change store settings: name, tagline, about text, plan (Store/Marketplace/Both), registration on/off, two-factor requirement for staff
- View sales stats

### Renewing or changing your plan

From `yourstore.hadam.com`, go to **Sale on Hadam**:

- If you're already on a tier, that tier's button is disabled (nothing to switch to) — a hint links you to **Settings**, where the actual **Renew Store / Renew Marketplace / Renew Both** buttons live. These open a proper payment form and extend your subscription by 30 days.
- If your current subscription still has more than a week left and you're not changing tiers, the system will tell you it's not needed yet rather than charging you again.
- To switch tiers, pick a different one — this is always treated as an explicit change, never blocked.

---

## 6. Joining the Marketplace Without a Store

If you run your business elsewhere and just want visibility on Hadam, use **Sell on Hadam** → **Join Hadam Marketplace**:

1. Submit your business name, owner name, email, website URL, and details (logo, description, social links, etc.).
2. Choose **Free** or **Featured** ($19/month — more prominent placement). Featured requires payment up front.
3. Your application goes to a superadmin for review before it appears publicly — even a paid application isn't listed until approved.
4. You'll be notified by email once it's reviewed.

One email address can only have one active/pending application at a time; a rejected application can be resubmitted.

You can upgrade to a full Hadam Store later — your business information carries over.

### Adding Marketplace to an existing store

If you already have a Hadam store and want it listed in the Marketplace too, use **Sell on Hadam** → **Add My Store to Marketplace**, enter your store's subdomain and your admin login, confirm payment, and your existing store is listed immediately — no new store or subdomain is created.

### Renewing a Featured Marketplace membership

Use **Sell on Hadam** → **Membership Extension / Renew**, choose "Marketplace Membership," enter the email and business name your application was submitted with, and pay. Free-plan listings never expire and have nothing to renew.

---

## 7. Account & Security

- **Password reset:** "Forgot password?" on any login screen. You'll get an emailed link back to that same store's own domain.
- **Two-factor authentication (2FA):** available from your account menu — authenticator app (TOTP), email codes, or backup codes. A store admin can require 2FA for all staff.
- **Lost your 2FA device?** Use a backup code, or ask your store's admin (or the platform superadmin, for admins themselves) to reset it for you.

---

## 8. Contact

Use **Contact** on the platform site for any question not covered by a specific store. Your message goes to the Hadam team, and you'll see an on-screen confirmation once it's sent.

---

## 9. Tips

- Every payment form on Hadam is simulated for this environment — use `4111 1111 1111 1111` to succeed, `0000 0000 0000 0000` to see a decline.
- CVV is always exactly 3 digits.
- If a form field turns up an error while you're still typing, that's live validation — fix it before submitting, no need to wait for a full-page error.
