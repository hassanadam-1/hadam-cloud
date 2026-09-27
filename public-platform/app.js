/* ---------------- cross-subdomain language cookie ----------------
   localStorage is isolated per-origin — localhost:3001 and demo.localhost:3001
   never actually shared a value there, even though it looked like they should.
   A cookie scoped to the shared parent domain is what makes one language
   choice apply everywhere. This uses a naive "last two labels" rule for
   real domains (acme.hadamplatform.com -> hadamplatform.com) plus a special case for local
   *.localhost testing — not a full public-suffix-list implementation, but
   correct for the domain shapes this project actually uses. */
function sharedCookieDomain() {
  const host = window.location.hostname;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'localhost';
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}
function setCookie(name, value) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; domain=${sharedCookieDomain()}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const SUPPORTED_LANGS = ['en', 'ar', 'fr'];
function detectInitialLang() {
  // URL param wins (explicit cross-site link) > shared cookie (cross-subdomain,
  // but *.localhost cookie scoping is inconsistent across browsers) > localStorage
  // (always reliable same-origin, so a same-page reload never silently reverts to English).
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  const lang = SUPPORTED_LANGS.includes(fromUrl) ? fromUrl : (getCookie('hadam_lang') || localStorage.getItem('hadam_lang') || 'en');
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  return lang;
}

let state = { token: localStorage.getItem('hadam_super_token') || null, user: null, baseDomain: 'hadamplatform.com', marketCategory: 'All', marketSearch: '', lang: detectInitialLang() };
const AUDIT_EVENT_TYPES = [
  'login_success', 'login_failure', 'logout',
  'password_reset_requested', 'password_reset_completed',
  'mfa_totp_enrolled', 'mfa_totp_disabled', 'mfa_totp_verify_success', 'mfa_totp_verify_failure',
  'mfa_email_otp_enabled', 'mfa_email_otp_disabled', 'mfa_email_otp_verify_success', 'mfa_email_otp_verify_failure',
  'mfa_backup_codes_generated', 'mfa_backup_code_used', 'mfa_backup_code_verify_failure',
  'account_locked', 'admin_mfa_reset', 'account_created', 'account_deleted',
];
const PLATFORM_CATEGORIES = ['Design', 'Education', 'Stationery', 'Electronics', 'Books', 'Food & Drink', 'Software', 'Accessories', 'Other'];

const I18N = {
  en: {
    home: 'Home', marketplaceStores: 'Marketplace & Stores', sellOnHadam: 'Sell on Hadam', contact: 'Contact', langToggle: 'العربية',
    helpNavLabel: 'Help', helpPageTitle: 'Help', helpPageIntro: 'Step-by-step guidance for using Hadam.', technicalManualSuperadminHint: 'Architecture, roles, database structure, APIs, workflows, and troubleshooting — for Superadmins and technical support only. This is not shown anywhere in the user-facing Help section.',
    helpRoleAll: 'Everyone', helpRoleShopper: 'Shoppers', helpRoleStoreOwner: 'Store Owners', helpRoleMarketplace: 'Marketplace Members', helpSearchPlaceholder: 'Search help topics...', helpNoResults: 'No help topics match your search.',
    helpSecGettingStartedTitle: 'What Hadam Is & Getting Around',
    helpSecGettingStartedBody: '<p>Hadam is two things at once: a hosting platform where anyone can create their own online store on a subdomain (<strong>yourstore.hadamplatform.com</strong>), and a shared Marketplace directory where stores (and businesses with no Hadam store at all) can be listed so shoppers can browse across every seller at once. You can use either one independently, or both together.</p><p><strong>Platform site</strong> (hadamplatform.com): home page, the Marketplace &amp; Stores directory, Sell on Hadam (create a store / join the Marketplace / add Marketplace to an existing store / renew), Contact, and this Help page.</p><p><strong>Each store\'s own site</strong> (yourstore.hadamplatform.com): that store\'s catalog, cart, checkout, your orders, and — if you\'re staff there — the admin panel and Fulfillment Queue.</p><p>Switch language using the toggle in the top navigation on any page. Arabic pages automatically switch to right-to-left layout.</p>',
    helpSecBuyingTitle: 'Buying From a Store',
    helpSecBuyingBody: '<ol><li>Browse a store\'s products, or find one via the Marketplace directory.</li><li>Add items to your cart using the cart icon.</li><li>Click <strong>Checkout</strong>.</li><li>Register or log in if you don\'t have an account yet.</li><li>For physical products, choose to ship to an address or pick up in store (if offered).</li><li>Choose a payment method — the options shown depend on what that specific store has enabled.</li><li>Complete payment using the steps for that method (see below).</li></ol><p><strong>Card (Stripe):</strong> enter card number, expiry (MM/YY), CVV (exactly 3 digits), and cardholder name — all four required and checked as you type — then click <strong>Pay</strong>. Test card for this environment: 4111 1111 1111 1111 succeeds. 0000 0000 0000 0000 is declined, useful for seeing what a failed payment looks like.</p><p><strong>PayPal:</strong> select PayPal at checkout, then complete payment on PayPal\'s own page. You\'ll be returned to Hadam once it\'s done, and your order is confirmed automatically.</p><p><strong>Cash:</strong> if a store offers cash, your order is placed with payment marked as pending. Pay the store in person as arranged; a staff member then confirms the payment, at which point your order moves forward.</p><p><strong>Bank transfer:</strong> if a store offers this, you\'ll be given the store\'s transfer details. Your order stays pending until the store confirms they\'ve received the transfer, so it\'s normal for it to show as awaiting confirmation for a while.</p><p><strong>If a payment doesn\'t go through:</strong> you can try again from Checkout, or try a different method if the store offers more than one. If the issue keeps happening, contact the store or use <strong>Contact</strong> on the platform site.</p><p>Digital products become available to download immediately after a successful order, both from your receipt and from My Orders.</p><p><strong>Booking a service:</strong> add it to your cart and check out the same way — no separate flow. The store\'s staff will confirm and schedule it; you\'ll see it under My Orders once confirmed.</p>',
    helpSecOrdersTitle: 'My Orders & Delivery Tracking',
    helpSecOrdersBody: '<p>Go to <strong>My Orders</strong> at any store you\'ve bought from to see every order, its current status (pending, processing, shipped, delivered, etc.), any tracking note staff have added, and a download link for digital products.</p><p><strong>Confirming delivery:</strong> once a store marks a shipping item delivered, you\'ll get an email and see two options: <strong>Confirm Receipt</strong> (tells the store you got it — tracked separately from the store\'s own "delivered" status, so there\'s a clear record) or <strong>Report a Problem</strong> (for anything missing, damaged, or wrong — notifies staff immediately). If you do nothing for a few days, you\'ll get a reminder email.</p>',
    helpSecRefundsTitle: 'Refunds',
    helpSecRefundsBody: '<p><strong>As a customer:</strong> click Request Refund on the relevant order item and give a reason. The store\'s staff is notified immediately and will approve or reject your request, with a reason if rejected — you\'ll be emailed either way.</p><p>If <strong>approved</strong>, you\'ll be prompted, from My Orders, to confirm a refund payment method (this can be a different card than the one you originally paid with — only the last 4 digits are ever stored). Once submitted, the refund processes immediately: the item is marked refunded, stock is restored automatically if applicable, and you get a final confirmation email.</p><p>A digital product that\'s already been downloaded can no longer be refunded.</p><p><strong>As store staff:</strong> refund requests appear in your Fulfillment Queue with the customer\'s reason, date, and item. Approve or reject with your own reason — every refund needs a human decision, it\'s never automatic.</p>',
    helpSecCreatingStoreTitle: 'Creating Your Own Store',
    helpSecCreatingStoreBody: '<p>From the platform site, go to <strong>Sell on Hadam → Create a Store</strong>.</p><ol><li>Choose a subdomain (2-30 lowercase letters/numbers/hyphens) and store name.</li><li>Choose what you want: Just a store (not listed in the Marketplace), Marketplace only, or Both.</li><li>Choose a subscription tier — Starter (free), Professional ($29/mo), or Enterprise ($99/mo). These fees reflect real product limits and commission rates for each tier, but no actual recurring billing is wired in yet — this is a pre-launch environment.</li><li>Starter needs no payment step. Professional/Enterprise ask for card details, checked with the same test-card pattern as checkout (4111 1111 1111 1111 succeeds, an all-zero card is declined) — no real charge happens either way.</li><li>Enter your own name, email, and password — this becomes your store\'s Admin account.</li><li>Submit. Your store is live immediately at yourstore.hadamplatform.com.</li></ol><p>One email can only have one active store at a time.</p>',
    helpSecManagingStoreTitle: 'Managing Your Store (Admin)',
    helpSecManagingStoreBody: '<p>Log into your store as Admin, then use the <strong>Admin</strong> panel to: add categories and products, manage employees (add/remove staff, reset their MFA if locked out), view and fulfill orders via <strong>Fulfillment Queue</strong>, change store settings (name, tagline, plan, registration on/off, two-factor requirement for staff), and view sales stats.</p><p>A product\'s category determines how orders for it are fulfilled — shipped, downloaded, or booked as a service.</p>',
    helpSecSubscriptionsTitle: 'Subscriptions & Renewing Your Plan',
    helpSecSubscriptionsBody: '<p>From your store, go to <strong>Sale on Hadam</strong>. If you\'re already on a tier, that tier\'s button is disabled — a hint links you to <strong>Settings</strong>, where the actual Renew Store / Renew Marketplace / Renew Both buttons live. These open a payment form and extend your subscription 30 days.</p><p>If your current subscription still has more than a week left and you\'re not changing tiers, the system tells you a renewal isn\'t needed yet rather than charging you again. To switch tiers, pick a different one on the Sale on Hadam page — that\'s always treated as an explicit change, never blocked.</p>',
    helpSecMarketplaceTitle: 'The Marketplace: Joining, Adding, Renewing',
    helpSecMarketplaceBody: '<p><strong>No Hadam store, just want visibility?</strong> Use Sell on Hadam → Join Hadam Marketplace. Submit your business details, choose Free or Featured ($19/mo, paid up front), and a superadmin reviews it before it goes public — you\'re notified by email either way. One email can only have one active/pending application; a rejected one can be resubmitted.</p><p><strong>Already have a Hadam store and want it listed too?</strong> Use Sell on Hadam → Add My Store to Marketplace — enter your subdomain and admin login, confirm payment, and your existing store is listed immediately, no new store created.</p><p><strong>Renewing a Featured membership:</strong> use Sell on Hadam → Renew, choose Marketplace Membership, enter the email and business name your application used, and pay. Free-plan listings never expire.</p><p>As with subscription payments elsewhere on Hadam, the Featured card check uses the same test-card pattern as checkout (4111 1111 1111 1111 succeeds, an all-zero card is declined) — no real recurring charge is wired in yet, since this is a pre-launch environment.</p>',
    helpSecAccountSecurityTitle: 'Account & Security',
    helpSecAccountSecurityBody: '<p><strong>Forgot your password?</strong> Click "Forgot password?" on any login screen — you\'ll get an emailed link back to that same store\'s own domain.</p><p><strong>Two-factor authentication (2FA):</strong> available from your account menu — authenticator app (TOTP), email codes, or backup codes. A store admin can require 2FA for all staff.</p><p><strong>Lost your 2FA device?</strong> Use a backup code, or ask your store\'s admin (or the platform superadmin, for admins themselves) to reset it for you.</p><p><strong>Email verification codes:</strong> if email is your 2FA method, a 6-digit code is sent to your registered email each time you log in. It expires after 10 minutes and works once. If it doesn\'t arrive within a minute or two, check spam, or click "Resend code."</p>',
    helpSecContactTitle: 'Contact & Getting More Help',
    helpSecContactBody: '<p>Use <strong>Contact</strong> on the platform site for any question not covered by a specific store. Your message goes directly to the Hadam team, and you\'ll see an on-screen confirmation once it\'s sent.</p><p>Throughout the app, look for small "?" icons next to fields and buttons — click one for guidance specific to that exact step, including what to enter, why it\'s needed, and what to do if something goes wrong.</p>',
    technicalManualTitle: 'Technical Manual', technicalManualDesc: 'For admins, developers, and technical support — architecture, roles, database structure, APIs, workflows, and troubleshooting.', downloadTechnicalManualBtn: 'Download Technical Manual (.docx)',
    helpIconAriaLabel: 'Help', helpWhatLabel: 'What to enter', helpWhyLabel: "Why it's needed", helpNextLabel: 'What happens next', helpRulesLabel: 'Requirements', helpErrorsLabel: 'If something goes wrong', helpMoreLabel: 'Need more help?', helpMoreText: 'See the', helpMoreTextEnd: 'page for the full guides.',
    helpSubWhat: 'A short, unique web address for your store — this becomes yourchoice.hadamplatform.com.', helpSubWhy: 'This is how customers find your store, and how the system tells your store apart from every other one on the platform.', helpSubNext: 'Once created, your store is live immediately at this address — you can share it right away.', helpSubRules: '2-30 characters: lowercase letters, numbers, and hyphens only. Must not already be taken.',
    helpPlanWhat: 'Whether your store should also appear in the shared Marketplace directory.', helpPlanWhy: "The Marketplace is a separate, shared browse page across every seller on Hadam — being listed there means shoppers can discover you without knowing your store's address already.", helpPlanNext: "\"Just a store\" stays private to people who have your link. \"Marketplace only\" or \"Both\" list you in the directory immediately after creation.",
    helpTierWhat: 'Your subscription tier, which sets your product limit and commission rate.', helpTierWhy: 'Higher tiers raise your product limit and lower the commission taken on each sale.', helpTierNext: 'Starter needs no payment. Professional and Enterprise ask for card details below before your store is created.', helpTierRules: 'You can change tiers anytime later from Admin → Settings — this choice is not permanent.',
    helpCardWhat: 'Card number, expiry (MM/YY), CVV, and the cardholder name.', helpCardWhy: 'Required to activate a paid tier — this environment simulates payment, nothing is actually charged.', helpCardNext: "If the card is accepted, your subscription activates immediately for the period shown. If it's declined, nothing changes and you can try again.", helpCardRules: 'CVV must be exactly 3 digits. All four fields are required. Use 4111 1111 1111 1111 to simulate success, or 0000 0000 0000 0000 to preview a decline.', helpCardErrors: "Check the red text under the specific field that's invalid — each field is checked as you type. If the card is declined, try the success test number, or a different real card.",
    helpPassWhat: 'A password for your new store admin account.', helpPassRules: 'At least 8 characters, with one letter, one number, and one special character.',
    helpRenewTierWhat: 'Which subscription tier to renew or switch to.', helpRenewTierWhy: 'Renewing extends your current period by 30 days. Picking a different tier is treated as an explicit plan change, not just a renewal.', helpRenewTierNext: "If your subscription still has more than a week left and you haven't changed tiers, the system will tell you a renewal isn't needed yet rather than charging you again.",
    helpAddMarketCardWhy: 'Required to activate Marketplace listing for your existing store — this is a separate charge from your store subscription itself.',
    helpMarketReviewWhat: 'Whether to approve, reject, suspend, reactivate, or request more info for this application.', helpMarketReviewWhy: 'Even a paid Featured application is never listed publicly until a superadmin reviews and approves it.', helpMarketReviewNext: 'The applicant is emailed the outcome. Approving makes them visible in the public Marketplace directory immediately.', helpMarketReviewRules: 'Rejecting is the only outcome that lets that email apply again later — every other status keeps their one existing application locked in place.',
    helpTenantMgmtWhat: 'Suspend or reactivate any store on the platform.', helpTenantMgmtWhy: 'A suspended store becomes completely unreachable — its own customers and staff can no longer log in or browse it.', helpTenantMgmtNext: 'Reactivating restores full access immediately, with all data intact exactly as it was.', helpTenantMgmtErrors: "If a store owner disputes a suspension, check the platform's own audit log for the reason it was suspended before reactivating.",
    helpSuperResetMfaWhat: "The email address of the locked-out admin account.", helpSuperResetMfaWhy: "This removes ALL of that account's two-factor methods (authenticator, email OTP, and backup codes) at once — there's no partial reset.", helpSuperResetMfaNext: 'They can log in with just their password on the next attempt, then set up MFA again from scratch if they want it.', helpSuperResetMfaRules: 'Verify their identity yourself before using this — it bypasses the entire second factor of protection on their account.', helpSuperResetMfaErrors: "If the email doesn't match any account, double-check for typos — this only works for accounts that actually exist.",
    helpSuperContactWhat: 'Messages submitted through the public Contact form, from anyone.', helpSuperContactWhy: "These aren't tied to any specific store — they're general platform questions.", helpSuperContactNext: 'Click the email address to reply directly from your own email client — there\'s no in-app reply feature.',
    helpSuperOwnMfaWhat: 'Your own two-factor authentication setup — authenticator app, email code, or backup codes.', helpSuperOwnMfaWhy: 'Your superadmin account can manage every store on the platform, so it needs stronger protection than a password alone.', helpSuperOwnMfaNext: "Once enabled, you'll be asked for a code every time you log in, in addition to your password.", helpSuperOwnMfaRules: 'Set up backup codes as soon as you enable any MFA method — they\'re your only self-service way back in if you lose your authenticator device.',
    helpSuperAuditLogWhy: 'Every security-relevant action across every store — logins, MFA changes, password resets, lockouts, and admin actions — is recorded here automatically.', helpSuperAuditLogNext: 'Use this to investigate a specific incident (like a disputed suspension) or to check whether a login attempt actually happened.',
    superadminLogin: 'Superadmin log in', dashboardNavLink: 'Dashboard',
    heroEyebrow: 'Global digital store & multi-tenant marketplace platform',
    heroH1: 'Every store gets its own subdomain. We run the infrastructure.',
    heroP: "Hadam is the platform — auth, catalog, cart, checkout, and fulfillment, shared by every tenant. Your store lives at <strong>yourname.hadamplatform.com</strong> and starts with a blank catalog: you decide what you sell and how it's categorized.",
    browseMarketplaceBtn: 'Browse the marketplace', getOwnStoreBtn: 'Get your own store',
    shopPanelH3: 'Looking to shop, or manage a store you already have?',
    shopPanelP: `This page (the Hadam homepage) is <strong>not</strong> where clients, employees, or store admins log in.
        Every store has its own address and its own login — go to <strong>yourname.hadamplatform.com</strong>
        (or <code>yourname.localhost:3000</code> in local testing) and log in there.
        The "Superadmin log in" button above is only for Hadam's own platform staff, who oversee the directory
        of stores below — it has no access to any store's products, orders, or customers.`,
    marketSearchPlaceholder: 'Search products across every store…', sellerStoresH3: 'Seller stores',
    wantOwnStoreP: 'Want your own store? Get a subdomain like <code>yourname.hadam.store</code>.',
    createStoreH3: 'Create your store', alreadyHaveStoreHint: 'Already have a Hadam store and just want to add it to the Marketplace? Don\'t create a new one here — log in to your existing store\'s admin panel and go to "Sale on Hadam" from there to add your store to the Marketplace directly.', subdomainLabel: 'Subdomain', subdomainPlaceholder: 'yourstore',
    createStoreTabBtn: 'Create a Store', joinMarketplaceTabBtn: 'Join Hadam Marketplace', sellModeHint: "Starting a brand-new business? Create a Store. Running your own business elsewhere and just want visibility in Hadam's Marketplace? Join the Marketplace — no Hadam store required. Already have a Hadam Store and want to add it to the Marketplace? Use \"Add My Store to Marketplace.\"",
    addMarketplaceTabBtn: 'Add My Store to Marketplace', addMarketplaceH3: 'Add My Existing Store to the Marketplace', addMarketplaceIntro: 'For Hadam Store admins who already have a store and want to list it in the Marketplace — no new store or subdomain is created, this activates on your existing one.',
    addMarketplaceBtn: 'Add My Store to Marketplace', addMarketplaceSuccessMsg: 'Your store has been added to the Marketplace:', howAddMarketWorksH3: 'How it works',
    renewTabBtn: 'Membership Extension / Renew', renewH3: 'Membership Extension / Renew', renewIntro: 'Extend or renew an existing Store or Marketplace subscription, before or after it expires.',
    renewTypeLabel: 'What are you renewing?', renewTypeStoreOpt: 'Hadam Store Plan Renewal', renewTypeMarketOpt: 'Hadam Marketplace Membership Renewal',
    renewMarketPriceLabel: 'Featured Marketplace membership — $19/month', renewMarketFreeHint: 'Free-plan Marketplace listings have no expiry and nothing to renew — this renewal form applies to Featured memberships only.', priceLabel: 'Price', perMonthLabel: 'month',
    renewTypeBothOpt: 'Hadam Store + Marketplace Package Renewal', checkStatusBtn: 'Check current status', currentStatusLabel: 'Current status', currentPlanLabel: 'Current plan',
    renewBtn: 'Renew', renewSuccessMsg: 'Renewal confirmed.', howRenewWorksH3: 'How it works',
    howRenewWorksP: "1. Choose whether you're renewing a Hadam Store subscription or a Marketplace membership.<br>2. Confirm your identity — your store's admin login, or the email and business name your Marketplace application was submitted with.<br>3. Payment is verified before anything changes — selecting a plan alone never activates or extends a subscription.<br>4. Once payment is confirmed, your expiration date is extended by 30 days, and access is restored immediately if it had lapsed.",
    howAddMarketWorksP: "1. Enter your store's subdomain and your own admin login for that store.<br>2. Confirm payment to add your store to the Marketplace.<br>3. Your existing store — same subdomain, same catalog, same customers — is immediately listed in Hadam's shared Marketplace directory.<br><br>No second store or subdomain is ever created. If your admin account has two-factor authentication enabled, use your store's own Admin panel instead of this page.",
    joinMarketplaceH3: 'Join Hadam Marketplace', joinMarketplaceIntro: "List your existing business in Hadam's Marketplace for visibility — no Hadam store, subdomain, or account needed. Purchases are handled entirely on your own website.",
    businessNameLabel: 'Business name', ownerNameLabel: 'Owner name', phoneLabel: 'Phone', countryLabel: 'Country', cityLabel: 'City', websiteUrlLabel: 'Website URL',
    businessCategoryLabel: 'Business category', businessCategoryPlaceholder: 'e.g. Electronics, Fashion, Home Goods', businessDescriptionLabel: 'Business description', logoUrlLabel: 'Logo URL (optional)',
    joinMarketplaceBtn: 'Join Hadam Marketplace', joinMarketplaceSuccessMsg: 'has joined Hadam Marketplace! Your business is now listed in the directory.',
    howJoinWorksH3: 'How it works', howJoinWorksP: "1. Submit your business information — no Hadam store or subdomain is created.<br>2. Your business appears in Hadam's Marketplace directory with your logo, description, and a link to your own website.<br>3. Shoppers who find you through Hadam are directed to your own website to complete their purchase — Hadam does not process payments or orders for Marketplace-only members.<br>4. You can upgrade to a full Hadam Store at any time — your business information carries over, and you'll gain a subdomain, catalog, cart, checkout, and every other Hadam Store feature.",
    externalMemberBadge: 'External seller', externalMemberBadgeTooltip: 'Lists on Hadam Marketplace only — purchases are completed on their own website, not through Hadam.', visitExternalSiteLink: 'Visit their website',
    marketplacePlanLabel: 'Marketplace plan', jmPlanFreeOpt: 'Free listing — basic directory entry', jmPlanFeaturedOpt: 'Featured listing — $19/month, priority placement + promotions', featuredBadge: 'Featured',
    addressLabel: 'Business address', registrationNumberLabel: 'Business registration number (optional)', vatNumberLabel: 'VAT / Tax number (optional)', socialLinksLabel: 'Social media links (all optional)',
    applicationPendingMsg: 'Your application for ', applicationPendingMsg2: ' has been received and is pending review. You\'ll get an email once it\'s approved.',
    addMarketplaceSuccessMsg: 'Your store has been added to the Marketplace:', disableBtn: 'Disable', disableMfaConfirm: 'Disable two-factor authentication?',
    emailOtpEnableBtn: 'Enable email code', emailOtpEnabledLabel: 'Email code enabled', emailOtpSectionHint: 'No authenticator app? Get a one-time code by email instead when logging in.', emailOtpSectionTitle: 'Email verification code',
    invalidRecoveryLinkMsg: 'This password reset link is invalid or has expired. Please request a new one.', mfaEmailSendingHint: 'Sending a code to your email...', mfaEmailSentHint: 'Enter the code we just emailed you.',
    mfaMethodAuthenticatorApp: 'Authenticator app', mfaMethodEmail: 'Email code', mfaQrLoadErrorMsg: 'The QR code image failed to load — use the manual entry code below instead.',
    passwordTooShortError: 'Password must be at least 8 characters.', perMonthLabel: 'month', priceLabel: 'Price',
    recoveryMfaRequiredHint: 'This account has two-factor authentication enabled — enter a code from your authenticator app to finish resetting your password.',
    recoveryMfaUnavailableMsg: 'Two-factor verification is required to reset this password, but no verified method could be found. Please contact support.',
    renewSuccessMsg: 'Renewal confirmed.', requestNewLinkBtn: 'Request a new link', resendCodeLink: 'Resend code', reviewNotePrompt: 'Optional note (shown to the applicant):',
    mfaMethodBackup: 'Backup code', backupCodeLoginHint: 'Enter one of your backup codes. Each one only works once.', backupCodeLabel: 'Backup code',
    backupCodesSectionTitle: 'Backup codes', backupCodesSectionHint: 'One-time codes to get in if you lose access to your authenticator app or email.',
    backupCodesNoPrimaryWarning: 'Backup codes are a fallback, not a login method on their own — enable the authenticator app or email code above first, or these codes will never be asked for at login.',
    resetMfaBtn: 'Reset MFA', resetMfaSuccess: 'MFA has been reset for this account.', adminResetMfaTitle: 'Reset MFA for a locked-out account',
    adminResetMfaHint: 'Last resort: for a store admin who has lost both their authenticator device and their backup codes, with no self-service path left. Verify their identity yourself before using this.',
    auditLogTitle: 'Security audit log', auditLogHint: 'A record of security-relevant events across every store — logins, MFA changes, password resets, and admin actions.',
    contactMessagesTitle: 'Contact form messages', contactMessagesHint: 'Messages submitted through the public Contact form.', noContactMessages: 'No messages yet.', dateLabel: 'Date', nameLabel: 'Name', messageLabel: 'Message',
    auditLogEmailFilterPlaceholder: 'Filter by email', auditLogAllEventTypes: 'All event types', auditLogAllOutcomes: 'All outcomes',
    auditLogSuccess: 'Success', auditLogFailure: 'Failure', auditLogApplyFilters: 'Apply filters', auditLogEmpty: 'No matching events.',
    pricingPlansTitle: 'Store & marketplace pricing', pricingPlansHint: 'Manage the plans stores can subscribe to. Changing a price only affects new and future subscriptions -- plans already purchased keep their original pricing.', noPlansYet: 'No plans yet -- add one below.', planNameLabel: 'Name', monthlyPriceLabel: 'Monthly price', yearlyPriceLabel: 'Yearly price', commissionRateLabel: 'Commission rate', maxProductsLabel: 'Max products', maxStorageLabel: 'Max storage (MB)', staffAccountsLabel: 'Staff accounts', marketplaceAllowedLabel: 'Marketplace listing allowed', customDomainLabel: 'Custom domain allowed', addPlanTitle: 'Add a new plan', editPlanTitle: 'Edit plan', savePlanBtn: 'Save plan', cancelEditBtn: 'Cancel / new plan', activeLabel: 'Active', inactiveLabel: 'Inactive', editBtn: 'Edit', deactivateBtn: 'Deactivate', activateBtn: 'Activate', unlimited: 'Unlimited', planCreatedMsg: 'Plan created.', planUpdatedMsg: 'Plan updated.',
    auditLogWhen: 'When', auditLogEvent: 'Event', auditLogEmailCol: 'Email', auditLogOutcomeCol: 'Outcome', auditLogIp: 'IP', auditLogDetails: 'Details',
    auditLogPageInfo: 'Page {page} of {total}', auditLogPrev: 'Previous', auditLogNext: 'Next',
    auditEvent_login_success: 'Login success', auditEvent_login_failure: 'Login failure', auditEvent_logout: 'Logout',
    auditEvent_password_reset_requested: 'Password reset requested', auditEvent_password_reset_completed: 'Password reset completed',
    auditEvent_mfa_totp_enrolled: 'Authenticator app enabled', auditEvent_mfa_totp_disabled: 'Authenticator app disabled',
    auditEvent_mfa_totp_verify_success: 'Authenticator code verified', auditEvent_mfa_totp_verify_failure: 'Authenticator code rejected',
    auditEvent_mfa_email_otp_enabled: 'Email code enabled', auditEvent_mfa_email_otp_disabled: 'Email code disabled',
    auditEvent_mfa_email_otp_verify_success: 'Email code verified', auditEvent_mfa_email_otp_verify_failure: 'Email code rejected',
    auditEvent_mfa_backup_codes_generated: 'Backup codes generated', auditEvent_mfa_backup_code_used: 'Backup code used', auditEvent_mfa_backup_code_verify_failure: 'Backup code rejected',
    auditEvent_account_locked: 'Account locked (rate limit)', auditEvent_admin_mfa_reset: 'MFA reset by admin', auditEvent_account_created: 'Account created', auditEvent_account_deleted: 'Account deleted',
    emailRequiredError: 'Email is required.', resetMfaConfirmGeneric: 'This removes every MFA method for that account, so they can log in with just their password and set up MFA again. Have you verified their identity? Continue?', renewalNotNeededTierError: 'Your {tier} subscription is still valid for {days} more days. To renew anyway or change plans, pick a different tier above, or check back closer to your renewal date.', renewalNotNeededMembershipError: 'Your membership is still valid for {days} more days.', mfaChooseMethodHint: "Choose how you'd like to verify it's you.",
    backupCodesRemainingLabel: 'unused codes remaining', noBackupCodesLabel: 'No backup codes generated yet.', regenerateBackupCodesBtn: 'Regenerate codes', generateBackupCodesBtn: 'Generate backup codes',
    regenerateBackupCodesConfirm: 'This will invalidate any existing backup codes. Continue?', yourBackupCodesTitle: 'Your backup codes',
    backupCodesWarning: 'Save these somewhere safe — each code works once, and this is the only time they\'ll be shown.', downloadCodesBtn: 'Download as text file', doneBtn: 'Done',
    lostDeviceUseBackupLink: 'Lost your authenticator? Use a backup code', recoveryBackupCodeHint: 'Enter one of your backup codes, along with your new password.',
    marketplaceApplicationsTitle: 'Marketplace membership applications', noApplicationsYet: 'No applications yet.',
    approveBtn: 'Approve', suspendBtn: 'Suspend', reactivateBtn: 'Reactivate', requestMoreInfoBtn: 'Request more info', rejectBtn: 'Reject', reviewNotePrompt: 'Optional note (shown to the applicant):',
    storeNameLabel: 'Store name', storeNamePlaceholder: 'Your Store Ltd', whatDoYouWantLabel: 'What do you want?',
    planStoreOption: "Just a store — sell anything, on your own subdomain, not listed on Hadam's Marketplace",
    planMarketplaceOnlyOption: "Marketplace only — your own store and subdomain, listed on Hadam's Marketplace",
    planMarketOption: "List on Hadam's Marketplace — reach shoppers browsing across every store",
    planBothOption: "Both — your own store, and listed on Hadam's Marketplace",
    planHint: "This doesn't limit what you can sell — every plan can list physical products, digital downloads, or bookable services. It only decides whether your store also appears in Hadam's shared Marketplace & Stores directory, alongside every other store.",
    planHintNoMarketOnly: 'Want Marketplace visibility only, without a Hadam store or subdomain? Use "Join Hadam Marketplace" above instead — this form is for people who want their own store.',
    tierLabelForm: 'Subscription tier', tierHintForm: 'You can change this anytime later from Admin → Store Settings.',
    cardNumber: 'Card number', expiry: 'Expiry', cvv: 'CVV', cardholderNameLabel: 'Cardholder name',
    cardNumberRequiredError: 'A valid card number is required.', cardExpiryFormatError: 'Card expiry must be in MM/YY format.', cardCvvRequiredError: 'Card security code (CVV/CVC) is required.', cardCvvDigitsError: 'Card security code (CVV/CVC) must contain only digits.', cardCvvLengthError: 'Card security code (CVV/CVC) must be exactly 3 digits.', cardholderNameRequiredError: 'Cardholder name is required.',
    notNearExpirySubHint: 'This subscription is still valid and not close to expiring. To pick a different tier instead, select it below.', notNearExpiryMemberHint: 'This membership is still valid and not close to expiring.',
    signupPaymentHint: 'Simulated payment. Use 4111 1111 1111 1111 for success or 0000 0000 0000 0000 to preview a decline.',
    yourNameLabel: 'Your name', email: 'Email', password: 'Password', passwordPlaceholder: 'At least 6 characters',
    createStoreBtn: 'Create store', howItWorksH3: 'How it works',
    howItWorksP: `1. Pick a subdomain and whether to also list on the Marketplace.<br>
          2. You become the store's Admin — add your own categories and products.<br>
          3. Invite Employees (or additional Admins) to help fulfil orders and bookings.<br>
          4. Clients register on your subdomain and shop only your catalog.<br><br>
          Every store's data — users, catalog, orders — is fully isolated from every other store.`,
    contactMessageLabel: 'Message', contactMessagePlaceholder: 'Question about a store, a listing, or the platform itself…',
    send: 'Send', contactHint: "For an order, a return, or anything about a specific store's products — contact that store directly from its own site instead; this goes to the Hadam platform team.",
    footerText: `Hadam Marketplace — the global digital store and multi-tenant marketplace platform. © ${new Date().getFullYear()} Hadam Marketplace. All rights reserved.`,
    superadminOnlyHint: "This is for Hadam platform staff only — not for store owners, employees, or clients. Those log in at their own store's subdomain instead.",
    forgotPasswordLink: 'Forgot password?', superForgotPasswordHint: "Enter the email for your superadmin account and we'll send a reset link.", sendResetLinkBtn: 'Send reset link', resetLinkSentMsg: "If that email is registered, a reset link has been sent — check your inbox.",
    setNewPasswordTitle: 'Set a new password', newPasswordLabel: 'New password', confirmNewPasswordLabel: 'Confirm new password', setNewPasswordBtn: 'Set new password',
    passwordsDontMatch: 'Passwords do not match.', passwordResetSuccess: 'Password reset successfully. You can now log in.', passwordTooShortError: 'Password must be at least 8 characters.', passwordSameAsCurrentError: 'This is your current password — please choose a different one.',
    myAccountSecurityTitle: 'My account security', mfaEnabledStatusMsg: 'Two-factor authentication is enabled on this account.', mfaNotEnabledStatusMsg: 'Two-factor authentication is not enabled on this account.',
    disableMfaBtn: 'Disable two-factor authentication', enableMfaBtn: 'Enable two-factor authentication', mfaScanHint: 'Scan this QR code with an authenticator app (Google Authenticator, Authy, etc.)',
    mfaManualEntryLabel: 'Or enter this code manually', mfaCodeLabel: '6-digit code', verifyBtn: 'Verify', mfaEnabledSuccessMsg: 'Two-factor authentication is now enabled.', disableMfaConfirm: 'Disable two-factor authentication?',
    mfaPromptTitle: 'Two-factor authentication', mfaPromptHint: 'Enter the 6-digit code from your authenticator app.',
    logIn: 'Log in', logout: 'Log out', logInAsSuperadmin: 'Log in as superadmin to view tenants.',
    platformSecurityAccessTitle: 'Platform Security & Access', platformSecurityAccessHint: 'These settings apply across every store on Hadam, since they all share one underlying authentication project.',
    smSettingEmailConfirm: 'Email confirmation required for signup', smSettingPasswordRules: 'Password complexity rules', smSettingRedirectUrls: 'Allowed redirect URLs', smSettingMfaProviders: 'Available MFA methods',
    smSettingRateLimits: 'Login/API rate limits', smSettingPerStoreAccess: 'Per-store registration & MFA policy', smManagedInSupabase: 'Managed in Supabase', smManagedInApp: 'Managed here',
    openSupabaseAuthSettings: 'Open Supabase Auth settings',
    allTenants: 'All tenants', store: 'Store', plan: 'Plan', revenue: 'Revenue', products: 'Products', orders: 'Orders',
    users: 'Users', status: 'Status', suspend: 'Suspend', activate: 'Activate',
    noProductsMatch: 'No products match yet.', noStoresYet: 'No stores yet — be the first.', noTagline: 'No tagline yet.',
    storeReady: 'is ready', storeAddressLabel: "Your store's address:", localTestingNote: 'Local testing note: without real DNS, use',
    contactSent: "Sent — thanks, we'll get back to you.", yourStorePreview: 'Your store', productSingular: 'product', productPlural: 'products',
  },
  ar: {
    home: 'الرئيسية', marketplaceStores: 'السوق والمتاجر', sellOnHadam: 'البيع على هدام', contact: 'اتصل بنا', langToggle: 'English',
    helpNavLabel: 'مساعدة', helpPageTitle: 'مساعدة', helpPageIntro: 'إرشادات خطوة بخطوة لاستخدام هدام.', technicalManualSuperadminHint: 'البنية، الأدوار، بنية قاعدة البيانات، واجهات البرمجة، سير العمل، واستكشاف الأخطاء وإصلاحها — للمسؤولين العامين والدعم الفني فقط. هذا غير معروض في أي مكان في قسم المساعدة الخاص بالمستخدمين.',
    helpRoleAll: 'الجميع', helpRoleShopper: 'المتسوقون', helpRoleStoreOwner: 'أصحاب المتاجر', helpRoleMarketplace: 'أعضاء السوق', helpSearchPlaceholder: 'ابحث في مواضيع المساعدة...', helpNoResults: 'لا توجد مواضيع مساعدة مطابقة لبحثك.',
    helpSecGettingStartedTitle: 'ما هو هدام والتنقل فيه',
    helpSecGettingStartedBody: '<p>هدام شيئان في آن واحد: منصة استضافة يمكن لأي شخص من خلالها إنشاء متجره الإلكتروني الخاص على نطاق فرعي (<strong>yourstore.hadamplatform.com</strong>)، ودليل سوق مشترك حيث يمكن إدراج المتاجر (والأعمال التي لا تملك متجر هدام على الإطلاق) لكي يتصفح المتسوقون جميع البائعين دفعة واحدة. يمكنك استخدام أي منهما بشكل مستقل، أو كليهما معًا.</p><p><strong>الموقع المنصة</strong> (hadamplatform.com): الصفحة الرئيسية، دليل السوق والمتاجر، البيع على هدام (إنشاء متجر / الانضمام إلى السوق / إضافة السوق إلى متجر حالي / التجديد)، اتصل بنا، وصفحة المساعدة هذه.</p><p><strong>موقع كل متجر الخاص</strong> (yourstore.hadamplatform.com): كتالوج ذلك المتجر، السلة، الدفع، طلباتك، وإذا كنت من الموظفين هناك — لوحة الإدارة وقائمة التنفيذ.</p><p>غيّر اللغة باستخدام المبدّل في القائمة العلوية في أي صفحة. الصفحات العربية تتحول تلقائيًا إلى تخطيط من اليمين إلى اليسار.</p>',
    helpSecBuyingTitle: 'الشراء من متجر',
    helpSecBuyingBody: '<ol><li>تصفح منتجات متجر، أو ابحث عن واحد عبر دليل السوق.</li><li>أضف عناصر إلى سلتك باستخدام أيقونة السلة.</li><li>انقر على <strong>إتمام الشراء</strong>.</li><li>سجّل أو سجّل الدخول إذا لم يكن لديك حساب بعد.</li><li>للمنتجات المادية، اختر الشحن إلى عنوان أو الاستلام من المتجر (إن توفر).</li><li>اختر طريقة دفع — الخيارات المعروضة تعتمد على ما يوفره هذا المتجر تحديدًا.</li><li>أكمل الدفع باتباع خطوات تلك الطريقة (انظر أدناه).</li></ol><p><strong>البطاقة (Stripe):</strong> أدخل رقم البطاقة، تاريخ الانتهاء (شهر/سنة)، رمز الأمان (3 أرقام بالضبط)، واسم حامل البطاقة — الأربعة مطلوبة ويتم التحقق منها أثناء الكتابة — ثم انقر على <strong>الدفع</strong>. بطاقة اختبار لهذه البيئة: 4111 1111 1111 1111 تنجح. 0000 0000 0000 0000 تُرفض، مفيدة لرؤية شكل الدفع الفاشل.</p><p><strong>PayPal:</strong> اختر PayPal عند الدفع، ثم أكمل الدفع على صفحة PayPal الخاصة به. ستعود إلى Hadam بمجرد الانتهاء، ويتم تأكيد طلبك تلقائيًا.</p><p><strong>الدفع نقدًا:</strong> إذا كان المتجر يوفر الدفع نقدًا، يتم إنشاء طلبك بحالة دفع معلّقة. ادفع للمتجر شخصيًا حسب الترتيب؛ يقوم أحد الموظفين بعد ذلك بتأكيد الدفع، وعندها يتقدم طلبك.</p><p><strong>التحويل البنكي:</strong> إذا كان المتجر يوفر هذا الخيار، ستحصل على بيانات التحويل الخاصة بالمتجر. يبقى طلبك معلّقًا حتى يؤكد المتجر استلام التحويل، لذا من الطبيعي أن يظهر في انتظار التأكيد لبعض الوقت.</p><p><strong>إذا لم يكتمل الدفع:</strong> يمكنك المحاولة مرة أخرى من صفحة إتمام الشراء، أو تجربة طريقة أخرى إذا كان المتجر يوفر أكثر من واحدة. إذا استمرت المشكلة، تواصل مع المتجر أو استخدم <strong>اتصل بنا</strong> على موقع المنصة.</p><p>تصبح المنتجات الرقمية متاحة للتنزيل فور نجاح الطلب، من إيصالك ومن طلباتي.</p><p><strong>حجز خدمة:</strong> أضفها إلى سلتك وأكمل الدفع بنفس الطريقة — لا يوجد مسار منفصل. سيؤكد موظفو المتجر ويجدولون الأمر؛ ستراه في طلباتي بمجرد تأكيده.</p>',
    helpSecOrdersTitle: 'طلباتي وتتبع التسليم',
    helpSecOrdersBody: '<p>اذهب إلى <strong>طلباتي</strong> في أي متجر اشتريت منه لرؤية كل طلب، حالته الحالية (معلق، قيد المعالجة، تم الشحن، تم التسليم، إلخ)، أي ملاحظة تتبع أضافها الموظفون، ورابط تنزيل للمنتجات الرقمية.</p><p><strong>تأكيد التسليم:</strong> بمجرد أن يعلّم متجر عنصر شحن كمُسلَّم، ستحصل على بريد إلكتروني وترى خيارين: <strong>تأكيد الاستلام</strong> (يخبر المتجر أنك استلمته — يُتبَّع بشكل منفصل عن حالة "التسليم" الخاصة بالمتجر نفسه، لذا يوجد سجل واضح) أو <strong>الإبلاغ عن مشكلة</strong> (لأي شيء مفقود أو تالف أو خاطئ — يُخطر الموظفين فورًا). إذا لم تفعل شيئًا لعدة أيام، ستحصل على بريد تذكير.</p>',
    helpSecRefundsTitle: 'الاستردادات',
    helpSecRefundsBody: '<p><strong>كعميل:</strong> انقر على طلب استرداد على عنصر الطلب المعني وأعط سببًا. يُخطَر موظفو المتجر فورًا وسيوافقون على طلبك أو يرفضونه، مع سبب في حال الرفض — ستصلك رسالة بريد إلكتروني في الحالتين.</p><p>إذا <strong>وافقوا</strong>، سيُطلَب منك، من طلباتي، تأكيد طريقة دفع للاسترداد (يمكن أن تكون بطاقة مختلفة عن التي دفعت بها أصلًا — يُخزَّن فقط آخر 4 أرقام دائمًا). بمجرد الإرسال، يُعالَج الاسترداد فورًا: يُعلَّم العنصر كمُسترَد، ويُستعاد المخزون تلقائيًا إن أمكن، وتصلك رسالة تأكيد نهائية.</p><p>المنتج الرقمي الذي تم تنزيله بالفعل لا يمكن استرداده بعد الآن.</p><p><strong>كموظف متجر:</strong> تظهر طلبات الاسترداد في قائمة التنفيذ الخاصة بك مع سبب العميل، التاريخ، والعنصر. وافق أو ارفض مع سببك الخاص — كل استرداد يحتاج قرارًا بشريًا، وهذا ليس تلقائيًا أبدًا.</p>',
    helpSecCreatingStoreTitle: 'إنشاء متجرك الخاص',
    helpSecCreatingStoreBody: '<p>من الموقع المنصة، اذهب إلى <strong>البيع على هدام ← أنشئ متجرًا</strong>.</p><ol><li>اختر نطاقًا فرعيًا (2-30 حرفًا إنجليزيًا صغيرًا/رقمًا/شرطة) واسم متجر.</li><li>اختر ما تريد: متجر فقط (غير مُدرَج في السوق)، السوق فقط، أو كلاهما.</li><li>اختر باقة اشتراك — المبتدئ (مجاني)، الاحترافي (29$/شهريًا)، أو المؤسسات (99$/شهريًا). تعكس هذه الرسوم حدود المنتجات ونسب العمولة الفعلية لكل باقة، لكن لا يوجد نظام فوترة متكررة فعلي بعد — هذه بيئة ما قبل الإطلاق.</li><li>المبتدئ لا يتطلب أي خطوة دفع. الاحترافي/المؤسسات تطلب بيانات بطاقة، يتم التحقق منها بنفس نمط بطاقة الاختبار المستخدم عند الدفع (4111 1111 1111 1111 تنجح، بطاقة كلها أصفار تُرفض) — لا يحدث أي خصم حقيقي في الحالتين.</li><li>أدخل اسمك وبريدك الإلكتروني وكلمة مرورك — هذا يصبح حساب مسؤول متجرك.</li><li>أرسل. متجرك مباشر فورًا على yourstore.hadamplatform.com.</li></ol><p>يمكن لبريد إلكتروني واحد أن يملك متجرًا نشطًا واحدًا فقط في كل مرة.</p>',
    helpSecManagingStoreTitle: 'إدارة متجرك (المسؤول)',
    helpSecManagingStoreBody: '<p>سجّل الدخول إلى متجرك كمسؤول، ثم استخدم لوحة <strong>الإدارة</strong> لـ: إضافة فئات ومنتجات، إدارة الموظفين (إضافة/إزالة الموظفين، إعادة تعيين التحقق بخطوتين الخاص بهم إذا أُقفلوا)، عرض وتنفيذ الطلبات عبر <strong>قائمة التنفيذ</strong>، تغيير إعدادات المتجر (الاسم، الشعار، الباقة، التسجيل تشغيل/إيقاف، متطلب التحقق بخطوتين للموظفين)، وعرض إحصائيات المبيعات.</p><p>فئة المنتج تحدد كيفية تنفيذ الطلبات الخاصة به — شحن، تنزيل، أو حجز كخدمة.</p>',
    helpSecSubscriptionsTitle: 'الاشتراكات وتجديد باقتك',
    helpSecSubscriptionsBody: '<p>من متجرك، اذهب إلى <strong>البيع على هدام</strong>. إذا كنت بالفعل على باقة، فزر تلك الباقة معطَّل — يربطك تلميح بـ <strong>الإعدادات</strong>، حيث توجد أزرار تجديد المتجر / تجديد السوق / تجديد كليهما الفعلية. هذه تفتح نموذج دفع وتمدد اشتراكك 30 يومًا.</p><p>إذا كان اشتراكك الحالي لا يزال يتبقى منه أكثر من أسبوع ولم تغيّر الباقة، يخبرك النظام أن التجديد غير ضروري بعد بدلًا من تحصيل رسوم مرة أخرى. لتبديل الباقة، اختر واحدة مختلفة في صفحة البيع على هدام — يُعامَل ذلك دائمًا كتغيير صريح، لا يُمنَع أبدًا.</p>',
    helpSecMarketplaceTitle: 'السوق: الانضمام، الإضافة، التجديد',
    helpSecMarketplaceBody: '<p><strong>لا تملك متجر هدام، تريد فقط الظهور؟</strong> استخدم البيع على هدام ← انضم إلى سوق هدام. أرسل تفاصيل عملك، اختر مجاني أو مميز (19$/شهريًا، مدفوع مسبقًا)، ويراجعه مسؤول عام قبل نشره — تُخطَر بالبريد الإلكتروني في الحالتين. يمكن لبريد إلكتروني واحد أن يملك طلبًا نشطًا/معلقًا واحدًا فقط؛ يمكن إعادة تقديم الطلب المرفوض.</p><p><strong>لديك بالفعل متجر هدام وتريد إدراجه أيضًا؟</strong> استخدم البيع على هدام ← أضف متجري إلى السوق — أدخل نطاقك الفرعي وبيانات دخول المسؤول، أكّد الدفع، ويُدرَج متجرك الحالي فورًا، دون إنشاء متجر جديد.</p><p><strong>تجديد عضوية مميزة:</strong> استخدم البيع على هدام ← التجديد، اختر عضوية السوق، أدخل البريد الإلكتروني واسم العمل اللذين استخدمهما طلبك، وادفع. القوائم من الباقة المجانية لا تنتهي صلاحيتها أبدًا.</p><p>كما هو الحال مع مدفوعات الاشتراك في أماكن أخرى من هدام، يستخدم التحقق من بطاقة "مميز" نفس نمط بطاقة الاختبار المستخدم عند الدفع (4111 1111 1111 1111 تنجح، بطاقة كلها أصفار تُرفض) — لا يوجد نظام خصم متكرر فعلي بعد، لأن هذه بيئة ما قبل الإطلاق.</p>',
    helpSecAccountSecurityTitle: 'الحساب والأمان',
    helpSecAccountSecurityBody: '<p><strong>نسيت كلمة المرور؟</strong> انقر على "نسيت كلمة المرور؟" في أي شاشة تسجيل دخول — ستحصل على رابط بالبريد الإلكتروني يعيدك إلى نطاق ذلك المتجر نفسه.</p><p><strong>التحقق بخطوتين:</strong> متاح من قائمة حسابك — تطبيق مصادقة (TOTP)، رموز بريد إلكتروني، أو رموز نسخ احتياطي. يمكن لمسؤول المتجر إلزام جميع الموظفين بالتحقق بخطوتين.</p><p><strong>فقدت جهاز التحقق بخطوتين؟</strong> استخدم رمز نسخ احتياطي، أو اطلب من مسؤول متجرك (أو المسؤول العام للمنصة، للمسؤولين أنفسهم) إعادة تعيينه لك.</p><p><strong>رموز التحقق عبر البريد الإلكتروني:</strong> إذا كان البريد الإلكتروني طريقة التحقق بخطوتين الخاصة بك، يُرسَل رمز من 6 أرقام إلى بريدك المسجَّل في كل مرة تسجل فيها الدخول. تنتهي صلاحيته بعد 10 دقائق ويعمل مرة واحدة. إذا لم يصل خلال دقيقة أو دقيقتين، تحقق من البريد العشوائي، أو انقر "إعادة إرسال الرمز".</p>',
    helpSecContactTitle: 'الاتصال والحصول على مزيد من المساعدة',
    helpSecContactBody: '<p>استخدم <strong>اتصل بنا</strong> على الموقع المنصة لأي سؤال لا يغطيه متجر محدد. تذهب رسالتك مباشرة إلى فريق هدام، وسترى تأكيدًا على الشاشة بمجرد إرسالها.</p><p>في جميع أنحاء التطبيق، ابحث عن أيقونات "؟" الصغيرة بجانب الحقول والأزرار — انقر على واحدة للحصول على إرشادات خاصة بتلك الخطوة بالضبط، بما في ذلك ما يجب إدخاله، ولماذا هو مطلوب، وماذا تفعل إذا حدث خطأ ما.</p>',
    technicalManualTitle: 'الدليل الفني', technicalManualDesc: 'للمسؤولين والمطورين والدعم الفني — البنية، الأدوار، بنية قاعدة البيانات، واجهات البرمجة، سير العمل، واستكشاف الأخطاء وإصلاحها.', downloadTechnicalManualBtn: 'تنزيل الدليل الفني (.docx)',
    helpIconAriaLabel: 'مساعدة', helpWhatLabel: 'ما الذي يجب إدخاله', helpWhyLabel: 'لماذا هذا مطلوب', helpNextLabel: 'ماذا يحدث بعد ذلك', helpRulesLabel: 'المتطلبات', helpErrorsLabel: 'إذا حدث خطأ ما', helpMoreLabel: 'تحتاج مساعدة إضافية؟', helpMoreText: 'راجع صفحة', helpMoreTextEnd: 'للاطلاع على الأدلة الكاملة.',
    helpSubWhat: 'عنوان ويب قصير وفريد لمتجرك — سيصبح yourchoice.hadamplatform.com.', helpSubWhy: 'هذه هي الطريقة التي يجدك بها العملاء، وكيف يميّز النظام متجرك عن باقي المتاجر على المنصة.', helpSubNext: 'بمجرد الإنشاء، يصبح متجرك مباشرًا فورًا على هذا العنوان — يمكنك مشاركته على الفور.', helpSubRules: 'من 2 إلى 30 حرفًا: أحرف إنجليزية صغيرة وأرقام وشرطات فقط. يجب ألا يكون مستخدمًا بالفعل.',
    helpPlanWhat: 'ما إذا كان متجرك سيظهر أيضًا في دليل السوق المشترك.', helpPlanWhy: 'السوق صفحة تصفح مشتركة منفصلة عبر جميع بائعي هدام — الإدراج فيها يعني أن المتسوقين يمكنهم اكتشافك دون معرفة عنوان متجرك مسبقًا.', helpPlanNext: 'يبقى خيار "متجر فقط" خاصًا لمن لديهم رابطك. أما "السوق فقط" أو "كلاهما" فيتم إدراجهما في الدليل فور الإنشاء.',
    helpTierWhat: 'باقة اشتراكك، والتي تحدد حد المنتجات ونسبة العمولة.', helpTierWhy: 'الباقات الأعلى ترفع حد المنتجات وتخفض العمولة المأخوذة من كل عملية بيع.', helpTierNext: 'باقة المبتدئ لا تتطلب دفعًا. الاحترافي والمؤسسات تطلبان بيانات البطاقة أدناه قبل إنشاء متجرك.', helpTierRules: 'يمكنك تغيير الباقة لاحقًا من الإدارة ← الإعدادات — هذا الاختيار ليس نهائيًا.',
    helpCardWhat: 'رقم البطاقة، تاريخ الانتهاء (شهر/سنة)، رمز الأمان (CVV)، واسم حامل البطاقة.', helpCardWhy: 'مطلوب لتفعيل باقة مدفوعة — هذه البيئة تحاكي الدفع، ولا يتم خصم أي مبلغ فعليًا.', helpCardNext: 'إذا قُبلت البطاقة، يُفعَّل اشتراكك فورًا للفترة الموضحة. إذا رُفضت، لا يتغير شيء ويمكنك المحاولة مجددًا.', helpCardRules: 'يجب أن يتكون رمز الأمان من 3 أرقام بالضبط. جميع الحقول الأربعة مطلوبة. استخدم 4111 1111 1111 1111 لمحاكاة النجاح، أو 0000 0000 0000 0000 لمعاينة الرفض.', helpCardErrors: 'تحقق من النص الأحمر أسفل الحقل غير الصالح تحديدًا — يتم التحقق من كل حقل أثناء الكتابة. إذا رُفضت البطاقة، جرّب رقم اختبار النجاح أو بطاقة حقيقية مختلفة.',
    helpPassWhat: 'كلمة مرور لحساب مسؤول متجرك الجديد.', helpPassRules: '8 أحرف على الأقل، تحتوي على حرف ورقم ورمز خاص.',
    helpRenewTierWhat: 'أي باقة اشتراك تريد تجديدها أو التبديل إليها.', helpRenewTierWhy: 'التجديد يمدد فترتك الحالية 30 يومًا. اختيار باقة مختلفة يُعامَل كتغيير خطة صريح، وليس مجرد تجديد.', helpRenewTierNext: 'إذا كان اشتراكك لا يزال يتبقى منه أكثر من أسبوع ولم تغيّر الباقة، سيخبرك النظام أن التجديد غير ضروري بعد بدلًا من تحصيل رسوم مرة أخرى.',
    helpAddMarketCardWhy: 'مطلوب لتفعيل إدراج متجرك الحالي في السوق — هذه رسوم منفصلة عن اشتراك متجرك نفسه.',
    helpMarketReviewWhat: 'ما إذا كنت ستوافق، ترفض، تعلّق، تعيد تفعيل، أو تطلب معلومات إضافية لهذا الطلب.', helpMarketReviewWhy: 'حتى الطلب المدفوع (المميز) لا يُدرَج علنًا أبدًا حتى يراجعه المسؤول العام ويوافق عليه.', helpMarketReviewNext: 'يُرسَل بريد إلكتروني لمقدم الطلب بالنتيجة. الموافقة تجعله مرئيًا في دليل السوق العام فورًا.', helpMarketReviewRules: 'الرفض هو النتيجة الوحيدة التي تسمح لذلك البريد الإلكتروني بالتقديم مجددًا لاحقًا — أي حالة أخرى تُبقي طلبه الوحيد الحالي كما هو.',
    helpTenantMgmtWhat: 'تعليق أو إعادة تفعيل أي متجر على المنصة.', helpTenantMgmtWhy: 'المتجر المُعلَّق يصبح غير قابل للوصول تمامًا — لا يمكن لعملائه وموظفيه تسجيل الدخول أو تصفحه بعد الآن.', helpTenantMgmtNext: 'إعادة التفعيل تستعيد الوصول الكامل فورًا، مع بقاء جميع البيانات سليمة كما كانت.', helpTenantMgmtErrors: 'إذا اعترض صاحب متجر على تعليقه، راجع سجل تدقيق المنصة الخاص بسبب التعليق قبل إعادة التفعيل.',
    helpSuperResetMfaWhat: 'عنوان البريد الإلكتروني لحساب المسؤول المُقفَل.', helpSuperResetMfaWhy: 'هذا يزيل جميع طرق التحقق بخطوتين الخاصة بذلك الحساب (تطبيق المصادقة، رمز البريد الإلكتروني، ورموز النسخ الاحتياطي) دفعة واحدة — لا يوجد إعادة تعيين جزئية.', helpSuperResetMfaNext: 'يمكنهم تسجيل الدخول بكلمة المرور فقط في المحاولة التالية، ثم إعداد التحقق بخطوتين من جديد إن أرادوا ذلك.', helpSuperResetMfaRules: 'تحقق من هويتهم بنفسك قبل استخدام هذا — فهو يتجاوز طبقة الحماية الثانية بأكملها على حسابهم.', helpSuperResetMfaErrors: 'إذا لم يتطابق البريد الإلكتروني مع أي حساب، تحقق من وجود أخطاء إملائية — هذا يعمل فقط للحسابات الموجودة فعليًا.',
    helpSuperContactWhat: 'الرسائل المُرسَلة عبر نموذج الاتصال العام، من أي شخص.', helpSuperContactWhy: 'هذه ليست مرتبطة بأي متجر محدد — إنها أسئلة عامة عن المنصة.', helpSuperContactNext: 'انقر على عنوان البريد الإلكتروني للرد مباشرة من برنامج بريدك الخاص — لا توجد ميزة رد داخل التطبيق.',
    helpSuperOwnMfaWhat: 'إعداد التحقق بخطوتين الخاص بك — تطبيق مصادقة، رمز بريد إلكتروني، أو رموز نسخ احتياطي.', helpSuperOwnMfaWhy: 'حساب المسؤول العام الخاص بك يمكنه إدارة كل متجر على المنصة، لذا يحتاج حماية أقوى من كلمة المرور وحدها.', helpSuperOwnMfaNext: 'بمجرد التفعيل، سيُطلَب منك رمز في كل مرة تسجل فيها الدخول، بالإضافة إلى كلمة المرور.', helpSuperOwnMfaRules: 'أعدّ رموز النسخ الاحتياطي فور تفعيل أي طريقة تحقق بخطوتين — إنها طريقتك الوحيدة للعودة بنفسك إذا فقدت جهاز المصادقة الخاص بك.',
    helpSuperAuditLogWhy: 'كل إجراء متعلق بالأمان عبر كل متجر — تسجيلات الدخول، تغييرات التحقق بخطوتين، إعادة تعيين كلمات المرور، الإقفالات، وإجراءات المسؤول — تُسجَّل هنا تلقائيًا.', helpSuperAuditLogNext: 'استخدم هذا للتحقيق في حادثة معينة (مثل تعليق مُتنازَع عليه) أو للتحقق مما إذا كانت محاولة تسجيل دخول قد حدثت فعليًا.',
    superadminLogin: 'تسجيل دخول المشرف العام', dashboardNavLink: 'لوحة التحكم',
    heroEyebrow: 'متجر رقمي عالمي ومنصة سوق متعددة المستأجرين',
    heroH1: 'كل متجر يحصل على نطاقه الفرعي الخاص. نحن ندير البنية التحتية.',
    heroP: 'هدام هي المنصة — المصادقة، الكتالوج، السلة، الدفع، والتنفيذ، مشتركة بين جميع المتاجر. متجرك يعيش على <strong>yourname.hadamplatform.com</strong> ويبدأ بكتالوج فارغ: أنت من يقرر ماذا تبيع وكيف يُصنَّف.',
    browseMarketplaceBtn: 'تصفح السوق', getOwnStoreBtn: 'احصل على متجرك الخاص',
    shopPanelH3: 'تريد التسوق، أو إدارة متجر تملكه بالفعل؟',
    shopPanelP: `هذه الصفحة (الصفحة الرئيسية لهدام) <strong>ليست</strong> مكان تسجيل دخول العملاء أو الموظفين أو مديري المتاجر.
        كل متجر له عنوانه الخاص وتسجيل دخوله الخاص — اذهب إلى <strong>yourname.hadamplatform.com</strong>
        (أو <code>yourname.localhost:3000</code> عند الاختبار المحلي) وسجّل الدخول هناك.
        زر "تسجيل دخول المشرف العام" أعلاه مخصص فقط لموظفي منصة هدام أنفسهم، الذين يشرفون على دليل
        المتاجر أدناه — وليس له أي وصول إلى منتجات أو طلبات أو عملاء أي متجر.`,
    marketSearchPlaceholder: 'ابحث عن منتجات في كل المتاجر…', sellerStoresH3: 'متاجر البائعين',
    wantOwnStoreP: 'تريد متجرك الخاص؟ احصل على نطاق فرعي مثل <code>yourname.hadam.store</code>.',
    createStoreH3: 'أنشئ متجرك', alreadyHaveStoreHint: 'هل لديك بالفعل متجر على هدام وتريد فقط إضافته إلى السوق؟ لا تنشئ متجرًا جديدًا هنا — سجّل الدخول إلى لوحة إدارة متجرك الحالي واذهب إلى "البيع على هدام" من هناك لإضافة متجرك إلى السوق مباشرة.', subdomainLabel: 'النطاق الفرعي', subdomainPlaceholder: 'yourstore',
    createStoreTabBtn: 'أنشئ متجرًا', joinMarketplaceTabBtn: 'انضم إلى سوق هدام', sellModeHint: 'تبدأ عملاً جديدًا تمامًا؟ أنشئ متجرًا. تدير عملك الخاص في مكان آخر وتريد فقط ظهورًا في سوق هدام؟ انضم إلى السوق — لا حاجة لمتجر هدام. لديك بالفعل متجر هدام وتريد إضافته إلى السوق؟ استخدم "أضف متجري إلى السوق".',
    addMarketplaceTabBtn: 'أضف متجري إلى السوق', addMarketplaceH3: 'أضف متجري الحالي إلى السوق', addMarketplaceIntro: 'لمسؤولي متاجر هدام الذين لديهم بالفعل متجر ويريدون إدراجه في السوق — لا يتم إنشاء متجر أو نطاق فرعي جديد، بل يُفعَّل هذا على متجرك الحالي.',
    addMarketplaceBtn: 'أضف متجري إلى السوق', addMarketplaceSuccessMsg: 'تمت إضافة متجرك إلى السوق:', howAddMarketWorksH3: 'كيف يعمل هذا',
    renewTabBtn: 'تمديد/تجديد العضوية', renewH3: 'تمديد/تجديد العضوية', renewIntro: 'قم بتمديد أو تجديد اشتراك متجر أو سوق حالي، قبل انتهائه أو بعده.',
    renewTypeLabel: 'ماذا تريد تجديده؟', renewTypeStoreOpt: 'تجديد خطة متجر هدام', renewTypeMarketOpt: 'تجديد عضوية سوق هدام',
    renewMarketPriceLabel: 'عضوية السوق المميزة — 19$/شهريًا', renewMarketFreeHint: 'قوائم السوق المجانية ليس لها تاريخ انتهاء ولا شيء لتجديده — ينطبق نموذج التجديد هذا على العضويات المميزة فقط.', priceLabel: 'السعر', perMonthLabel: 'شهر',
    renewTypeBothOpt: 'تجديد باقة متجر هدام + السوق', checkStatusBtn: 'تحقق من الحالة الحالية', currentStatusLabel: 'الحالة الحالية', currentPlanLabel: 'الخطة الحالية',
    renewBtn: 'تجديد', renewSuccessMsg: 'تم تأكيد التجديد.', howRenewWorksH3: 'كيف يعمل هذا',
    howRenewWorksP: 'اختر ما إذا كنت تجدد اشتراك متجر هدام أم عضوية السوق.<br>أكّد هويتك — بيانات دخول مسؤول متجرك، أو البريد الإلكتروني واسم العمل الذي قدمت به طلبك للسوق.<br>يتم التحقق من الدفع قبل أي تغيير — اختيار خطة وحده لا يُفعّل أو يمدد الاشتراك أبدًا.<br>بمجرد تأكيد الدفع، يُمدَّد تاريخ الانتهاء 30 يومًا، ويُستعاد الوصول فورًا إذا كان قد انتهى.',
    howAddMarketWorksP: 'أدخل النطاق الفرعي لمتجرك وبيانات تسجيل دخول المسؤول الخاصة بك لهذا المتجر.<br>أكّد الدفع لإضافة متجرك إلى السوق.<br>يُدرَج متجرك الحالي — نفس النطاق الفرعي ونفس الكتالوج ونفس العملاء — فورًا في دليل سوق هدام المشترك.<br><br>لا يتم أبدًا إنشاء متجر أو نطاق فرعي ثانٍ. إذا كان حساب المسؤول الخاص بك يحتوي على التحقق بخطوتين، فاستخدم لوحة إدارة متجرك بدلاً من هذه الصفحة.',
    joinMarketplaceH3: 'انضم إلى سوق هدام', joinMarketplaceIntro: 'أدرج عملك الحالي في سوق هدام لتحقيق الظهور — دون الحاجة إلى متجر هدام أو نطاق فرعي أو حساب. تتم عمليات الشراء بالكامل على موقعك الخاص.',
    businessNameLabel: 'اسم العمل', ownerNameLabel: 'اسم المالك', phoneLabel: 'الهاتف', countryLabel: 'الدولة', cityLabel: 'المدينة', websiteUrlLabel: 'رابط الموقع الإلكتروني',
    businessCategoryLabel: 'فئة العمل', businessCategoryPlaceholder: 'مثال: إلكترونيات، أزياء، أدوات منزلية', businessDescriptionLabel: 'وصف العمل', logoUrlLabel: 'رابط الشعار (اختياري)',
    joinMarketplaceBtn: 'انضم إلى سوق هدام', joinMarketplaceSuccessMsg: 'انضم إلى سوق هدام! عملك الآن مُدرج في الدليل.',
    howJoinWorksH3: 'كيف يعمل هذا', howJoinWorksP: 'تقديم معلومات عملك — لا يتم إنشاء متجر هدام أو نطاق فرعي.<br>يظهر عملك في دليل سوق هدام مع شعارك ووصفك ورابط لموقعك الخاص.<br>يتم توجيه المتسوقين الذين يجدونك عبر هدام إلى موقعك الخاص لإتمام الشراء — لا يعالج هدام المدفوعات أو الطلبات لأعضاء السوق فقط.<br>يمكنك الترقية إلى متجر هدام كامل في أي وقت — تنتقل معلومات عملك، وستحصل على نطاق فرعي وكتالوج وسلة تسوق وخروج وكل ميزة أخرى لمتجر هدام.',
    externalMemberBadge: 'بائع خارجي', externalMemberBadgeTooltip: 'مُدرج في سوق هدام فقط — تتم عمليات الشراء على موقعه الخاص وليس عبر هدام.', visitExternalSiteLink: 'زيارة موقعهم',
    marketplacePlanLabel: 'خطة السوق', jmPlanFreeOpt: 'إدراج مجاني — قيد أساسي في الدليل', jmPlanFeaturedOpt: 'إدراج مميز — 19$/شهريًا، ترتيب أولوية + ترويج', featuredBadge: 'مميز',
    addressLabel: 'عنوان العمل', registrationNumberLabel: 'رقم تسجيل العمل (اختياري)', vatNumberLabel: 'الرقم الضريبي (اختياري)', socialLinksLabel: 'روابط التواصل الاجتماعي (كلها اختيارية)',
    applicationPendingMsg: 'تم استلام طلبك لـ ', applicationPendingMsg2: ' وهو الآن قيد المراجعة. ستصلك رسالة بريد إلكتروني عند الموافقة عليه.',
    addMarketplaceSuccessMsg: 'تمت إضافة متجرك إلى السوق:', disableBtn: 'تعطيل', disableMfaConfirm: 'تعطيل التحقق بخطوتين؟',
    emailOtpEnableBtn: 'تفعيل رمز البريد الإلكتروني', emailOtpEnabledLabel: 'رمز البريد الإلكتروني مُفعَّل', emailOtpSectionHint: 'ليس لديك تطبيق مصادقة؟ احصل على رمز لمرة واحدة عبر البريد الإلكتروني بدلاً من ذلك عند تسجيل الدخول.', emailOtpSectionTitle: 'رمز التحقق عبر البريد الإلكتروني',
    invalidRecoveryLinkMsg: 'رابط إعادة تعيين كلمة المرور هذا غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.', mfaEmailSendingHint: 'جارٍ إرسال رمز إلى بريدك الإلكتروني...', mfaEmailSentHint: 'أدخل الرمز الذي أرسلناه للتو إلى بريدك الإلكتروني.',
    mfaMethodAuthenticatorApp: 'تطبيق المصادقة', mfaMethodEmail: 'رمز البريد الإلكتروني', mfaQrLoadErrorMsg: 'فشل تحميل صورة رمز الاستجابة السريعة — استخدم رمز الإدخال اليدوي أدناه بدلاً من ذلك.',
    passwordTooShortError: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.', perMonthLabel: 'شهر', priceLabel: 'السعر',
    recoveryMfaRequiredHint: 'هذا الحساب يحتوي على التحقق بخطوتين — أدخل رمزًا من تطبيق المصادقة الخاص بك لإنهاء إعادة تعيين كلمة المرور.',
    recoveryMfaUnavailableMsg: 'التحقق بخطوتين مطلوب لإعادة تعيين كلمة المرور هذه، ولكن تعذر العثور على طريقة تحقق مُفعَّلة. يرجى الاتصال بالدعم.',
    renewSuccessMsg: 'تم تأكيد التجديد.', requestNewLinkBtn: 'طلب رابط جديد', resendCodeLink: 'إعادة إرسال الرمز', reviewNotePrompt: 'ملاحظة اختيارية (تُعرض لمقدم الطلب):',
    mfaMethodBackup: 'رمز احتياطي', backupCodeLoginHint: 'أدخل أحد رموزك الاحتياطية. كل رمز يعمل مرة واحدة فقط.', backupCodeLabel: 'رمز احتياطي',
    backupCodesSectionTitle: 'الرموز الاحتياطية', backupCodesSectionHint: 'رموز لمرة واحدة للدخول إذا فقدت الوصول إلى تطبيق المصادقة أو بريدك الإلكتروني.',
    backupCodesNoPrimaryWarning: 'الرموز الاحتياطية هي وسيلة احتياطية فقط، وليست وسيلة تسجيل دخول بحد ذاتها — فعّل تطبيق المصادقة أو رمز البريد الإلكتروني أعلاه أولاً، وإلا فلن يُطلب منك هذه الرموز أبدًا عند تسجيل الدخول.',
    resetMfaBtn: 'إعادة تعيين التحقق بخطوتين', resetMfaSuccess: 'تمت إعادة تعيين التحقق بخطوتين لهذا الحساب.', adminResetMfaTitle: 'إعادة تعيين التحقق بخطوتين لحساب محظور',
    adminResetMfaHint: 'الملاذ الأخير: لمسؤول متجر فقد كلاً من جهاز المصادقة والرموز الاحتياطية، دون وجود مسار ذاتي متبقٍ. تحقق من هويته بنفسك قبل استخدام هذا.',
    auditLogTitle: 'سجل تدقيق الأمان', auditLogHint: 'سجل بالأحداث الأمنية عبر جميع المتاجر — تسجيلات الدخول، تغييرات التحقق بخطوتين، إعادة تعيين كلمات المرور، وإجراءات المسؤول.',
    contactMessagesTitle: 'رسائل نموذج الاتصال', contactMessagesHint: 'الرسائل المُرسَلة عبر نموذج الاتصال العام.', noContactMessages: 'لا توجد رسائل بعد.', dateLabel: 'التاريخ', nameLabel: 'الاسم', messageLabel: 'الرسالة',
    auditLogEmailFilterPlaceholder: 'تصفية حسب البريد الإلكتروني', auditLogAllEventTypes: 'جميع أنواع الأحداث', auditLogAllOutcomes: 'جميع النتائج',
    auditLogSuccess: 'نجاح', auditLogFailure: 'فشل', auditLogApplyFilters: 'تطبيق الفلاتر', auditLogEmpty: 'لا توجد أحداث مطابقة.',
    pricingPlansTitle: 'تسعير المتجر والسوق', pricingPlansHint: 'إدارة الخطط التي يمكن للمتاجر الاشتراك فيها. تغيير السعر يؤثر فقط على الاشتراكات الجديدة والمستقبلية -- الخطط المُشتراة مسبقًا تحتفظ بسعرها الأصلي.', noPlansYet: 'لا توجد خطط بعد -- أضف واحدة أدناه.', planNameLabel: 'الاسم', monthlyPriceLabel: 'السعر الشهري', yearlyPriceLabel: 'السعر السنوي', commissionRateLabel: 'نسبة العمولة', maxProductsLabel: 'الحد الأقصى للمنتجات', maxStorageLabel: 'الحد الأقصى للتخزين (ميجابايت)', staffAccountsLabel: 'حسابات الموظفين', marketplaceAllowedLabel: 'يُسمح بالإدراج في السوق', customDomainLabel: 'يُسمح بنطاق مخصص', addPlanTitle: 'إضافة خطة جديدة', editPlanTitle: 'تعديل الخطة', savePlanBtn: 'حفظ الخطة', cancelEditBtn: 'إلغاء / خطة جديدة', activeLabel: 'نشطة', inactiveLabel: 'غير نشطة', editBtn: 'تعديل', deactivateBtn: 'إلغاء التفعيل', activateBtn: 'تفعيل', unlimited: 'غير محدود', planCreatedMsg: 'تم إنشاء الخطة.', planUpdatedMsg: 'تم تحديث الخطة.',
    auditLogWhen: 'الوقت', auditLogEvent: 'الحدث', auditLogEmailCol: 'البريد الإلكتروني', auditLogOutcomeCol: 'النتيجة', auditLogIp: 'عنوان IP', auditLogDetails: 'التفاصيل',
    auditLogPageInfo: 'صفحة {page} من {total}', auditLogPrev: 'السابق', auditLogNext: 'التالي',
    auditEvent_login_success: 'تسجيل دخول ناجح', auditEvent_login_failure: 'فشل تسجيل الدخول', auditEvent_logout: 'تسجيل الخروج',
    auditEvent_password_reset_requested: 'طلب إعادة تعيين كلمة المرور', auditEvent_password_reset_completed: 'تمت إعادة تعيين كلمة المرور',
    auditEvent_mfa_totp_enrolled: 'تم تفعيل تطبيق المصادقة', auditEvent_mfa_totp_disabled: 'تم تعطيل تطبيق المصادقة',
    auditEvent_mfa_totp_verify_success: 'تم التحقق من رمز المصادقة', auditEvent_mfa_totp_verify_failure: 'رُفض رمز المصادقة',
    auditEvent_mfa_email_otp_enabled: 'تم تفعيل رمز البريد الإلكتروني', auditEvent_mfa_email_otp_disabled: 'تم تعطيل رمز البريد الإلكتروني',
    auditEvent_mfa_email_otp_verify_success: 'تم التحقق من رمز البريد الإلكتروني', auditEvent_mfa_email_otp_verify_failure: 'رُفض رمز البريد الإلكتروني',
    auditEvent_mfa_backup_codes_generated: 'تم إنشاء رموز احتياطية', auditEvent_mfa_backup_code_used: 'تم استخدام رمز احتياطي', auditEvent_mfa_backup_code_verify_failure: 'رُفض الرمز الاحتياطي',
    auditEvent_account_locked: 'تم قفل الحساب (تجاوز الحد)', auditEvent_admin_mfa_reset: 'إعادة تعيين التحقق بخطوتين بواسطة المسؤول', auditEvent_account_created: 'تم إنشاء الحساب', auditEvent_account_deleted: 'تم حذف الحساب',
    emailRequiredError: 'البريد الإلكتروني مطلوب.', resetMfaConfirmGeneric: 'سيؤدي هذا إلى إزالة كل وسائل التحقق بخطوتين لذلك الحساب، بحيث يمكنه تسجيل الدخول بكلمة المرور فقط وإعداده من جديد. هل تحققت من هويته؟ متابعة؟', renewalNotNeededTierError: 'اشتراكك في {tier} لا يزال ساريًا لمدة {days} يومًا إضافيًا. للتجديد على أي حال أو تغيير الباقة، اختر باقة مختلفة أعلاه، أو راجع لاحقًا قرب تاريخ التجديد.', renewalNotNeededMembershipError: 'عضويتك لا تزال سارية لمدة {days} يومًا إضافيًا.', mfaChooseMethodHint: 'اختر كيف تريد التحقق من أنك أنت.',
    backupCodesRemainingLabel: 'رموز غير مستخدمة متبقية', noBackupCodesLabel: 'لم يتم إنشاء رموز احتياطية بعد.', regenerateBackupCodesBtn: 'إعادة إنشاء الرموز', generateBackupCodesBtn: 'إنشاء رموز احتياطية',
    regenerateBackupCodesConfirm: 'سيؤدي هذا إلى إبطال أي رموز احتياطية موجودة. متابعة؟', yourBackupCodesTitle: 'رموزك الاحتياطية',
    backupCodesWarning: 'احفظ هذه في مكان آمن — كل رمز يعمل مرة واحدة، وهذه هي المرة الوحيدة التي ستظهر فيها.', downloadCodesBtn: 'تنزيل كملف نصي', doneBtn: 'تم',
    lostDeviceUseBackupLink: 'فقدت جهاز المصادقة؟ استخدم رمزًا احتياطيًا', recoveryBackupCodeHint: 'أدخل أحد رموزك الاحتياطية، مع كلمة المرور الجديدة.',
    marketplaceApplicationsTitle: 'طلبات عضوية السوق', noApplicationsYet: 'لا توجد طلبات بعد.',
    approveBtn: 'موافقة', suspendBtn: 'تعليق', reactivateBtn: 'إعادة تفعيل', requestMoreInfoBtn: 'طلب معلومات إضافية', rejectBtn: 'رفض', reviewNotePrompt: 'ملاحظة اختيارية (تُعرض لمقدم الطلب):',
    storeNameLabel: 'اسم المتجر', storeNamePlaceholder: 'اسم متجرك', whatDoYouWantLabel: 'ماذا تريد؟',
    planStoreOption: 'متجر فقط — بِع أي شيء، على نطاقك الفرعي الخاص، دون إدراجه في سوق هدام',
    planMarketplaceOnlyOption: 'السوق فقط — متجرك ونطاقك الفرعي الخاصان، مُدرَجان في سوق هدام',
    planMarketOption: 'أدرج على سوق هدام — تواصل مع المتسوقين الذين يتصفحون كل المتاجر',
    planBothOption: 'كلاهما — متجرك الخاص، ومُدرَج على سوق هدام',
    planHint: 'هذا لا يحدد ماذا يمكنك أن تبيع — كل خطة يمكنها عرض منتجات مادية، أو تنزيلات رقمية، أو خدمات قابلة للحجز. هو فقط يحدد ما إذا كان متجرك سيظهر أيضًا في دليل سوق ومتاجر هدام المشترك، جنبًا إلى جنب مع كل متجر آخر.',
    planHintNoMarketOnly: 'تريد الظهور في السوق فقط، دون متجر هدام أو نطاق فرعي؟ استخدم "انضم إلى سوق هدام" أعلاه بدلاً من ذلك — هذا النموذج مخصص لمن يريد متجره الخاص.',
    tierLabelForm: 'خطة الاشتراك', tierHintForm: 'يمكنك تغيير هذا لاحقًا من الإدارة ← إعدادات المتجر.',
    cardNumber: 'رقم البطاقة', expiry: 'تاريخ الانتهاء', cvv: 'رمز الأمان', cardholderNameLabel: 'اسم حامل البطاقة',
    cardNumberRequiredError: 'رقم بطاقة صالح مطلوب.', cardExpiryFormatError: 'يجب أن يكون تاريخ انتهاء البطاقة بصيغة شهر/سنة.', cardCvvRequiredError: 'رمز أمان البطاقة (CVV/CVC) مطلوب.', cardCvvDigitsError: 'يجب أن يحتوي رمز أمان البطاقة (CVV/CVC) على أرقام فقط.', cardCvvLengthError: 'يجب أن يتكون رمز أمان البطاقة (CVV/CVC) من 3 أرقام بالضبط.', cardholderNameRequiredError: 'اسم حامل البطاقة مطلوب.',
    notNearExpirySubHint: 'هذا الاشتراك لا يزال ساريًا وليس قريبًا من الانتهاء. لاختيار باقة مختلفة بدلًا من ذلك، حددها أدناه.', notNearExpiryMemberHint: 'هذه العضوية لا تزال سارية وليست قريبة من الانتهاء.',
    signupPaymentHint: 'دفعة محاكاة. استخدم 4111 1111 1111 1111 للنجاح أو 0000 0000 0000 0000 لمعاينة الرفض.',
    yourNameLabel: 'اسمك', email: 'البريد الإلكتروني', password: 'كلمة المرور', passwordPlaceholder: 'على الأقل 6 أحرف',
    createStoreBtn: 'أنشئ المتجر', howItWorksH3: 'كيف يعمل هذا',
    howItWorksP: `1. اختر نطاقًا فرعيًا وحدد ما إذا كنت تريد الظهور في السوق أيضًا.<br>
          2. تصبح مديرًا للمتجر — أضف فئاتك ومنتجاتك الخاصة.<br>
          3. ادعُ موظفين (أو مديرين إضافيين) للمساعدة في تنفيذ الطلبات والحجوزات.<br>
          4. يسجّل العملاء في نطاقك الفرعي ويتسوقون من كتالوجك فقط.<br><br>
          بيانات كل متجر — المستخدمون، الكتالوج، الطلبات — معزولة تمامًا عن كل متجر آخر.`,
    contactMessageLabel: 'الرسالة', contactMessagePlaceholder: 'سؤال عن متجر، أو قائمة، أو المنصة نفسها…',
    send: 'إرسال', contactHint: 'لأي طلب أو استرجاع أو أي شيء يخص منتجات متجر معين — تواصل مع ذلك المتجر مباشرة من موقعه؛ هذا النموذج يصل إلى فريق منصة هدام.',
    footerText: `سوق هدام — المتجر الرقمي العالمي ومنصة السوق متعددة المستأجرين. © ${new Date().getFullYear()} سوق هدام. جميع الحقوق محفوظة.`,
    superadminOnlyHint: 'هذا مخصص فقط لموظفي منصة هدام — وليس لأصحاب المتاجر أو الموظفين أو العملاء. هؤلاء يسجلون الدخول من نطاق متجرهم الخاص.',
    forgotPasswordLink: 'نسيت كلمة المرور؟', superForgotPasswordHint: 'أدخل البريد الإلكتروني لحساب المشرف العام الخاص بك وسنرسل رابط إعادة التعيين.', sendResetLinkBtn: 'إرسال رابط إعادة التعيين', resetLinkSentMsg: 'إذا كان هذا البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة التعيين — تحقق من بريدك الوارد.',
    setNewPasswordTitle: 'تعيين كلمة مرور جديدة', newPasswordLabel: 'كلمة المرور الجديدة', confirmNewPasswordLabel: 'تأكيد كلمة المرور الجديدة', setNewPasswordBtn: 'تعيين كلمة المرور الجديدة',
    passwordsDontMatch: 'كلمتا المرور غير متطابقتين.', passwordResetSuccess: 'تمت إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.', passwordTooShortError: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.', passwordSameAsCurrentError: 'هذه كلمة مرورك الحالية — يرجى اختيار كلمة مرور مختلفة.',
    myAccountSecurityTitle: 'أمان حسابي', mfaEnabledStatusMsg: 'التحقق بخطوتين مُفعَّل على هذا الحساب.', mfaNotEnabledStatusMsg: 'التحقق بخطوتين غير مُفعَّل على هذا الحساب.',
    disableMfaBtn: 'تعطيل التحقق بخطوتين', enableMfaBtn: 'تفعيل التحقق بخطوتين', mfaScanHint: 'امسح رمز الاستجابة السريعة هذا باستخدام تطبيق مصادقة (Google Authenticator أو Authy أو غيره)',
    mfaManualEntryLabel: 'أو أدخل هذا الرمز يدويًا', mfaCodeLabel: 'رمز مكون من 6 أرقام', verifyBtn: 'تحقق', mfaEnabledSuccessMsg: 'تم تفعيل التحقق بخطوتين الآن.', disableMfaConfirm: 'تعطيل التحقق بخطوتين؟',
    mfaPromptTitle: 'التحقق بخطوتين', mfaPromptHint: 'أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة الخاص بك.',
    logIn: 'تسجيل الدخول', logout: 'تسجيل الخروج', logInAsSuperadmin: 'سجّل الدخول كمشرف عام لعرض المتاجر.',
    platformSecurityAccessTitle: 'أمان الوصول على مستوى المنصة', platformSecurityAccessHint: 'تنطبق هذه الإعدادات على كل متجر على هدام، حيث تشترك جميعها في مشروع مصادقة واحد.',
    smSettingEmailConfirm: 'تأكيد البريد الإلكتروني مطلوب للتسجيل', smSettingPasswordRules: 'قواعد تعقيد كلمة المرور', smSettingRedirectUrls: 'عناوين إعادة التوجيه المسموح بها', smSettingMfaProviders: 'طرق التحقق بخطوتين المتاحة',
    smSettingRateLimits: 'حدود معدل تسجيل الدخول/API', smSettingPerStoreAccess: 'سياسة التسجيل والتحقق بخطوتين لكل متجر', smManagedInSupabase: 'تُدار في Supabase', smManagedInApp: 'تُدار هنا',
    openSupabaseAuthSettings: 'فتح إعدادات المصادقة في Supabase',
    allTenants: 'كل المتاجر', store: 'المتجر', plan: 'الخطة', revenue: 'الإيرادات', products: 'المنتجات', orders: 'الطلبات',
    users: 'المستخدمون', status: 'الحالة', suspend: 'إيقاف', activate: 'تفعيل',
    noProductsMatch: 'لا توجد منتجات مطابقة بعد.', noStoresYet: 'لا توجد متاجر بعد — كن الأول.', noTagline: 'لا يوجد وصف بعد.',
    storeReady: 'جاهز', storeAddressLabel: 'عنوان متجرك:', localTestingNote: 'ملاحظة للاختبار المحلي: بدون DNS حقيقي، استخدم',
    contactSent: 'تم الإرسال — شكرًا، سنتواصل معك قريبًا.', yourStorePreview: 'متجرك', productSingular: 'منتج', productPlural: 'منتجات',
  },
  fr: {
    home: 'Accueil', marketplaceStores: 'Marketplace et boutiques', sellOnHadam: 'Vendre sur Hadam', contact: 'Contact', langToggle: 'Français',
    helpNavLabel: 'Aide', helpPageTitle: 'Aide', helpPageIntro: "Un guide pas à pas pour utiliser Hadam.", technicalManualSuperadminHint: "Architecture, rôles, structure de la base de données, API, flux de travail et dépannage — réservé aux Superadmins et au support technique. Ceci n'apparaît nulle part dans la section Aide destinée aux utilisateurs.",
    helpRoleAll: 'Tout le monde', helpRoleShopper: 'Acheteurs', helpRoleStoreOwner: 'Propriétaires de boutique', helpRoleMarketplace: 'Membres du Marketplace', helpSearchPlaceholder: "Rechercher un sujet d'aide...", helpNoResults: "Aucun sujet d'aide ne correspond à votre recherche.",
    helpSecGettingStartedTitle: 'Qu\u2019est-ce que Hadam et comment naviguer',
    helpSecGettingStartedBody: "<p>Hadam est deux choses à la fois : une plateforme d'hébergement où n'importe qui peut créer sa propre boutique en ligne sur un sous-domaine (<strong>yourstore.hadamplatform.com</strong>), et un annuaire Marketplace partagé où les boutiques (et les entreprises sans boutique Hadam du tout) peuvent être listées afin que les acheteurs puissent parcourir tous les vendeurs à la fois. Vous pouvez utiliser l'un des deux indépendamment, ou les deux ensemble.</p><p><strong>Site de la plateforme</strong> (hadamplatform.com) : page d'accueil, l'annuaire Marketplace et boutiques, Vendre sur Hadam (créer une boutique / rejoindre le Marketplace / ajouter le Marketplace à une boutique existante / renouveler), Contact, et cette page d'aide.</p><p><strong>Le site propre de chaque boutique</strong> (yourstore.hadamplatform.com) : le catalogue de cette boutique, panier, paiement, vos commandes, et — si vous y êtes employé — le panneau d'administration et la File de traitement.</p><p>Changez de langue avec le sélecteur dans la navigation en haut de chaque page. Les pages en arabe passent automatiquement en mise en page de droite à gauche.</p>",
    helpSecBuyingTitle: "Acheter dans une boutique",
    helpSecBuyingBody: "<ol><li>Parcourez les produits d'une boutique, ou trouvez-en une via l'annuaire Marketplace.</li><li>Ajoutez des articles à votre panier avec l'icône panier.</li><li>Cliquez sur <strong>Passer commande</strong>.</li><li>Inscrivez-vous ou connectez-vous si vous n'avez pas encore de compte.</li><li>Pour les produits physiques, choisissez la livraison à une adresse ou le retrait en boutique (si proposé).</li><li>Choisissez un mode de paiement — les options affichées dépendent de ce que cette boutique a activé.</li><li>Finalisez le paiement en suivant les étapes de ce mode (voir ci-dessous).</li></ol><p><strong>Carte (Stripe) :</strong> saisissez le numéro de carte, l'expiration (MM/AA), le CVV (exactement 3 chiffres), et le nom du titulaire — les quatre sont obligatoires et vérifiés au fur et à mesure — puis cliquez sur <strong>Payer</strong>. Carte de test pour cet environnement : 4111 1111 1111 1111 réussit. 0000 0000 0000 0000 est refusée, utile pour voir à quoi ressemble un paiement échoué.</p><p><strong>PayPal :</strong> sélectionnez PayPal au paiement, puis finalisez le paiement sur la page de PayPal. Vous serez redirigé vers Hadam une fois terminé, et votre commande est confirmée automatiquement.</p><p><strong>Espèces :</strong> si une boutique propose le paiement en espèces, votre commande est créée avec un paiement en attente. Payez la boutique en personne comme convenu ; un membre du personnel confirme ensuite le paiement, ce qui fait avancer votre commande.</p><p><strong>Virement bancaire :</strong> si cette option est proposée, vous recevrez les coordonnées bancaires de la boutique. Votre commande reste en attente jusqu'à ce que la boutique confirme avoir reçu le virement — il est donc normal qu'elle affiche « en attente de confirmation » pendant un moment.</p><p><strong>En cas d'échec du paiement :</strong> vous pouvez réessayer depuis Passer commande, ou essayer un autre mode si la boutique en propose plusieurs. Si le problème persiste, contactez la boutique ou utilisez <strong>Contact</strong> sur le site de la plateforme.</p><p>Les produits numériques deviennent téléchargeables immédiatement après une commande réussie, depuis votre reçu et depuis Mes commandes.</p><p><strong>Réserver un service :</strong> ajoutez-le à votre panier et payez de la même manière — pas de parcours séparé. Le personnel de la boutique confirmera et planifiera ; vous le verrez dans Mes commandes une fois confirmé.</p>",
    helpSecOrdersTitle: "Mes commandes et suivi de livraison",
    helpSecOrdersBody: "<p>Allez dans <strong>Mes commandes</strong> sur n'importe quelle boutique où vous avez acheté pour voir chaque commande, son statut actuel (en attente, en traitement, expédiée, livrée, etc.), toute note de suivi ajoutée par le personnel, et un lien de téléchargement pour les produits numériques.</p><p><strong>Confirmer la livraison :</strong> une fois qu'une boutique marque un article expédié comme livré, vous recevrez un e-mail et verrez deux options : <strong>Confirmer la réception</strong> (indique à la boutique que vous l'avez reçu — suivi séparément du statut « livré » de la boutique elle-même, il existe donc un enregistrement clair) ou <strong>Signaler un problème</strong> (pour tout ce qui est manquant, endommagé ou incorrect — notifie le personnel immédiatement). Si vous ne faites rien pendant quelques jours, vous recevrez un e-mail de rappel.</p>",
    helpSecRefundsTitle: "Remboursements",
    helpSecRefundsBody: "<p><strong>En tant que client :</strong> cliquez sur Demander un remboursement sur l'article de commande concerné et indiquez un motif. Le personnel de la boutique est notifié immédiatement et approuvera ou rejettera votre demande, avec un motif en cas de rejet — vous serez informé par e-mail dans les deux cas.</p><p>Si <strong>approuvé</strong>, vous serez invité, depuis Mes commandes, à confirmer un mode de paiement de remboursement (cela peut être une carte différente de celle utilisée initialement — seuls les 4 derniers chiffres sont jamais conservés). Une fois soumis, le remboursement est traité immédiatement : l'article est marqué remboursé, le stock est restauré automatiquement le cas échéant, et vous recevez un e-mail de confirmation final.</p><p>Un produit numérique déjà téléchargé ne peut plus être remboursé.</p><p><strong>En tant que personnel de boutique :</strong> les demandes de remboursement apparaissent dans votre File de traitement avec le motif du client, la date, et l'article. Approuvez ou rejetez avec votre propre motif — chaque remboursement nécessite une décision humaine, ce n'est jamais automatique.</p>",
    helpSecCreatingStoreTitle: "Créer votre propre boutique",
    helpSecCreatingStoreBody: "<p>Depuis le site de la plateforme, allez dans <strong>Vendre sur Hadam → Créer une boutique</strong>.</p><ol><li>Choisissez un sous-domaine (2 à 30 lettres minuscules/chiffres/tirets) et un nom de boutique.</li><li>Choisissez ce que vous voulez : Juste une boutique (non listée sur le Marketplace), Marketplace uniquement, ou Les deux.</li><li>Choisissez une offre d'abonnement — Débutant (gratuit), Professionnel (29$/mois), ou Entreprise (99$/mois). Ces montants reflètent les vraies limites de produits et taux de commission de chaque offre, mais aucune facturation récurrente réelle n'est encore mise en place — cet environnement est en phase pré-lancement.</li><li>Débutant ne nécessite aucune étape de paiement. Professionnel/Entreprise demandent des coordonnées de carte, vérifiées avec le même modèle de carte de test qu'au paiement (4111 1111 1111 1111 réussit, une carte entièrement à zéro est refusée) — aucun débit réel n'a lieu dans un cas comme dans l'autre.</li><li>Saisissez votre nom, e-mail et mot de passe — cela devient le compte Administrateur de votre boutique.</li><li>Validez. Votre boutique est immédiatement active sur yourstore.hadamplatform.com.</li></ol><p>Un même e-mail ne peut avoir qu'une seule boutique active à la fois.</p>",
    helpSecManagingStoreTitle: "Gérer votre boutique (Admin)",
    helpSecManagingStoreBody: "<p>Connectez-vous à votre boutique en tant qu'Admin, puis utilisez le panneau <strong>Admin</strong> pour : ajouter des catégories et produits, gérer les employés (ajouter/retirer du personnel, réinitialiser leur MFA en cas de blocage), consulter et traiter les commandes via la <strong>File de traitement</strong>, modifier les paramètres de la boutique (nom, slogan, offre, inscription activée/désactivée, exigence d'authentification à deux facteurs pour le personnel), et consulter les statistiques de vente.</p><p>La catégorie d'un produit détermine comment les commandes associées sont traitées — expédiées, téléchargées, ou réservées en tant que service.</p>",
    helpSecSubscriptionsTitle: "Abonnements et renouvellement de votre offre",
    helpSecSubscriptionsBody: "<p>Depuis votre boutique, allez dans <strong>Vendre sur Hadam</strong>. Si vous êtes déjà sur une offre, le bouton de cette offre est désactivé — une astuce vous renvoie vers <strong>Paramètres</strong>, où se trouvent les vrais boutons Renouveler Boutique / Renouveler Marketplace / Renouveler les deux. Ceux-ci ouvrent un formulaire de paiement et prolongent votre abonnement de 30 jours.</p><p>Si votre abonnement actuel a encore plus d'une semaine avant expiration et que vous ne changez pas d'offre, le système vous indique qu'un renouvellement n'est pas encore nécessaire plutôt que de vous facturer à nouveau. Pour changer d'offre, choisissez-en une différente sur la page Vendre sur Hadam — c'est toujours traité comme un changement explicite, jamais bloqué.</p>",
    helpSecMarketplaceTitle: "Le Marketplace : rejoindre, ajouter, renouveler",
    helpSecMarketplaceBody: "<p><strong>Pas de boutique Hadam, juste envie de visibilité ?</strong> Utilisez Vendre sur Hadam → Rejoindre Hadam Marketplace. Soumettez les détails de votre entreprise, choisissez Gratuit ou Featured (19$/mois, payé d'avance), et un superadmin l'examine avant publication — vous êtes informé par e-mail dans les deux cas. Un même e-mail ne peut avoir qu'une seule candidature active/en attente ; une candidature rejetée peut être resoumise.</p><p><strong>Vous avez déjà une boutique Hadam et voulez qu'elle soit aussi listée ?</strong> Utilisez Vendre sur Hadam → Ajouter ma boutique au Marketplace — saisissez votre sous-domaine et vos identifiants admin, confirmez le paiement, et votre boutique existante est listée immédiatement, sans nouvelle boutique créée.</p><p><strong>Renouveler une adhésion Featured :</strong> utilisez Vendre sur Hadam → Renouveler, choisissez Adhésion Marketplace, saisissez l'e-mail et le nom d'entreprise utilisés par votre candidature, et payez. Les listings du plan gratuit n'expirent jamais.</p><p>Comme pour les paiements d'abonnement ailleurs sur Hadam, la vérification de la carte Featured utilise le même modèle de carte de test qu'au paiement (4111 1111 1111 1111 réussit, une carte entièrement à zéro est refusée) — aucun débit récurrent réel n'est encore mis en place, cet environnement étant en phase pré-lancement.</p>",
    helpSecAccountSecurityTitle: "Compte et sécurité",
    helpSecAccountSecurityBody: "<p><strong>Mot de passe oublié ?</strong> Cliquez sur « Mot de passe oublié ? » sur n'importe quel écran de connexion — vous recevrez un lien par e-mail vous ramenant au domaine propre de cette même boutique.</p><p><strong>Authentification à deux facteurs (2FA) :</strong> disponible depuis votre menu de compte — application d'authentification (TOTP), codes par e-mail, ou codes de secours. Un administrateur de boutique peut exiger le 2FA pour tout le personnel.</p><p><strong>Appareil 2FA perdu ?</strong> Utilisez un code de secours, ou demandez à l'administrateur de votre boutique (ou au superadmin de la plateforme, pour les administrateurs eux-mêmes) de le réinitialiser pour vous.</p><p><strong>Codes de vérification par e-mail :</strong> si l'e-mail est votre méthode 2FA, un code à 6 chiffres est envoyé à votre e-mail enregistré à chaque connexion. Il expire après 10 minutes et fonctionne une seule fois. S'il n'arrive pas dans une minute ou deux, vérifiez vos spams, ou cliquez sur « Renvoyer le code ».</p>",
    helpSecContactTitle: "Contact et obtenir plus d'aide",
    helpSecContactBody: "<p>Utilisez <strong>Contact</strong> sur le site de la plateforme pour toute question non couverte par une boutique spécifique. Votre message va directement à l'équipe Hadam, et vous verrez une confirmation à l'écran une fois envoyé.</p><p>Dans toute l'application, recherchez les petites icônes « ? » à côté des champs et boutons — cliquez sur l'une d'elles pour obtenir des conseils spécifiques à cette étape précise, y compris quoi saisir, pourquoi c'est nécessaire, et quoi faire en cas de problème.</p>",
    technicalManualTitle: 'Manuel technique', technicalManualDesc: 'Pour les administrateurs, développeurs et support technique — architecture, rôles, structure de la base de données, API, flux de travail et dépannage.', downloadTechnicalManualBtn: 'Télécharger le manuel technique (.docx)',
    helpIconAriaLabel: 'Aide', helpWhatLabel: 'Que saisir', helpWhyLabel: "Pourquoi c'est nécessaire", helpNextLabel: 'Ce qui se passe ensuite', helpRulesLabel: 'Exigences', helpErrorsLabel: "En cas de problème", helpMoreLabel: "Besoin d'aide supplémentaire ?", helpMoreText: 'Consultez la page', helpMoreTextEnd: 'pour les guides complets.',
    helpSubWhat: 'Une adresse web courte et unique pour votre boutique — elle deviendra yourchoice.hadamplatform.com.', helpSubWhy: "C'est ainsi que les clients trouvent votre boutique, et comment le système la distingue de toutes les autres sur la plateforme.", helpSubNext: 'Une fois créée, votre boutique est immédiatement active à cette adresse — vous pouvez la partager tout de suite.', helpSubRules: '2 à 30 caractères : lettres minuscules, chiffres et tirets uniquement. Ne doit pas déjà être pris.',
    helpPlanWhat: "Si votre boutique doit aussi apparaître dans l'annuaire partagé du Marketplace.", helpPlanWhy: "Le Marketplace est une page de recherche partagée, distincte, regroupant tous les vendeurs Hadam — y être listé permet aux acheteurs de vous découvrir sans connaître déjà l'adresse de votre boutique.", helpPlanNext: "« Juste une boutique » reste privée aux personnes ayant votre lien. « Marketplace uniquement » ou « Les deux » vous listent dans l'annuaire immédiatement après la création.",
    helpTierWhat: "Votre offre d'abonnement, qui définit votre limite de produits et votre taux de commission.", helpTierWhy: 'Les offres supérieures augmentent votre limite de produits et réduisent la commission prélevée sur chaque vente.', helpTierNext: "L'offre Débutant ne nécessite aucun paiement. Professionnel et Entreprise demandent les coordonnées de carte ci-dessous avant la création de votre boutique.", helpTierRules: "Vous pouvez changer d'offre à tout moment plus tard depuis Admin → Paramètres — ce choix n'est pas définitif.",
    helpCardWhat: 'Numéro de carte, expiration (MM/AA), CVV, et le nom du titulaire.', helpCardWhy: "Requis pour activer une offre payante — cet environnement simule le paiement, aucun montant n'est réellement débité.", helpCardNext: "Si la carte est acceptée, votre abonnement s'active immédiatement pour la période indiquée. Si elle est refusée, rien ne change et vous pouvez réessayer.", helpCardRules: 'Le CVV doit comporter exactement 3 chiffres. Les quatre champs sont obligatoires. Utilisez 4111 1111 1111 1111 pour simuler un succès, ou 0000 0000 0000 0000 pour prévisualiser un refus.', helpCardErrors: "Vérifiez le texte rouge sous le champ concerné — chaque champ est vérifié au fur et à mesure de la saisie. Si la carte est refusée, essayez le numéro de test de succès, ou une autre carte réelle.",
    helpPassWhat: 'Un mot de passe pour votre nouveau compte administrateur de boutique.', helpPassRules: 'Au moins 8 caractères, avec une lettre, un chiffre et un caractère spécial.',
    helpRenewTierWhat: "Quelle offre d'abonnement renouveler ou vers laquelle basculer.", helpRenewTierWhy: 'Le renouvellement prolonge votre période actuelle de 30 jours. Choisir une offre différente est traité comme un changement de plan explicite, pas seulement un renouvellement.', helpRenewTierNext: "Si votre abonnement a encore plus d'une semaine avant expiration et que vous n'avez pas changé d'offre, le système vous indiquera qu'un renouvellement n'est pas encore nécessaire plutôt que de vous facturer à nouveau.",
    helpAddMarketCardWhy: "Requis pour activer le référencement Marketplace de votre boutique existante — il s'agit d'un frais distinct de votre abonnement de boutique lui-même.",
    helpMarketReviewWhat: 'Approuver, rejeter, suspendre, réactiver, ou demander plus d\'informations pour cette candidature.', helpMarketReviewWhy: "Même une candidature Featured payante n'est jamais listée publiquement tant qu'un superadmin ne l'a pas examinée et approuvée.", helpMarketReviewNext: 'Le candidat est informé du résultat par e-mail. Approuver le rend visible immédiatement dans l\'annuaire public du Marketplace.', helpMarketReviewRules: 'Le rejet est le seul résultat qui permet à cet e-mail de postuler à nouveau plus tard — tout autre statut verrouille sa candidature unique existante.',
    helpTenantMgmtWhat: 'Suspendre ou réactiver n\'importe quelle boutique de la plateforme.', helpTenantMgmtWhy: "Une boutique suspendue devient totalement inaccessible — ses propres clients et employés ne peuvent plus s'y connecter ni la parcourir.", helpTenantMgmtNext: 'La réactivation restaure immédiatement l\'accès complet, avec toutes les données intactes exactement comme avant.', helpTenantMgmtErrors: "Si un propriétaire de boutique conteste une suspension, consultez le journal d'audit de la plateforme pour connaître la raison de la suspension avant de réactiver.",
    helpSuperResetMfaWhat: "L'adresse e-mail du compte administrateur bloqué.", helpSuperResetMfaWhy: "Ceci supprime TOUTES les méthodes d'authentification à deux facteurs de ce compte (authentificateur, code par e-mail, et codes de secours) en une fois — il n'y a pas de réinitialisation partielle.", helpSuperResetMfaNext: 'Il peut se connecter avec seulement son mot de passe lors de la prochaine tentative, puis reconfigurer le MFA depuis zéro s\'il le souhaite.', helpSuperResetMfaRules: "Vérifiez vous-même son identité avant d'utiliser ceci — cela contourne toute la deuxième couche de protection de son compte.", helpSuperResetMfaErrors: "Si l'e-mail ne correspond à aucun compte, vérifiez les fautes de frappe — cela ne fonctionne que pour les comptes qui existent réellement.",
    helpSuperContactWhat: 'Messages soumis via le formulaire de contact public, par toute personne.', helpSuperContactWhy: "Ils ne sont liés à aucune boutique spécifique — ce sont des questions générales sur la plateforme.", helpSuperContactNext: "Cliquez sur l'adresse e-mail pour répondre directement depuis votre propre client de messagerie — il n'y a pas de fonction de réponse intégrée à l'application.",
    helpSuperOwnMfaWhat: "Votre propre configuration d'authentification à deux facteurs — application d'authentification, code par e-mail, ou codes de secours.", helpSuperOwnMfaWhy: 'Votre compte superadmin peut gérer chaque boutique de la plateforme, il a donc besoin d\'une protection plus forte qu\'un simple mot de passe.', helpSuperOwnMfaNext: 'Une fois activé, un code vous sera demandé à chaque connexion, en plus de votre mot de passe.', helpSuperOwnMfaRules: "Configurez des codes de secours dès que vous activez une méthode MFA — ce sont votre seul moyen de récupération autonome si vous perdez votre appareil d'authentification.",
    helpSuperAuditLogWhy: "Chaque action liée à la sécurité sur toutes les boutiques — connexions, changements MFA, réinitialisations de mot de passe, blocages, et actions administratives — est enregistrée ici automatiquement.", helpSuperAuditLogNext: "Utilisez ceci pour enquêter sur un incident spécifique (comme une suspension contestée) ou pour vérifier si une tentative de connexion a réellement eu lieu.",
    superadminLogin: 'Connexion superadmin', dashboardNavLink: 'Tableau de bord',
    heroEyebrow: 'Boutique numérique mondiale et plateforme de marketplace multi-boutiques',
    heroH1: 'Chaque boutique a son propre sous-domaine. Nous gérons l\'infrastructure.',
    heroP: "Hadam est la plateforme — authentification, catalogue, panier, paiement et traitement des commandes, partagés par chaque boutique. Votre boutique vit sur <strong>yourname.hadamplatform.com</strong> et commence avec un catalogue vide : vous décidez quoi vendre et comment le classer.",
    browseMarketplaceBtn: 'Parcourir le marketplace', getOwnStoreBtn: 'Créer votre boutique',
    shopPanelH3: 'Vous voulez acheter, ou gérer une boutique que vous possédez déjà ?',
    shopPanelP: `Cette page (la page d'accueil de Hadam) n'est <strong>pas</strong> l'endroit où les clients, employés, ou admins de boutique se connectent.
        Chaque boutique a sa propre adresse et sa propre connexion — allez sur <strong>yourname.hadamplatform.com</strong>
        (ou <code>yourname.localhost:3000</code> en test local) et connectez-vous là-bas.
        Le bouton "Connexion superadmin" ci-dessus est réservé au personnel de la plateforme Hadam, qui supervise l'annuaire
        des boutiques ci-dessous — il n'a aucun accès aux produits, commandes, ou clients d'aucune boutique.`,
    marketSearchPlaceholder: 'Rechercher des produits dans toutes les boutiques…', sellerStoresH3: 'Boutiques vendeuses',
    wantOwnStoreP: 'Vous voulez votre propre boutique ? Obtenez un sous-domaine comme <code>yourname.hadam.store</code>.',
    createStoreH3: 'Créez votre boutique', alreadyHaveStoreHint: "Vous avez déjà une boutique Hadam et souhaitez simplement l'ajouter au Marketplace ? N'en créez pas une nouvelle ici — connectez-vous au panneau d'administration de votre boutique existante et allez dans « Vendre sur Hadam » depuis là pour ajouter votre boutique au Marketplace directement.", subdomainLabel: 'Sous-domaine', subdomainPlaceholder: 'yourstore',
    createStoreTabBtn: 'Créer une boutique', joinMarketplaceTabBtn: 'Rejoindre Hadam Marketplace', sellModeHint: "Vous démarrez une toute nouvelle activité ? Créez une boutique. Vous gérez déjà votre activité ailleurs et souhaitez simplement une visibilité sur le Marketplace ? Rejoignez le Marketplace — aucune boutique Hadam requise. Vous avez déjà une boutique Hadam et voulez l'ajouter au Marketplace ? Utilisez « Ajouter ma boutique au Marketplace ».",
    addMarketplaceTabBtn: 'Ajouter ma boutique au Marketplace', addMarketplaceH3: 'Ajouter ma boutique existante au Marketplace', addMarketplaceIntro: "Pour les administrateurs Hadam Store qui ont déjà une boutique et souhaitent la lister sur le Marketplace — aucune nouvelle boutique ou sous-domaine n'est créé, cela s'active sur votre boutique existante.",
    addMarketplaceBtn: "Ajouter ma boutique au Marketplace", addMarketplaceSuccessMsg: 'Votre boutique a été ajoutée au Marketplace :', howAddMarketWorksH3: 'Comment ça marche',
    renewTabBtn: "Extension/Renouvellement d'adhésion", renewH3: "Extension/Renouvellement d'adhésion", renewIntro: "Prolongez ou renouvelez un abonnement Boutique ou Marketplace existant, avant ou après son expiration.",
    renewTypeLabel: 'Que renouvelez-vous ?', renewTypeStoreOpt: 'Renouvellement de l\'offre boutique Hadam', renewTypeMarketOpt: "Renouvellement de l'adhésion Marketplace Hadam",
    renewMarketPriceLabel: 'Adhésion Marketplace en vedette — 19 $/mois', renewMarketFreeHint: "Les inscriptions Marketplace gratuites n'ont pas de date d'expiration et rien à renouveler — ce formulaire de renouvellement s'applique uniquement aux adhésions en vedette.", priceLabel: 'Prix', perMonthLabel: 'mois',
    renewTypeBothOpt: 'Renouvellement du forfait Boutique + Marketplace Hadam', checkStatusBtn: "Vérifier l'état actuel", currentStatusLabel: 'État actuel', currentPlanLabel: 'Offre actuelle',
    renewBtn: 'Renouveler', renewSuccessMsg: 'Renouvellement confirmé.', howRenewWorksH3: 'Comment ça marche',
    howRenewWorksP: "1. Choisissez si vous renouvelez un abonnement Boutique Hadam ou une adhésion Marketplace.<br>2. Confirmez votre identité — vos identifiants administrateur de boutique, ou l'e-mail et le nom d'entreprise utilisés lors de votre candidature Marketplace.<br>3. Le paiement est vérifié avant tout changement — sélectionner une offre seule n'active ni ne prolonge jamais un abonnement.<br>4. Une fois le paiement confirmé, votre date d'expiration est prolongée de 30 jours, et l'accès est restauré immédiatement s'il avait expiré.",
    howAddMarketWorksP: "1. Saisissez le sous-domaine de votre boutique et vos identifiants administrateur pour cette boutique.<br>2. Confirmez le paiement pour ajouter votre boutique au Marketplace.<br>3. Votre boutique existante — même sous-domaine, même catalogue, mêmes clients — est immédiatement répertoriée dans l'annuaire partagé du Marketplace Hadam.<br><br>Aucune deuxième boutique ou sous-domaine n'est jamais créé. Si votre compte administrateur a l'authentification à deux facteurs activée, utilisez plutôt le panneau d'administration de votre boutique.",
    joinMarketplaceH3: 'Rejoindre Hadam Marketplace', joinMarketplaceIntro: "Répertoriez votre activité existante sur le Marketplace de Hadam pour gagner en visibilité — sans boutique, sous-domaine ni compte Hadam. Les achats sont entièrement gérés sur votre propre site web.",
    businessNameLabel: "Nom de l'entreprise", ownerNameLabel: 'Nom du propriétaire', phoneLabel: 'Téléphone', countryLabel: 'Pays', cityLabel: 'Ville', websiteUrlLabel: 'URL du site web',
    businessCategoryLabel: "Catégorie d'activité", businessCategoryPlaceholder: 'ex. Électronique, Mode, Articles pour la maison', businessDescriptionLabel: "Description de l'activité", logoUrlLabel: 'URL du logo (facultatif)',
    joinMarketplaceBtn: 'Rejoindre Hadam Marketplace', joinMarketplaceSuccessMsg: 'a rejoint Hadam Marketplace ! Votre entreprise est maintenant répertoriée dans l\'annuaire.',
    howJoinWorksH3: 'Comment ça marche', howJoinWorksP: "1. Soumettez les informations de votre entreprise — aucune boutique ni sous-domaine Hadam n'est créé.<br>2. Votre entreprise apparaît dans l'annuaire du Marketplace Hadam avec votre logo, votre description et un lien vers votre propre site web.<br>3. Les acheteurs qui vous trouvent via Hadam sont dirigés vers votre propre site pour finaliser leur achat — Hadam ne traite pas les paiements ni les commandes pour les membres du Marketplace uniquement.<br>4. Vous pouvez passer à une boutique Hadam complète à tout moment — vos informations d'entreprise sont conservées, et vous obtiendrez un sous-domaine, un catalogue, un panier, un paiement et toutes les autres fonctionnalités d'une boutique Hadam.",
    externalMemberBadge: 'Vendeur externe', externalMemberBadgeTooltip: 'Répertorié uniquement sur Hadam Marketplace — les achats se font sur son propre site, pas via Hadam.', visitExternalSiteLink: 'Visiter leur site',
    marketplacePlanLabel: 'Offre Marketplace', jmPlanFreeOpt: 'Inscription gratuite — entrée de base dans l\'annuaire', jmPlanFeaturedOpt: 'Inscription en vedette — 19 $/mois, placement prioritaire + promotions', featuredBadge: 'En vedette',
    addressLabel: "Adresse de l'entreprise", registrationNumberLabel: "Numéro d'immatriculation (facultatif)", vatNumberLabel: 'Numéro de TVA (facultatif)', socialLinksLabel: 'Réseaux sociaux (tous facultatifs)',
    applicationPendingMsg: 'Votre candidature pour ', applicationPendingMsg2: ' a été reçue et est en cours d\'examen. Vous recevrez un e-mail une fois approuvée.',
    addMarketplaceSuccessMsg: 'Votre boutique a été ajoutée au Marketplace :', disableBtn: 'Désactiver', disableMfaConfirm: "Désactiver l'authentification à deux facteurs ?",
    emailOtpEnableBtn: 'Activer le code par e-mail', emailOtpEnabledLabel: 'Code par e-mail activé', emailOtpSectionHint: "Pas d'application d'authentification ? Recevez un code à usage unique par e-mail à la place lors de la connexion.", emailOtpSectionTitle: 'Code de vérification par e-mail',
    invalidRecoveryLinkMsg: 'Ce lien de réinitialisation de mot de passe est invalide ou a expiré. Veuillez en demander un nouveau.', mfaEmailSendingHint: "Envoi d'un code à votre e-mail...", mfaEmailSentHint: 'Entrez le code que nous venons de vous envoyer par e-mail.',
    mfaMethodAuthenticatorApp: "Application d'authentification", mfaMethodEmail: 'Code par e-mail', mfaQrLoadErrorMsg: "L'image du code QR n'a pas pu être chargée — utilisez plutôt le code de saisie manuelle ci-dessous.",
    passwordTooShortError: 'Le mot de passe doit contenir au moins 8 caractères.', perMonthLabel: 'mois', priceLabel: 'Prix',
    recoveryMfaRequiredHint: "Ce compte a l'authentification à deux facteurs activée — entrez un code de votre application d'authentification pour terminer la réinitialisation de votre mot de passe.",
    recoveryMfaUnavailableMsg: "L'authentification à deux facteurs est requise pour réinitialiser ce mot de passe, mais aucune méthode vérifiée n'a pu être trouvée. Veuillez contacter le support.",
    renewSuccessMsg: 'Renouvellement confirmé.', requestNewLinkBtn: 'Demander un nouveau lien', resendCodeLink: 'Renvoyer le code', reviewNotePrompt: 'Note facultative (visible par le candidat) :',
    mfaMethodBackup: 'Code de secours', backupCodeLoginHint: 'Entrez un de vos codes de secours. Chacun ne fonctionne qu\'une fois.', backupCodeLabel: 'Code de secours',
    backupCodesSectionTitle: 'Codes de secours', backupCodesSectionHint: "Codes à usage unique pour accéder à votre compte si vous perdez l'accès à votre application d'authentification ou à votre e-mail.",
    backupCodesNoPrimaryWarning: "Les codes de secours sont une solution de repli, pas une méthode de connexion à part entière — activez d'abord l'application d'authentification ou le code par e-mail ci-dessus, sinon ces codes ne seront jamais demandés lors de la connexion.",
    resetMfaBtn: 'Réinitialiser MFA', resetMfaSuccess: 'Le MFA a été réinitialisé pour ce compte.', adminResetMfaTitle: 'Réinitialiser le MFA pour un compte bloqué',
    adminResetMfaHint: "Dernier recours : pour un administrateur de boutique ayant perdu à la fois son appareil d'authentification et ses codes de secours, sans solution en libre-service restante. Vérifiez vous-même son identité avant d'utiliser ceci.",
    auditLogTitle: "Journal d'audit de sécurité", auditLogHint: "Un enregistrement des événements liés à la sécurité sur toutes les boutiques — connexions, changements MFA, réinitialisations de mot de passe et actions administratives.",
    contactMessagesTitle: 'Messages du formulaire de contact', contactMessagesHint: 'Messages envoyés via le formulaire de contact public.', noContactMessages: 'Aucun message pour le moment.', dateLabel: 'Date', nameLabel: 'Nom', messageLabel: 'Message',
    auditLogEmailFilterPlaceholder: 'Filtrer par e-mail', auditLogAllEventTypes: "Tous les types d'événements", auditLogAllOutcomes: 'Tous les résultats',
    auditLogSuccess: 'Succès', auditLogFailure: 'Échec', auditLogApplyFilters: 'Appliquer les filtres', auditLogEmpty: 'Aucun événement correspondant.',
    pricingPlansTitle: 'Tarification boutique et marketplace', pricingPlansHint: 'Gérez les forfaits disponibles pour les boutiques. Un changement de prix affecte seulement les nouveaux abonnements et les abonnements futurs ; les forfaits déjà achetés conservent leur tarif original.', noPlansYet: 'Aucun forfait pour le moment -- ajoutez-en un ci-dessous.', planNameLabel: 'Nom', monthlyPriceLabel: 'Prix mensuel', yearlyPriceLabel: 'Prix annuel', commissionRateLabel: 'Taux de commission', maxProductsLabel: 'Produits max', maxStorageLabel: 'Stockage max (Mo)', staffAccountsLabel: 'Comptes du personnel', marketplaceAllowedLabel: 'Inscription au marketplace autorisée', customDomainLabel: 'Domaine personnalisé autorisé', addPlanTitle: 'Ajouter un nouveau forfait', editPlanTitle: 'Modifier le forfait', savePlanBtn: 'Enregistrer le forfait', cancelEditBtn: 'Annuler / nouveau forfait', activeLabel: 'Actif', inactiveLabel: 'Inactif', editBtn: 'Modifier', deactivateBtn: 'Désactiver', activateBtn: 'Activer', unlimited: 'Illimité', planCreatedMsg: 'Forfait créé.', planUpdatedMsg: 'Forfait mis à jour.',
    auditLogWhen: 'Quand', auditLogEvent: 'Événement', auditLogEmailCol: 'E-mail', auditLogOutcomeCol: 'Résultat', auditLogIp: 'IP', auditLogDetails: 'Détails',
    auditLogPageInfo: 'Page {page} sur {total}', auditLogPrev: 'Précédent', auditLogNext: 'Suivant',
    auditEvent_login_success: 'Connexion réussie', auditEvent_login_failure: 'Échec de connexion', auditEvent_logout: 'Déconnexion',
    auditEvent_password_reset_requested: 'Réinitialisation du mot de passe demandée', auditEvent_password_reset_completed: 'Mot de passe réinitialisé',
    auditEvent_mfa_totp_enrolled: "Application d'authentification activée", auditEvent_mfa_totp_disabled: "Application d'authentification désactivée",
    auditEvent_mfa_totp_verify_success: "Code d'authentification vérifié", auditEvent_mfa_totp_verify_failure: "Code d'authentification rejeté",
    auditEvent_mfa_email_otp_enabled: 'Code par e-mail activé', auditEvent_mfa_email_otp_disabled: 'Code par e-mail désactivé',
    auditEvent_mfa_email_otp_verify_success: 'Code par e-mail vérifié', auditEvent_mfa_email_otp_verify_failure: 'Code par e-mail rejeté',
    auditEvent_mfa_backup_codes_generated: 'Codes de secours générés', auditEvent_mfa_backup_code_used: 'Code de secours utilisé', auditEvent_mfa_backup_code_verify_failure: 'Code de secours rejeté',
    auditEvent_account_locked: 'Compte verrouillé (limite atteinte)', auditEvent_admin_mfa_reset: 'MFA réinitialisé par un administrateur', auditEvent_account_created: 'Compte créé', auditEvent_account_deleted: 'Compte supprimé',
    emailRequiredError: "L'e-mail est requis.", resetMfaConfirmGeneric: "Cela supprime toutes les méthodes MFA pour ce compte, afin qu'il puisse se connecter avec juste son mot de passe et reconfigurer le MFA. Avez-vous vérifié son identité ? Continuer ?", renewalNotNeededTierError: "Votre abonnement {tier} est encore valide pour {days} jours supplémentaires. Pour renouveler quand même ou changer d'offre, choisissez une offre différente ci-dessus, ou revenez plus près de votre date de renouvellement.", renewalNotNeededMembershipError: "Votre adhésion est encore valide pour {days} jours supplémentaires.", mfaChooseMethodHint: "Choisissez comment vous souhaitez vérifier que c'est bien vous.",
    backupCodesRemainingLabel: 'codes inutilisés restants', noBackupCodesLabel: 'Aucun code de secours généré pour le moment.', regenerateBackupCodesBtn: 'Régénérer les codes', generateBackupCodesBtn: 'Générer des codes de secours',
    regenerateBackupCodesConfirm: 'Cela invalidera tous les codes de secours existants. Continuer ?', yourBackupCodesTitle: 'Vos codes de secours',
    backupCodesWarning: "Conservez-les en lieu sûr — chaque code ne fonctionne qu'une fois, et ils ne seront affichés qu'une seule fois.", downloadCodesBtn: 'Télécharger en fichier texte', doneBtn: 'Terminé',
    lostDeviceUseBackupLink: "Vous avez perdu votre authentificateur ? Utilisez un code de secours", recoveryBackupCodeHint: 'Entrez un de vos codes de secours, ainsi que votre nouveau mot de passe.',
    marketplaceApplicationsTitle: 'Candidatures Marketplace', noApplicationsYet: 'Aucune candidature pour le moment.',
    approveBtn: 'Approuver', suspendBtn: 'Suspendre', reactivateBtn: 'Réactiver', requestMoreInfoBtn: "Demander plus d'infos", rejectBtn: 'Rejeter', reviewNotePrompt: 'Note facultative (visible par le candidat) :',
    storeNameLabel: 'Nom de la boutique', storeNamePlaceholder: 'Votre Boutique SARL', whatDoYouWantLabel: 'Que voulez-vous ?',
    planStoreOption: "Juste une boutique — vendez n'importe quoi, sur votre propre sous-domaine, non listée sur le Marketplace Hadam",
    planMarketplaceOnlyOption: "Marketplace uniquement — votre propre boutique et sous-domaine, listée sur le Marketplace Hadam",
    planMarketOption: 'Être listé sur le Marketplace Hadam — atteignez des acheteurs qui parcourent toutes les boutiques',
    planBothOption: 'Les deux — votre propre boutique, et listée sur le Marketplace Hadam',
    planHint: "Cela ne limite pas ce que vous pouvez vendre — chaque offre peut proposer des produits physiques, des téléchargements numériques, ou des services réservables. Cela détermine seulement si votre boutique apparaît aussi dans l'annuaire partagé Marketplace & Boutiques de Hadam, aux côtés de chaque autre boutique.",
    planHintNoMarketOnly: 'Vous voulez uniquement une visibilité Marketplace, sans boutique ni sous-domaine Hadam ? Utilisez plutôt « Rejoindre Hadam Marketplace » ci-dessus — ce formulaire est destiné à ceux qui veulent leur propre boutique.',
    tierLabelForm: "Offre d'abonnement", tierHintForm: 'Vous pouvez changer ceci à tout moment depuis Admin → Paramètres de la boutique.',
    cardNumber: 'Numéro de carte', expiry: "Date d'expiration", cvv: 'CVV', cardholderNameLabel: 'Nom du titulaire de la carte',
    cardNumberRequiredError: 'Un numéro de carte valide est requis.', cardExpiryFormatError: "La date d'expiration de la carte doit être au format MM/AA.", cardCvvRequiredError: 'Le code de sécurité de la carte (CVV/CVC) est requis.', cardCvvDigitsError: 'Le code de sécurité de la carte (CVV/CVC) ne doit contenir que des chiffres.', cardCvvLengthError: 'Le code de sécurité de la carte (CVV/CVC) doit comporter exactement 3 chiffres.', cardholderNameRequiredError: 'Le nom du titulaire de la carte est requis.',
    notNearExpirySubHint: "Cet abonnement est encore valide et n'est pas proche de son expiration. Pour choisir une offre différente à la place, sélectionnez-la ci-dessous.", notNearExpiryMemberHint: "Cette adhésion est encore valide et n'est pas proche de son expiration.",
    signupPaymentHint: 'Paiement simulé. Utilisez 4111 1111 1111 1111 pour réussir ou 0000 0000 0000 0000 pour voir un refus.',
    yourNameLabel: 'Votre nom', email: 'E-mail', password: 'Mot de passe', passwordPlaceholder: 'Au moins 6 caractères',
    createStoreBtn: 'Créer la boutique', howItWorksH3: 'Comment ça marche',
    howItWorksP: `1. Choisissez un sous-domaine et si vous voulez aussi apparaître sur le Marketplace.<br>
          2. Vous devenez l'Admin de la boutique — ajoutez vos propres catégories et produits.<br>
          3. Invitez des Employés (ou des Admins supplémentaires) pour aider au traitement des commandes et réservations.<br>
          4. Les clients s'inscrivent sur votre sous-domaine et achètent uniquement dans votre catalogue.<br><br>
          Les données de chaque boutique — utilisateurs, catalogue, commandes — sont entièrement isolées de toute autre boutique.`,
    contactMessageLabel: 'Message', contactMessagePlaceholder: 'Question sur une boutique, une annonce, ou la plateforme elle-même…',
    send: 'Envoyer', contactHint: "Pour une commande, un retour, ou toute question sur les produits d'une boutique précise — contactez cette boutique directement depuis son propre site ; ce formulaire arrive à l'équipe de la plateforme Hadam.",
    footerText: `Hadam Marketplace — la boutique numérique mondiale et la plateforme de marketplace multi-boutiques. © ${new Date().getFullYear()} Hadam Marketplace. Tous droits réservés.`,
    superadminOnlyHint: "Ceci est réservé au personnel de la plateforme Hadam — pas aux propriétaires de boutique, employés, ou clients. Ceux-ci se connectent depuis le sous-domaine de leur propre boutique.",
    forgotPasswordLink: 'Mot de passe oublié ?', superForgotPasswordHint: "Entrez l'e-mail de votre compte superadmin et nous vous enverrons un lien de réinitialisation.", sendResetLinkBtn: 'Envoyer le lien de réinitialisation', resetLinkSentMsg: 'Si cet e-mail est enregistré, un lien de réinitialisation a été envoyé — vérifiez votre boîte de réception.',
    setNewPasswordTitle: 'Définir un nouveau mot de passe', newPasswordLabel: 'Nouveau mot de passe', confirmNewPasswordLabel: 'Confirmer le nouveau mot de passe', setNewPasswordBtn: 'Définir le nouveau mot de passe',
    passwordsDontMatch: 'Les mots de passe ne correspondent pas.', passwordResetSuccess: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.', passwordTooShortError: 'Le mot de passe doit contenir au moins 8 caractères.', passwordSameAsCurrentError: "C'est votre mot de passe actuel — veuillez en choisir un différent.",
    myAccountSecurityTitle: 'Sécurité de mon compte', mfaEnabledStatusMsg: "L'authentification à deux facteurs est activée sur ce compte.", mfaNotEnabledStatusMsg: "L'authentification à deux facteurs n'est pas activée sur ce compte.",
    disableMfaBtn: "Désactiver l'authentification à deux facteurs", enableMfaBtn: "Activer l'authentification à deux facteurs", mfaScanHint: "Scannez ce code QR avec une application d'authentification (Google Authenticator, Authy, etc.)",
    mfaManualEntryLabel: 'Ou entrez ce code manuellement', mfaCodeLabel: 'Code à 6 chiffres', verifyBtn: 'Vérifier', mfaEnabledSuccessMsg: "L'authentification à deux facteurs est maintenant activée.", disableMfaConfirm: "Désactiver l'authentification à deux facteurs ?",
    mfaPromptTitle: 'Authentification à deux facteurs', mfaPromptHint: "Entrez le code à 6 chiffres de votre application d'authentification.",
    logIn: 'Connexion', logout: 'Déconnexion', logInAsSuperadmin: 'Connectez-vous en tant que superadmin pour voir les boutiques.',
    platformSecurityAccessTitle: "Sécurité et accès de la plateforme", platformSecurityAccessHint: "Ces paramètres s'appliquent à toutes les boutiques sur Hadam, puisqu'elles partagent toutes un même projet d'authentification.",
    smSettingEmailConfirm: "Confirmation d'e-mail requise à l'inscription", smSettingPasswordRules: 'Règles de complexité des mots de passe', smSettingRedirectUrls: 'URL de redirection autorisées', smSettingMfaProviders: "Méthodes d'authentification à deux facteurs disponibles",
    smSettingRateLimits: 'Limites de débit connexion/API', smSettingPerStoreAccess: 'Politique d\'inscription et de 2FA par boutique', smManagedInSupabase: 'Géré dans Supabase', smManagedInApp: 'Géré ici',
    openSupabaseAuthSettings: "Ouvrir les paramètres d'authentification Supabase",
    allTenants: 'Toutes les boutiques', store: 'Boutique', plan: 'Offre', revenue: 'Revenus', products: 'Produits', orders: 'Commandes',
    users: 'Utilisateurs', status: 'Statut', suspend: 'Suspendre', activate: 'Activer',
    noProductsMatch: 'Aucun produit ne correspond pour le moment.', noStoresYet: 'Aucune boutique pour le moment — soyez la première.', noTagline: 'Pas encore de description.',
    storeReady: 'est prête', storeAddressLabel: 'Adresse de votre boutique :', localTestingNote: 'Note pour le test local : sans DNS réel, utilisez',
    contactSent: 'Envoyé — merci, nous vous répondrons bientôt.', yourStorePreview: 'Votre boutique', productSingular: 'produit', productPlural: 'produits',
  },
};
function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
/** Formats a date/time using the APP's own selected language, not the browser's default locale — a bare .toLocaleString() ignores state.lang entirely. */
function localeDate(date, opts) { return date.toLocaleString(state.lang === 'ar' ? 'ar' : state.lang === 'fr' ? 'fr' : 'en', opts); }
function localized(obj, field) {
  if (!obj) return '';
  const t = obj.translations && obj.translations[state.lang];
  if (t && t[field]) return t[field];
  return obj[field] || '';
}
function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-placeholder')); });
}
function setLang(lang) {
  setCookie('hadam_lang', lang);
  localStorage.setItem('hadam_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  location.reload();
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Lang': state.lang || 'en' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}

async function downloadTechnicalManual() {
  const msg = document.getElementById('techManualMsg');
  if (msg) msg.textContent = '';
  try {
    const res = await fetch('/api/platform/technical-manual', { headers: { Authorization: 'Bearer ' + state.token } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Download failed.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Hadam-Technical-Manual.docx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { if (msg) msg.textContent = e.message; else alert(e.message); }
}
function go(view, helpSectionId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('#mainNav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  window.scrollTo({ top: 0 });
  if (view === 'super') renderSuper();
  if (view === 'marketplace') renderMarketplace();
  if (view === 'help') renderHelpPage(helpSectionId);
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
/**
 * Renders a small "?" icon that toggles a contextual help popover on click.
 * Structured around six things a person needs at any important step:
 * what to enter/select, why it's needed, what happens after they continue,
 * validation/requirements, what to do if something goes wrong, and a link
 * to the fuller manuals for anything not covered here. Content is passed
 * as i18n keys so it localizes automatically; pass null/omit any section
 * that doesn't apply to a given field.
 */
function helpIcon(id, keys) {
  const { what, why, next, rules, errors, section } = keys;
  const targetSection = section || 'getting-started';
  const row = (label, val) => val ? `<dt>${label}</dt><dd>${t(val)}</dd>` : '';
  return `<span class="help-wrap" id="help-wrap-${id}"><span class="help-icon" tabindex="0" role="button" aria-label="${t('helpIconAriaLabel') || 'Help'}" onclick="toggleHelp('${id}')" onkeydown="if(event.key==='Enter'||event.key===' ')toggleHelp('${id}')">?</span>
    <dl class="help-popover" id="help-${id}">
      ${row(t('helpWhatLabel') || 'What to enter', what)}
      ${row(t('helpWhyLabel') || "Why it's needed", why)}
      ${row(t('helpNextLabel') || 'What happens next', next)}
      ${row(t('helpRulesLabel') || 'Requirements', rules)}
      ${row(t('helpErrorsLabel') || 'If something goes wrong', errors)}
      <dt>${t('helpMoreLabel') || 'Need more help?'}</dt><dd>${t('helpMoreText') || 'See the'} <a href="#" onclick="closeAllHelp();go('help','${targetSection}');return false;" style="color:var(--accent);">${t('helpNavLabel') || 'Help'}</a> ${t('helpMoreTextEnd') || 'page for more detail.'}</dd>
    </dl></span>`;
}
function toggleHelp(id) {
  const el = document.getElementById('help-' + id);
  document.querySelectorAll('.help-popover.open').forEach(p => { if (p !== el) p.classList.remove('open'); });
  el.classList.toggle('open');
}
function closeAllHelp() { document.querySelectorAll('.help-popover.open').forEach(p => p.classList.remove('open')); }
document.addEventListener('click', e => {
  if (!e.target.closest('.help-icon') && !e.target.closest('.help-popover')) closeAllHelp();
});
/** Injects a help icon right after a given input's <label>. Safe to call
 * repeatedly (checks for an existing icon first) since applyStaticTranslations
 * and language switches can re-run this. */
function attachHelp(inputId, keys) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const label = input.closest('.field') ? input.closest('.field').querySelector('label') : input.previousElementSibling;
  if (!label || label.tagName !== 'LABEL') return;
  const existing = label.parentElement.querySelector(`#help-wrap-${inputId}`);
  if (existing) existing.remove();
  label.insertAdjacentHTML('afterend', helpIcon(inputId, keys));
}
function injectAllHelpIcons() {
  attachHelp('cSub', { what: 'helpSubWhat', why: 'helpSubWhy', next: 'helpSubNext', rules: 'helpSubRules', section: 'creating-store' });
  attachHelp('cPlan', { what: 'helpPlanWhat', why: 'helpPlanWhy', next: 'helpPlanNext', section: 'creating-store' });
  attachHelp('cTier', { what: 'helpTierWhat', why: 'helpTierWhy', next: 'helpTierNext', rules: 'helpTierRules', section: 'subscriptions' });
  attachHelp('cCardNum', { what: 'helpCardWhat', why: 'helpCardWhy', next: 'helpCardNext', rules: 'helpCardRules', errors: 'helpCardErrors', section: 'subscriptions' });
  attachHelp('cAdminPass', { what: 'helpPassWhat', rules: 'helpPassRules', section: 'account-security' });
  attachHelp('rnTier', { what: 'helpRenewTierWhat', why: 'helpRenewTierWhy', next: 'helpRenewTierNext', section: 'subscriptions' });
  attachHelp('amCardNum', { what: 'helpCardWhat', why: 'helpAddMarketCardWhy', next: 'helpCardNext', rules: 'helpCardRules', errors: 'helpCardErrors', section: 'marketplace' });
}
/**
 * The in-app Help viewer's content — organized, navigable sections
 * replacing the old downloadable User Guide docx. Each section is tagged
 * with which kind of user it's most relevant to, purely for the
 * self-service filter chips below (not a security boundary — none of
 * this content is sensitive, unlike the Technical Manual).
 */
const HELP_SECTIONS = [
  { id: 'getting-started', roles: ['shopper', 'store-owner', 'marketplace'], titleKey: 'helpSecGettingStartedTitle', bodyKey: 'helpSecGettingStartedBody' },
  { id: 'buying', roles: ['shopper'], titleKey: 'helpSecBuyingTitle', bodyKey: 'helpSecBuyingBody' },
  { id: 'orders-tracking', roles: ['shopper'], titleKey: 'helpSecOrdersTitle', bodyKey: 'helpSecOrdersBody' },
  { id: 'refunds', roles: ['shopper', 'store-owner'], titleKey: 'helpSecRefundsTitle', bodyKey: 'helpSecRefundsBody' },
  { id: 'creating-store', roles: ['store-owner'], titleKey: 'helpSecCreatingStoreTitle', bodyKey: 'helpSecCreatingStoreBody' },
  { id: 'managing-store', roles: ['store-owner'], titleKey: 'helpSecManagingStoreTitle', bodyKey: 'helpSecManagingStoreBody' },
  { id: 'subscriptions', roles: ['store-owner'], titleKey: 'helpSecSubscriptionsTitle', bodyKey: 'helpSecSubscriptionsBody' },
  { id: 'marketplace', roles: ['marketplace', 'store-owner'], titleKey: 'helpSecMarketplaceTitle', bodyKey: 'helpSecMarketplaceBody' },
  { id: 'account-security', roles: ['shopper', 'store-owner', 'marketplace'], titleKey: 'helpSecAccountSecurityTitle', bodyKey: 'helpSecAccountSecurityBody' },
  { id: 'contact-support', roles: ['shopper', 'store-owner', 'marketplace'], titleKey: 'helpSecContactTitle', bodyKey: 'helpSecContactBody' },
];
let helpActiveRole = 'all';
let helpSearchQuery = '';
function renderHelpPage(expandSectionId) {
  const container = document.getElementById('helpPageContent');
  if (!container) return;
  const roleLabels = { all: t('helpRoleAll') || 'Everyone', shopper: t('helpRoleShopper') || 'Shoppers', 'store-owner': t('helpRoleStoreOwner') || 'Store Owners', marketplace: t('helpRoleMarketplace') || 'Marketplace Members' };
  container.innerHTML = `
    <input class="help-search" id="helpSearchInput" type="search" placeholder="${t('helpSearchPlaceholder') || 'Search help topics...'}" value="${esc(helpSearchQuery)}">
    <div class="help-role-chips">
      ${Object.keys(roleLabels).map(r => `<button class="help-role-chip ${helpActiveRole === r ? 'active' : ''}" onclick="setHelpRole('${r}')">${roleLabels[r]}</button>`).join('')}
    </div>
    <div id="helpSectionsList"></div>`;
  document.getElementById('helpSearchInput').addEventListener('input', e => { helpSearchQuery = e.target.value; renderHelpSectionsList(); });
  renderHelpSectionsList(expandSectionId);
}
function setHelpRole(role) { helpActiveRole = role; renderHelpSectionsList(); }
function renderHelpSectionsList(expandSectionId) {
  const listEl = document.getElementById('helpSectionsList');
  if (!listEl) return;
  const query = helpSearchQuery.trim().toLowerCase();
  const visible = HELP_SECTIONS.filter(s => {
    if (helpActiveRole !== 'all' && !s.roles.includes(helpActiveRole)) return false;
    if (!query) return true;
    const title = (t(s.titleKey) || '').toLowerCase();
    const body = (t(s.bodyKey) || '').toLowerCase();
    return title.includes(query) || body.includes(query);
  });
  if (visible.length === 0) {
    listEl.innerHTML = `<div class="help-no-results">${t('helpNoResults') || 'No help topics match your search.'}</div>`;
    return;
  }
  listEl.innerHTML = visible.map(s => `
    <div class="help-section">
      <div class="help-section-header" onclick="toggleHelpSection('${s.id}')">
        <strong>${t(s.titleKey)}</strong>
        <span id="chev-${s.id}">${expandSectionId === s.id ? '▲' : '▼'}</span>
      </div>
      <div class="help-section-body ${expandSectionId === s.id ? 'open' : ''}" id="body-${s.id}">${t(s.bodyKey)}</div>
    </div>`).join('');
  if (expandSectionId) {
    const el = document.getElementById('body-' + expandSectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function toggleHelpSection(id) {
  const body = document.getElementById('body-' + id);
  const chev = document.getElementById('chev-' + id);
  const opening = !body.classList.contains('open');
  body.classList.toggle('open', opening);
  chev.textContent = opening ? '▲' : '▼';
}
function openModal(id) { document.getElementById(id).classList.add('active'); }

document.getElementById('cSub').addEventListener('input', e => {
  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  document.getElementById('subPreview').textContent = v ? `${t('yourStorePreview')}: ${v}.${state.baseDomain}` : '';
});

const CATEGORY_LABELS = {
  en: { All: 'All', Design: 'Design', Education: 'Education', Stationery: 'Stationery', Electronics: 'Electronics', Books: 'Books', 'Food & Drink': 'Food & Drink', Software: 'Software', Accessories: 'Accessories', Other: 'Other' },
  ar: { All: 'الكل', Design: 'تصميم', Education: 'تعليم', Stationery: 'قرطاسية', Electronics: 'إلكترونيات', Books: 'كتب', 'Food & Drink': 'طعام وشراب', Software: 'برمجيات', Accessories: 'إكسسوارات', Other: 'أخرى' },
  fr: { All: 'Tout', Design: 'Design', Education: 'Éducation', Stationery: 'Papeterie', Electronics: 'Électronique', Books: 'Livres', 'Food & Drink': 'Alimentation', Software: 'Logiciels', Accessories: 'Accessoires', Other: 'Autre' },
};
function catLabel(c) { return (CATEGORY_LABELS[state.lang] && CATEGORY_LABELS[state.lang][c]) || c; }
function siblingHostSuffix() {
  const parts = window.location.host.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0];
}
// Real bug fix: the function above assumes it's always running on a tenant
// subdomain (e.g. sport-store.hadamplatform.com), where stripping the first
// label correctly yields "hadamplatform.com". On the PLATFORM's own root
// pages (hadamplatform.com itself -- exactly where the Marketplace directory
// lives), that same assumption breaks: it strips "hadamplatform" instead,
// leaving just "com", so every store link in the directory pointed at
// "<subdomain>.com" instead of the real "<subdomain>.hadamplatform.com".
// storeLinkUrl now uses state.baseDomain (fetched from the server's own
// /api/platform/directory and /api/platform/tenants responses, correctly
// initialized to 'hadamplatform.com') instead, which is correct regardless
// of which page happens to be calling it.
function storeLinkUrl(subdomain) { return `${window.location.protocol}//${subdomain}.${state.baseDomain}?lang=${state.lang}`; }
const PLAN_LABELS = {
  en: { store: 'Store', marketplace: 'Marketplace', both: 'Store + Marketplace' },
  ar: { store: 'متجر', marketplace: 'سوق', both: 'متجر + سوق' },
  fr: { store: 'Boutique', marketplace: 'Marketplace', both: 'Boutique + Marketplace' },
};
function planLabel(p) { return (PLAN_LABELS[state.lang] && PLAN_LABELS[state.lang][p]) || p; }

/* ---------------- marketplace & stores (unified browse) ---------------- */
function setMarketCategory(c) { state.marketCategory = c; renderMarketplace(); }
function onMarketSearch(v) { state.marketSearch = v; renderMarketplace(); }
async function renderMarketplace() {
  document.getElementById('marketCatFilters').innerHTML = ['All', ...PLATFORM_CATEGORIES].map(c =>
    `<button class="chip ${state.marketCategory === c ? 'active' : ''}" onclick="setMarketCategory('${c}')">${catLabel(c)}</button>`).join('');

  const qs = new URLSearchParams();
  if (state.marketCategory !== 'All') qs.set('category', state.marketCategory);
  if (state.marketSearch) qs.set('q', state.marketSearch);
  const { products } = await api(`/api/platform/marketplace/products?${qs.toString()}`);
  const grid = document.getElementById('marketGrid');
  grid.innerHTML = products.length === 0 ? `<div class="empty" style="grid-column:1/-1">${t('noProductsMatch')}</div>` :
    products.map(p => `
      <div class="card">
        <div class="card-thumb"><span class="tag">${catLabel(p.category.platformCategory)}</span>${p.category.fulfillment === 'shipping' ? '📦' : p.category.fulfillment === 'download' ? '📄' : p.category.fulfillment === 'booking' ? '🗓️' : '🛠️'}</div>
        <div class="card-body">
          <h3>${esc(localized(p,'name'))}</h3><p>${esc(localized(p,'description'))}</p>
          <div class="card-foot"><span class="price">$${p.price.toFixed(2)}</span>
            <a href="${storeLinkUrl(p.storeSubdomain)}" target="_blank" style="font-size:11.5px;color:var(--accent);">${esc((p.storeTranslations && p.storeTranslations[state.lang] && p.storeTranslations[state.lang].name) || p.storeName)} ${state.lang === 'ar' ? '←' : '→'}</a></div>
        </div>
      </div>`).join('');

  const { stores, externalMembers, baseDomain } = await api('/api/platform/directory');
  if (baseDomain) state.baseDomain = baseDomain;
  const storeCards = stores.map(s => `
      <div class="store-card">
        <h4>${esc(localized(s,'name'))} <span class="role-badge">${planLabel(s.plan)}</span></h4>
        <p class="tagline">${esc(localized(s,'tagline') || t('noTagline'))} · ${s.productCount} ${s.productCount === 1 ? t('productSingular') : t('productPlural')}</p>
        <a href="${storeLinkUrl(s.subdomain)}" target="_blank" style="font-family:var(--font-mono);color:var(--accent);font-size:13px;">${s.subdomain}.${state.baseDomain}</a>
      </div>`).join('');
  const externalCards = (externalMembers || []).map(m => `
      <div class="store-card">
        <h4>${esc(m.businessName)} <span class="role-badge" style="background:var(--surface-2,#232735);color:var(--text-dim);" title="${t('externalMemberBadgeTooltip')}">${t('externalMemberBadge')}</span>${m.plan === 'featured' ? ` <span class="role-badge" style="background:var(--accent,#f5a623);color:#14121f;">★ ${t('featuredBadge')}</span>` : ''}</h4>
        <p class="tagline">${esc(m.description || t('noTagline'))}</p>
        <a href="${esc(m.websiteUrl)}" target="_blank" rel="noopener" style="font-size:13px;color:var(--accent);">${t('visitExternalSiteLink')} ${state.lang === 'ar' ? '←' : '→'}</a>
      </div>`).join('');
  document.getElementById('storesList').innerHTML = (stores.length === 0 && (!externalMembers || externalMembers.length === 0)) ? `<div class="empty">${t('noStoresYet')}</div>` : storeCards + externalCards;
}

/* ---------------- sell on hadam ---------------- */
function switchSellMode(mode) {
  document.getElementById('createStorePanel').style.display = mode === 'store' ? 'grid' : 'none';
  document.getElementById('joinMarketplacePanel').style.display = mode === 'marketplace' ? 'grid' : 'none';
  document.getElementById('addMarketPanel').style.display = mode === 'addmarket' ? 'grid' : 'none';
  document.getElementById('renewPanel').style.display = mode === 'renew' ? 'grid' : 'none';
  document.getElementById('sellModeStoreBtn').className = mode === 'store' ? 'btn' : 'btn secondary';
  document.getElementById('sellModeMarketplaceBtn').className = mode === 'marketplace' ? 'btn' : 'btn secondary';
  document.getElementById('sellModeAddMarketBtn').className = mode === 'addmarket' ? 'btn' : 'btn secondary';
  document.getElementById('sellModeRenewBtn').className = mode === 'renew' ? 'btn' : 'btn secondary';
  if (mode === 'renew') updateRenewPrice();
}
function switchRenewType(type) {
  document.getElementById('renewStoreFields').style.display = (type === 'store' || type === 'both') ? 'block' : 'none';
  document.getElementById('renewMarketFields').style.display = type === 'marketplace' ? 'block' : 'none';
  if (type === 'store' || type === 'both') updateRenewPrice();
}
function updateRenewPrice() {
  const prices = { professional: 29, enterprise: 99 };
  const tier = document.getElementById('rnTier').value;
  document.getElementById('renewStorePrice').textContent = `${t('priceLabel') || 'Price'}: $${prices[tier]}/${t('perMonthLabel') || 'month'}`;
}
/** Client-side mirror of the backend's validateFullCard — gives immediate
 * feedback without a round-trip; the backend check remains authoritative. */
function cardValidationError(card) {
  const digits = ((card && card.number) || '').replace(/\s/g, '');
  if (digits.length < 12) return t('cardNumberRequiredError') || 'A valid card number is required.';
  const expiry = ((card && card.expiry) || '').trim();
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry)) return t('cardExpiryFormatError') || 'Card expiry must be in MM/YY format.';
  const cvv = ((card && card.cvv) || '').trim();
  if (!cvv) return t('cardCvvRequiredError') || 'Card security code (CVV/CVC) is required.';
  if (!/^\d+$/.test(cvv)) return t('cardCvvDigitsError') || 'Card security code (CVV/CVC) must contain only digits.';
  if (cvv.length !== 3) return t('cardCvvLengthError') || 'Card security code (CVV/CVC) must be exactly 3 digits.';
  if (!((card && card.holderName) || '').trim()) return t('cardholderNameRequiredError') || 'Cardholder name is required.';
  return null;
}
/** Same as public/app.js's version — wires live input filtering and
 * per-field inline feedback onto a card form, keyed by ID prefix. */
function wireCardFieldValidation(idPrefix) {
  const numEl = document.getElementById(idPrefix + 'CardNum');
  const expEl = document.getElementById(idPrefix + 'CardExp');
  const cvvEl = document.getElementById(idPrefix + 'CardCvv');
  const nameEl = document.getElementById(idPrefix + 'CardName');
  // Guards against attaching duplicate listeners if this is called more
  // than once for the same fields (e.g. toggling a tier dropdown back and
  // forth) — each field is only wired the first time it's actually seen.
  const alreadyWired = numEl && numEl.dataset.cardValidationWired === 'true';
  if (alreadyWired) return;
  [numEl, expEl, cvvEl, nameEl].forEach(el => { if (el) el.dataset.cardValidationWired = 'true'; });
  function errEl(input) {
    let el = input.nextElementSibling;
    if (!el || !el.classList || !el.classList.contains('field-error')) {
      el = document.createElement('div');
      el.className = 'field-error';
      el.style.cssText = 'color:var(--danger,#e57373);font-size:12px;margin-top:3px;';
      input.insertAdjacentElement('afterend', el);
    }
    return el;
  }
  function setError(input, message) { errEl(input).textContent = message || ''; }
  if (numEl) {
    numEl.addEventListener('input', () => {
      const cleaned = numEl.value.replace(/[^\d\s]/g, '');
      if (cleaned !== numEl.value) numEl.value = cleaned;
      const digits = cleaned.replace(/\s/g, '');
      setError(numEl, digits.length > 0 && digits.length < 12 ? (t('cardNumberRequiredError') || 'A valid card number is required.') : '');
    });
  }
  if (expEl) {
    expEl.addEventListener('input', () => {
      const cleaned = expEl.value.replace(/[^\d/]/g, '');
      if (cleaned !== expEl.value) expEl.value = cleaned;
      setError(expEl, cleaned.length > 0 && !/^\d{2}\s*\/\s*\d{2}$/.test(cleaned) ? (t('cardExpiryFormatError') || 'Card expiry must be in MM/YY format.') : '');
    });
  }
  if (cvvEl) {
    cvvEl.addEventListener('input', () => {
      const cleaned = cvvEl.value.replace(/\D/g, '').slice(0, 3);
      if (cleaned !== cvvEl.value) cvvEl.value = cleaned;
      setError(cvvEl, cleaned.length > 0 && cleaned.length < 3 ? (t('cardCvvLengthError') || 'Card security code (CVV/CVC) must be exactly 3 digits.') : '');
    });
    cvvEl.setAttribute('maxlength', '3');
    cvvEl.setAttribute('inputmode', 'numeric');
  }
  if (nameEl) {
    nameEl.addEventListener('blur', () => {
      setError(nameEl, nameEl.value.trim() ? '' : (t('cardholderNameRequiredError') || 'Cardholder name is required.'));
    });
  }
}
// Tracks the last status check so submitRenewal() can decide whether this
// renewal is actually needed, or whether it's an explicit plan change.
let lastRenewStatusCheck = null;
async function checkRenewStatus() {
  const type = document.getElementById('renewType').value;
  if (type === 'store' || type === 'both') {
    const el = document.getElementById('renewStoreStatus');
    el.innerHTML = t('loading');
    try {
      const data = await api('/api/platform/store-subscription-status', { method: 'POST', body: JSON.stringify({
        subdomain: document.getElementById('rnSub').value, adminEmail: document.getElementById('rnEmail').value, adminPassword: document.getElementById('rnPassword').value,
      }) });
      lastRenewStatusCheck = { kind: 'store', ...data };
      const nearExpiry = data.status === 'expired' || (data.daysUntilExpiry !== null && data.daysUntilExpiry <= 7);
      el.innerHTML = `<div class="hint">${t('currentStatusLabel')}: <strong style="color:var(--text)">${data.status}</strong> · ${t('currentPlanLabel')}: <strong style="color:var(--text)">${data.subscriptionTier}</strong>${data.subscriptionExpiresAt ? ` · ${t('subExpiresOnLabel')} <strong style="color:var(--text)">${localeDate(new Date(data.subscriptionExpiresAt), { dateStyle: "medium" })}</strong>` : ''}</div>
        ${!nearExpiry ? `<div class="hint" style="margin-top:6px;">${(t('notNearExpirySubHint') || 'This subscription is still valid and not close to expiring. To pick a different tier instead, select it below.')}</div>` : ''}`;
    } catch (e) { lastRenewStatusCheck = null; el.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
  } else {
    const el = document.getElementById('renewMarketStatus');
    el.innerHTML = t('loading');
    try {
      const data = await api('/api/platform/marketplace-members/status-by-email', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('rnMarketEmail').value, businessName: document.getElementById('rnBusinessName').value,
      }) });
      lastRenewStatusCheck = { kind: 'marketplace', ...data };
      const nearExpiry = data.status === 'expired' || (data.daysUntilExpiry !== null && data.daysUntilExpiry <= 7);
      el.innerHTML = `<div class="hint">${t('currentStatusLabel')}: <strong style="color:var(--text)">${data.status}</strong> · ${t('currentPlanLabel')}: <strong style="color:var(--text)">${data.plan}</strong>${data.subscriptionExpiresAt ? ` · ${t('subExpiresOnLabel')} <strong style="color:var(--text)">${localeDate(new Date(data.subscriptionExpiresAt), { dateStyle: "medium" })}</strong>` : ''}</div>
        ${!nearExpiry && data.plan === 'featured' ? `<div class="hint" style="margin-top:6px;">${t('notNearExpiryMemberHint') || 'This membership is still valid and not close to expiring.'}</div>` : ''}`;
    } catch (e) { lastRenewStatusCheck = null; el.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
  }
}
async function submitRenewal() {
  const msg = document.getElementById('renewMsg');
  const type = document.getElementById('renewType').value;
  const card = {
    number: document.getElementById('rnCardNum').value, expiry: document.getElementById('rnCardExp').value,
    cvv: document.getElementById('rnCardCvv').value, holderName: document.getElementById('rnCardName').value,
  };
  const cardError = cardValidationError(card);
  if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  try {
    if (type === 'store' || type === 'both') {
      const selectedTier = document.getElementById('rnTier').value;
      // A renewal is only blocked as "unnecessary" when it's a like-for-like
      // extension of the SAME tier while still far from expiry — picking a
      // different tier is always an explicit, intentional plan change and
      // is never blocked by this check.
      if (lastRenewStatusCheck && lastRenewStatusCheck.kind === 'store' && lastRenewStatusCheck.status !== 'expired'
        && lastRenewStatusCheck.daysUntilExpiry !== null && lastRenewStatusCheck.daysUntilExpiry > 7
        && lastRenewStatusCheck.subscriptionTier === selectedTier) {
        msg.innerHTML = `<div class="msg error">${(t('renewalNotNeededTierError') || 'Your {tier} subscription is still valid for {days} more days. To renew anyway or change plans, pick a different tier above, or check back closer to your renewal date.').replace('{tier}', selectedTier).replace('{days}', lastRenewStatusCheck.daysUntilExpiry)}</div>`;
        return;
      }
      await api('/api/platform/renew-store-subscription', { method: 'POST', body: JSON.stringify({
        subdomain: document.getElementById('rnSub').value, adminEmail: document.getElementById('rnEmail').value, adminPassword: document.getElementById('rnPassword').value,
        tier: selectedTier, includeMarketplace: type === 'both', card,
      }) });
      msg.innerHTML = `<div class="msg success">${t('renewSuccessMsg') || 'Renewal confirmed.'}</div>`;
    } else {
      if (lastRenewStatusCheck && lastRenewStatusCheck.kind === 'marketplace' && lastRenewStatusCheck.status !== 'expired'
        && lastRenewStatusCheck.daysUntilExpiry !== null && lastRenewStatusCheck.daysUntilExpiry > 7) {
        msg.innerHTML = `<div class="msg error">${(t('renewalNotNeededMembershipError') || 'Your membership is still valid for {days} more days.').replace('{days}', lastRenewStatusCheck.daysUntilExpiry)}</div>`;
        return;
      }
      const data = await api('/api/platform/marketplace-members/renew-by-email', { method: 'POST', body: JSON.stringify({
        email: document.getElementById('rnMarketEmail').value, businessName: document.getElementById('rnBusinessName').value, card,
      }) });
      msg.innerHTML = `<div class="msg success">${esc(data.member.businessName)} ${t('renewSuccessMsg') || 'has been renewed.'}</div>`;
    }
    lastRenewStatusCheck = null;
    ['rnSub','rnEmail','rnPassword','rnBusinessName','rnMarketEmail','rnCardNum','rnCardExp','rnCardCvv','rnCardName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function addMarketplaceToStore() {
  const msg = document.getElementById('addMarketMsg');
  const card = {
    number: document.getElementById('amCardNum').value, expiry: document.getElementById('amCardExp').value,
    cvv: document.getElementById('amCardCvv').value, holderName: document.getElementById('amCardName').value,
  };
  const cardError = cardValidationError(card);
  if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  try {
    const data = await api('/api/platform/add-marketplace-to-store', {
      method: 'POST',
      body: JSON.stringify({
        subdomain: document.getElementById('amSub').value,
        adminEmail: document.getElementById('amEmail').value,
        adminPassword: document.getElementById('amPassword').value,
        card,
      }),
    });
    const realLink = storeLinkUrl(data.tenant.subdomain);
    msg.innerHTML = `<div class="msg success">${t('addMarketplaceSuccessMsg') || 'Marketplace access added to'} ${esc(data.tenant.name)}. <a href="${realLink}" target="_blank" style="color:var(--accent);">${realLink}</a></div>`;
    ['amSub','amEmail','amPassword','amCardNum','amCardExp','amCardCvv','amCardName'].forEach(id => { document.getElementById(id).value = ''; });
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function joinMarketplace() {
  const msg = document.getElementById('joinMarketplaceMsg');
  const plan = document.getElementById('jmPlan').value;
  try {
    const socialLinks = {};
    [['jmFacebook','facebook'],['jmInstagram','instagram'],['jmLinkedin','linkedin'],['jmX','x'],['jmWhatsapp','whatsapp'],['jmYoutube','youtube']].forEach(([id, key]) => {
      const v = document.getElementById(id).value.trim();
      if (v) socialLinks[key] = v;
    });
    const data = await api('/api/platform/marketplace-members', {
      method: 'POST',
      body: JSON.stringify({
        businessName: document.getElementById('jmBusinessName').value,
        ownerName: document.getElementById('jmOwnerName').value,
        email: document.getElementById('jmEmail').value,
        phone: document.getElementById('jmPhone').value,
        country: document.getElementById('jmCountry').value,
        city: document.getElementById('jmCity').value,
        address: document.getElementById('jmAddress').value,
        websiteUrl: document.getElementById('jmWebsiteUrl').value,
        category: document.getElementById('jmCategory').value,
        description: document.getElementById('jmDescription').value,
        logoUrl: document.getElementById('jmLogoUrl').value,
        registrationNumber: document.getElementById('jmRegistrationNumber').value,
        vatNumber: document.getElementById('jmVatNumber').value,
        socialLinks,
        plan,
        card: plan === 'featured' ? { number: document.getElementById('jmCardNum').value, expiry: document.getElementById('jmCardExp').value } : undefined,
      }),
    });
    msg.innerHTML = `<div class="msg success">${t('applicationPendingMsg') || 'Your application for '}${esc(data.member.businessName)}${t('applicationPendingMsg2') || ' has been received and is pending review. You\'ll get an email once it\'s approved.'}</div>`;
    ['jmBusinessName','jmOwnerName','jmEmail','jmPhone','jmCountry','jmCity','jmAddress','jmWebsiteUrl','jmCategory','jmDescription','jmLogoUrl','jmRegistrationNumber','jmVatNumber','jmFacebook','jmInstagram','jmLinkedin','jmX','jmWhatsapp','jmYoutube','jmCardNum','jmCardExp','jmCardCvv'].forEach(id => { document.getElementById(id).value = ''; });
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function toggleSignupPayment() {
  const tier = document.getElementById('cTier').value;
  const showing = tier !== 'starter';
  document.getElementById('signupPaymentFields').style.display = showing ? 'block' : 'none';
  if (showing) wireCardFieldValidation('c');
}
function clearSellForm() {
  // Browsers sometimes autofill the account fields below from a previously
  // saved credential when a select changes and the form re-renders — clear
  // them explicitly so switching plans never carries over stale account info.
  ['cAdminName', 'cAdminEmail', 'cAdminPass', 'cCardNum', 'cCardExp', 'cCardCvv', 'cCardName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
async function createTenant() {
  const msg = document.getElementById('createMsg');
  const tier = document.getElementById('cTier').value;
  const card = {
    number: document.getElementById('cCardNum').value, expiry: document.getElementById('cCardExp').value,
    cvv: document.getElementById('cCardCvv').value, holderName: document.getElementById('cCardName').value,
  };
  if (tier !== 'starter') {
    const cardError = cardValidationError(card);
    if (cardError) { msg.innerHTML = `<div class="msg error">${esc(cardError)}</div>`; return; }
  }
  try {
    const subdomain = document.getElementById('cSub').value.trim().toLowerCase();
    const data = await api('/api/platform/tenants', {
      method: 'POST',
      body: JSON.stringify({
        subdomain,
        storeName: document.getElementById('cName').value,
        plan: document.getElementById('cPlan').value,
        subscriptionTier: tier,
        card,
        adminName: document.getElementById('cAdminName').value,
        adminEmail: document.getElementById('cAdminEmail').value,
        adminPassword: document.getElementById('cAdminPass').value,
      }),
    });
    state.baseDomain = data.storeUrl.split('://')[1].split('.').slice(1).join('.');
    if (data.pendingApproval) {
      // 6th+ store for this account: show the pending-approval message right here,
      // on the creation screen, and stop -- do not show the "store ready" panel or
      // the live store link, since the store isn't live yet.
      document.getElementById('resultContent').innerHTML = `
        <div class="panel" style="max-width:480px;margin:60px auto;text-align:center;">
          <h3>Pending approval: ${esc(data.tenant.name)}</h3>
          <p style="color:var(--text-dim);font-size:14px;">
            You have more than 5 stores. Your request has been sent to the
            Superadmin to approve it.
          </p>
          <div class="hint">You will be notified once it is approved. No further action is needed from you right now.</div>
        </div>`;
      go('result');
      return;
    }
    // Previously this substituted a locally-computed link here, on the assumption
    // the server's own storeUrl (built from the real production domain) wouldn't
    // resolve during local development testing. That's no longer the right default:
    // once deployed with real wildcard DNS configured (as production now is), the
    // server's storeUrl IS the correct, resolvable address, and using anything else
    // here previously showed users a broken link (e.g. "yourstore.com" instead of
    // "yourstore.hadamplatform.com"). Always show the server's own URL directly.
    document.getElementById('resultContent').innerHTML = `
      <div class="panel" style="max-width:480px;margin:60px auto;text-align:center;">
        <h3>✓ ${esc(data.tenant.name)} ${t('storeReady')}</h3>
        <p style="color:var(--text-dim);font-size:14px;">Your store — click to open it now:</p>
        <a href="${data.storeUrl}" target="_blank" style="display:block;font-family:var(--font-mono);color:var(--accent);font-size:16px;margin-bottom:14px;">${esc(data.storeUrl)}</a>
        <div class="hint">Log in there with the admin email and password you just set. Your store starts with an empty catalog by design — add your categories and products from Admin.</div>
      </div>`;
    go('result');
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- contact ---------------- */
async function sendPlatformContact() {
  const msg = document.getElementById('contactMsg');
  try {
    await api('/api/platform/contact', { method: 'POST', body: JSON.stringify({ name: document.getElementById('ctName').value, email: document.getElementById('ctEmail').value, message: document.getElementById('ctMessage').value }) });
    msg.innerHTML = `<div class="msg success">${t('contactSent')}</div>`;
    document.getElementById('ctName').value = ''; document.getElementById('ctEmail').value = ''; document.getElementById('ctMessage').value = '';
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* ---------------- superadmin ---------------- */
function onAuthBtn() {
  if (state.user) { logout(); return; }
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('superadminLogin')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('superadminOnlyHint')}</div>
    <div id="authMsg"></div>
    <div class="field"><label>${t('email')}</label><input id="saEmail" type="email"></div>
    <div class="field"><label>${t('password')}</label><input id="saPass" type="password"></div>
    <button class="btn full" onclick="doSuperLogin()">${t('logIn')}</button>
    <a href="#" onclick="showSuperForgotPassword();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('forgotPasswordLink')}</a>`;
  openModal('authOverlay');
}
function showSuperForgotPassword() {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('forgotPasswordLink')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('superForgotPasswordHint')}</div>
    <div id="authMsg"></div>
    <div class="field"><label>${t('email')}</label><input id="saForgotEmail" type="email"></div>
    <button class="btn full" onclick="doSuperForgotPassword()">${t('sendResetLinkBtn')}</button>`;
}
async function doSuperForgotPassword() {
  const msgEl = () => document.getElementById('authMsg');
  try {
    await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: document.getElementById('saForgotEmail').value }) });
    msgEl().innerHTML = `<div class="msg success">${t('resetLinkSentMsg')}</div>`;
  } catch (e) { msgEl().innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function doSuperLogin() {
  const msgEl = () => document.getElementById('authMsg');
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('saEmail').value, password: document.getElementById('saPass').value }) });
    if (result.mfaRequired) {
      showSuperMfaPrompt(result.tempToken, result.factorId, result.methods || ['totp']);
      return;
    }
    completeSuperLogin(result);
  } catch (e) { msgEl().innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function completeSuperLogin(result) {
  state.user = result.user; state.token = result.token; localStorage.setItem('hadam_super_token', result.token);
  closeModal('authOverlay');
  document.getElementById('authBtn').textContent = t('logout');
  document.getElementById('dashboardNavLink').style.display = 'inline';
  go('super');
}
function showSuperMfaPrompt(tempToken, factorId, methods) {
  if (methods.length > 1) {
    document.getElementById('authModalContent').innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaChooseMethodHint') || "Choose how you'd like to verify it's you."}</div>
      ${methods.includes('totp') ? `<button class="btn full secondary" style="margin-bottom:8px;" onclick="showSuperMfaPrompt('${tempToken}','${factorId}',['totp'])">${t('mfaMethodAuthenticatorApp') || 'Authenticator app'}</button>` : ''}
      ${methods.includes('email') ? `<button class="btn full secondary" style="margin-bottom:8px;" onclick="showSuperEmailOtpPrompt('${tempToken}')">${t('mfaMethodEmail') || 'Email code'}</button>` : ''}
      ${methods.includes('backup') ? `<button class="btn full secondary" onclick="showSuperBackupCodeLoginPrompt('${tempToken}')">${t('mfaMethodBackup') || 'Backup code'}</button>` : ''}`;
    return;
  }
  if (methods[0] === 'email') { showSuperEmailOtpPrompt(tempToken); return; }
  if (methods[0] === 'backup') { showSuperBackupCodeLoginPrompt(tempToken); return; }
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('mfaPromptHint')}</div>
    <div class="field"><label>${t('mfaCodeLabel')}</label><input id="superMfaCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <div id="authMsg"></div>
    <button class="btn full" onclick="submitSuperMfaCode('${tempToken}','${factorId}')">${t('verifyBtn')}</button>`;
}
function showSuperBackupCodeLoginPrompt(tempToken) {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('backupCodeLoginHint') || 'Enter one of your backup codes. Each one only works once.'}</div>
    <div class="field"><label>${t('backupCodeLabel') || 'Backup code'}</label><input id="superBackupLoginCode" autocomplete="one-time-code" placeholder="XXXXX-XXXXX"></div>
    <div id="authMsg"></div>
    <button class="btn full" onclick="submitSuperBackupCodeLogin('${tempToken}')">${t('verifyBtn')}</button>`;
}
async function submitSuperBackupCodeLogin(tempToken) {
  const code = document.getElementById('superBackupLoginCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const result = await api('/api/auth/mfa/backup-codes/verify', { method: 'POST', body: JSON.stringify({ tempToken, code }) });
    completeSuperLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function showSuperEmailOtpPrompt(tempToken) {
  document.getElementById('authModalContent').innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="hint" style="margin-bottom:12px;">${t('mfaEmailSendingHint') || 'Sending a code to your email...'}</div>`;
  try {
    await api('/api/auth/mfa/email-otp/request', { method: 'POST', body: JSON.stringify({ tempToken }) });
    document.getElementById('authModalContent').innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaEmailSentHint') || 'Enter the code we just emailed you.'}</div>
      <div class="field"><label>${t('mfaCodeLabel')}</label><input id="superEmailOtpCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div id="authMsg"></div>
      <button class="btn full" onclick="submitSuperEmailOtpCode('${tempToken}')">${t('verifyBtn')}</button>
      <a href="#" onclick="showSuperEmailOtpPrompt('${tempToken}');return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('resendCodeLink') || 'Resend code'}</a>`;
  } catch (e) {
    document.getElementById('authModalContent').innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="msg error">${esc(e.message)}</div>`;
  }
}
async function submitSuperEmailOtpCode(tempToken) {
  const code = document.getElementById('superEmailOtpCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const result = await api('/api/auth/mfa/email-otp/verify', { method: 'POST', body: JSON.stringify({ tempToken, code }) });
    completeSuperLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function submitSuperMfaCode(tempToken, factorId) {
  const code = document.getElementById('superMfaCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const result = await api('/api/auth/mfa/login-verify', { method: 'POST', body: JSON.stringify({ tempToken, factorId, code }) });
    completeSuperLogin(result);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function logout() { state.user = null; state.token = null; localStorage.removeItem('hadam_super_token'); document.getElementById('authBtn').textContent = t('superadminLogin'); document.getElementById('dashboardNavLink').style.display = 'none'; go('home'); }

async function renderSuper() {
  const el = document.getElementById('superContent');
  if (!state.user) { el.innerHTML = `<div class="empty">${t('logInAsSuperadmin')}</div>`; return; }
  const { tenants, baseDomain } = await api('/api/platform/tenants');
  state.baseDomain = baseDomain;
  el.innerHTML = `<h2 class="section-title">${t('allTenants')}${helpIcon('tenantMgmt', { what: 'helpTenantMgmtWhat', why: 'helpTenantMgmtWhy', next: 'helpTenantMgmtNext', errors: 'helpTenantMgmtErrors' })}</h2>
    <table><thead><tr><th>${t('store')}</th><th>${t('plan')}</th><th>${t('subdomainLabel')}</th><th>${t('revenue')}</th><th>${t('products')}</th><th>${t('orders')}</th><th>${t('users')}</th><th>${t('status')}</th><th></th><th></th></tr></thead><tbody>
    ${tenants.map(tenant => `<tr>
      <td>${esc(tenant.name)}</td><td>${planLabel(tenant.plan)}</td><td><span style="font-family:var(--font-mono)">${esc(tenant.subdomain)}.${baseDomain}</span></td>
      <td>$${tenant.revenue.toFixed(2)}</td><td>${tenant.productCount}</td><td>${tenant.orderCount}</td><td>${tenant.userCount}</td>
      <td><span class="status-pill ${tenant.status === 'active' ? 'success' : 'failed'}">${tenant.status}</span></td>
      <td><button class="btn ghost sm" onclick="toggleTenant('${tenant.id}','${tenant.status}')">${tenant.status === 'active' ? t('suspend') : t('activate')}</button></td>
      <td><button class="btn ghost sm" style="color:#e5484d;" onclick="deleteTenant('${tenant.id}', decodeURIComponent('${encodeURIComponent(tenant.name)}'))"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-inline-end:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>${t('deleteTenantBtn') || 'Delete'}</button></td>
    </tr>`).join('')}</tbody></table>
    <h2 class="section-title" style="margin-top:32px;">${t('contactMessagesTitle') || 'Contact form messages'}${helpIcon('superContactMessages', { what: 'helpSuperContactWhat', why: 'helpSuperContactWhy', next: 'helpSuperContactNext' })}</h2>
    <p class="hint" style="max-width:640px;">${t('contactMessagesHint') || 'Messages submitted through the public Contact form.'}</p>
    <div id="contactMessagesContainer">${t('loading')}</div>
    <h2 class="section-title" style="margin-top:32px;">${t('platformSecurityAccessTitle')}</h2>
    <p class="hint" style="max-width:640px;">${t('platformSecurityAccessHint')}</p>
    <table style="max-width:640px;font-size:13.5px;">
      <tbody>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingEmailConfirm')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingPasswordRules')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingRedirectUrls')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingMfaProviders')}</td><td style="text-align:right;"><span class="status-pill">${t('smManagedInSupabase')}</span></td></tr>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingRateLimits')}</td><td style="text-align:right;"><span class="status-pill success">${t('smManagedInApp')}</span></td></tr>
        <tr><td style="padding:6px 0;color:var(--text-dim);">${t('smSettingPerStoreAccess')}</td><td style="text-align:right;"><span class="status-pill success">${t('smManagedInApp')}</span></td></tr>
      </tbody>
    </table>
    <h2 class="section-title" style="margin-top:32px;">${t('myAccountSecurityTitle')}${helpIcon('superOwnMfa', { what: 'helpSuperOwnMfaWhat', why: 'helpSuperOwnMfaWhy', next: 'helpSuperOwnMfaNext', rules: 'helpSuperOwnMfaRules' })}</h2>
    <div id="superMfaStatusContainer" style="max-width:400px;">${t('loading')}</div>
    <div style="max-width:400px;margin-top:16px;">
      <label style="font-weight:600;">${t('emailOtpSectionTitle') || 'Email verification code'}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('emailOtpSectionHint') || 'No authenticator app? Get a one-time code by email instead when logging in.'}</div>
      <div id="superEmailOtpStatusContainer">${t('loading')}</div>
    </div>
    <div style="max-width:400px;margin-top:16px;">
      <label style="font-weight:600;">${t('backupCodesSectionTitle') || 'Backup codes'}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('backupCodesSectionHint') || 'One-time codes to get in if you lose access to your authenticator app or email.'}</div>
      <div id="superBackupCodesStatusContainer">${t('loading')}</div>
    </div>
    <div style="max-width:400px;margin-top:16px;">
      <label style="font-weight:600;">${t('adminResetMfaTitle') || 'Reset MFA for a locked-out account'}${helpIcon('superResetMfa', { what: 'helpSuperResetMfaWhat', why: 'helpSuperResetMfaWhy', next: 'helpSuperResetMfaNext', rules: 'helpSuperResetMfaRules', errors: 'helpSuperResetMfaErrors' })}</label>
      <div class="hint" style="margin:4px 0 10px;">${t('adminResetMfaHint') || 'Last resort: for a store admin who has lost both their authenticator device and their backup codes, with no self-service path left. Verify their identity yourself before using this.'}</div>
      <input id="resetMfaEmail" type="email" placeholder="user@example.com" style="margin-bottom:8px;">
      <button class="btn sm secondary" onclick="superResetMfaByEmail()">${t('resetMfaBtn') || 'Reset MFA'}</button>
      <div id="resetMfaMsg" style="margin-top:8px;"></div>
    </div>
    <h2 class="section-title" style="margin-top:32px;">${t('technicalManualTitle') || 'Technical Manual'}</h2>
    <p class="hint" style="max-width:640px;">${t('technicalManualSuperadminHint') || 'Architecture, roles, database structure, APIs, workflows, and troubleshooting — for Superadmins and technical support only. This is not shown anywhere in the user-facing Help section.'}</p>
    <button class="btn" onclick="downloadTechnicalManual()">${t('downloadTechnicalManualBtn') || 'Download Technical Manual (.docx)'}</button>
    <div id="techManualMsg" class="hint" style="color:var(--danger,#e57373);"></div>
    <h2 class="section-title" style="margin-top:32px;">${t('auditLogTitle') || 'Security audit log'}${helpIcon('superAuditLog', { why: 'helpSuperAuditLogWhy', next: 'helpSuperAuditLogNext' })}</h2>
    <p class="hint" style="max-width:640px;">${t('auditLogHint') || 'A record of security-relevant events across every store — logins, MFA changes, password resets, and admin actions.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;max-width:900px;">
      <input id="auditLogEmailFilter" placeholder="${t('auditLogEmailFilterPlaceholder') || 'Filter by email'}" style="max-width:220px;">
      <select id="auditLogEventTypeFilter">
        <option value="">${t('auditLogAllEventTypes') || 'All event types'}</option>
        ${AUDIT_EVENT_TYPES.map(ev => `<option value="${ev}">${t('auditEvent_' + ev) || ev}</option>`).join('')}
      </select>
      <select id="auditLogOutcomeFilter">
        <option value="">${t('auditLogAllOutcomes') || 'All outcomes'}</option>
        <option value="success">${t('auditLogSuccess') || 'Success'}</option>
        <option value="failure">${t('auditLogFailure') || 'Failure'}</option>
      </select>
      <button class="btn sm secondary" onclick="renderAuditLog(0)">${t('auditLogApplyFilters') || 'Apply filters'}</button>
    </div>
    <div id="auditLogContainer">${t('loading')}</div>
    <h2 class="section-title" style="margin-top:32px;">${t('marketplaceApplicationsTitle')}</h2>
    <div id="marketplaceApplicationsList">${t('loading')}</div>
    <h2 class="section-title" style="margin-top:32px;">${t('pricingPlansTitle') || 'Store & marketplace pricing'}</h2>
    <p class="hint" style="max-width:640px;">${t('pricingPlansHint') || 'Manage the plans stores can subscribe to. Changing a price only affects new and future subscriptions -- plans already purchased keep their original pricing.'}</p>
    <div id="pricingPlansContainer">${t('loading')}</div>
    <div class="panel" style="max-width:520px;margin-top:16px;">
      <h3 id="pricingPlanFormTitle" style="margin-top:0;">${t('addPlanTitle') || 'Add a new plan'}</h3>
      <input type="hidden" id="ppEditId" value="">
      <div class="field"><label>${t('planNameLabel') || 'Name'}</label><input id="ppName" placeholder="starter"></div>
      <div class="field"><label>${t('monthlyPriceLabel') || 'Monthly price ($)'}</label><input id="ppMonthlyPrice" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>${t('yearlyPriceLabel') || 'Yearly price ($)'}</label><input id="ppYearlyPrice" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>${t('commissionRateLabel') || 'Commission rate (%)'}</label><input id="ppCommissionRate" type="number" min="0" max="100" step="0.1" value="0"></div>
      <div class="field"><label>${t('maxProductsLabel') || 'Max products (blank = unlimited)'}</label><input id="ppMaxProducts" type="number" min="0" step="1"></div>
      <div class="field"><label>${t('maxStorageLabel') || 'Max image storage, MB (blank = unlimited)'}</label><input id="ppMaxStorageMb" type="number" min="0" step="1"></div>
      <div class="field"><label>${t('staffAccountsLabel') || 'Staff accounts included'}</label><input id="ppStaffAccounts" type="number" min="1" step="1" value="1"></div>
      <div class="field"><label><input type="checkbox" id="ppMarketplaceAllowed" style="width:auto;margin-inline-end:6px;">${t('marketplaceAllowedLabel') || 'Marketplace listing allowed on this plan'}</label></div>
      <div class="field"><label><input type="checkbox" id="ppCustomDomain" style="width:auto;margin-inline-end:6px;">${t('customDomainLabel') || 'Custom domain allowed on this plan'}</label></div>
      <div id="pricingPlanFormMsg"></div>
      <button class="btn full" onclick="submitPlanForm()">${t('savePlanBtn') || 'Save plan'}</button>
      <button class="btn ghost sm" style="margin-top:8px;" onclick="resetPlanForm()">${t('cancelEditBtn') || 'Cancel / new plan'}</button>
    </div>`;
  renderSuperMfaStatus();
  renderSuperEmailOtpStatus();
  renderSuperBackupCodesStatus();
  renderAuditLog(0);
  renderMarketplaceApplications();
  renderContactMessages();
  renderPricingPlans();
}
async function renderPricingPlans() {
  const container = document.getElementById('pricingPlansContainer');
  if (!container) return;
  try {
    const { plans } = await api('/api/platform/plans');
    state.plans = plans;
    container.innerHTML = plans.length === 0 ? `<div class="empty">${t('noPlansYet') || 'No plans yet -- add one below.'}</div>` : `
      <table><thead><tr><th>${t('planNameLabel') || 'Name'}</th><th>${t('monthlyPriceLabel') || 'Monthly'}</th><th>${t('yearlyPriceLabel') || 'Yearly'}</th><th>${t('commissionRateLabel') || 'Commission'}</th><th>${t('maxProductsLabel') || 'Max products'}</th><th>${t('status')}</th><th></th><th></th></tr></thead><tbody>
      ${plans.map(p => `<tr>
        <td>${esc(p.name)}</td>
        <td>$${Number(p.monthly_price).toFixed(2)}</td>
        <td>$${Number(p.yearly_price).toFixed(2)}</td>
        <td>${(Number(p.commission_rate) * 100).toFixed(1)}%</td>
        <td>${p.max_products == null ? (t('unlimited') || 'Unlimited') : p.max_products}</td>
        <td><span class="status-pill ${p.active ? 'success' : 'failed'}">${p.active ? (t('activeLabel') || 'Active') : (t('inactiveLabel') || 'Inactive')}</span></td>
        <td><button class="btn ghost sm" onclick="editPlan('${p.id}')">${t('editBtn') || 'Edit'}</button></td>
        <td><button class="btn ghost sm" onclick="togglePlanActive('${p.id}', ${p.active})">${p.active ? (t('deactivateBtn') || 'Deactivate') : (t('activateBtn') || 'Activate')}</button></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function editPlan(id) {
  const plan = (state.plans || []).find(p => p.id === id);
  if (!plan) return;
  document.getElementById('ppEditId').value = plan.id;
  document.getElementById('pricingPlanFormTitle').textContent = (t('editPlanTitle') || 'Edit plan') + ': ' + plan.name;
  document.getElementById('ppName').value = plan.name;
  document.getElementById('ppMonthlyPrice').value = plan.monthly_price;
  document.getElementById('ppYearlyPrice').value = plan.yearly_price;
  document.getElementById('ppCommissionRate').value = Number(plan.commission_rate) * 100;
  document.getElementById('ppMaxProducts').value = plan.max_products == null ? '' : plan.max_products;
  document.getElementById('ppMaxStorageMb').value = plan.max_storage_mb == null ? '' : plan.max_storage_mb;
  document.getElementById('ppStaffAccounts').value = plan.staff_accounts;
  document.getElementById('ppMarketplaceAllowed').checked = !!plan.marketplace_allowed;
  document.getElementById('ppCustomDomain').checked = !!plan.custom_domain;
  document.getElementById('pricingPlanFormMsg').innerHTML = '';
}
function resetPlanForm() {
  document.getElementById('ppEditId').value = '';
  document.getElementById('pricingPlanFormTitle').textContent = t('addPlanTitle') || 'Add a new plan';
  document.getElementById('ppName').value = '';
  document.getElementById('ppMonthlyPrice').value = 0;
  document.getElementById('ppYearlyPrice').value = 0;
  document.getElementById('ppCommissionRate').value = 0;
  document.getElementById('ppMaxProducts').value = '';
  document.getElementById('ppMaxStorageMb').value = '';
  document.getElementById('ppStaffAccounts').value = 1;
  document.getElementById('ppMarketplaceAllowed').checked = false;
  document.getElementById('ppCustomDomain').checked = false;
  document.getElementById('pricingPlanFormMsg').innerHTML = '';
}
async function submitPlanForm() {
  const msg = document.getElementById('pricingPlanFormMsg');
  const editId = document.getElementById('ppEditId').value;
  const maxProductsRaw = document.getElementById('ppMaxProducts').value;
  const maxStorageRaw = document.getElementById('ppMaxStorageMb').value;
  const body = {
    name: document.getElementById('ppName').value.trim(),
    monthly_price: Number(document.getElementById('ppMonthlyPrice').value),
    yearly_price: Number(document.getElementById('ppYearlyPrice').value),
    commission_rate: Number(document.getElementById('ppCommissionRate').value) / 100,
    max_products: maxProductsRaw === '' ? null : Number(maxProductsRaw),
    max_storage_mb: maxStorageRaw === '' ? null : Number(maxStorageRaw),
    staff_accounts: Number(document.getElementById('ppStaffAccounts').value),
    marketplace_allowed: document.getElementById('ppMarketplaceAllowed').checked,
    custom_domain: document.getElementById('ppCustomDomain').checked,
  };
  try {
    if (editId) {
      await api('/api/platform/plans/' + editId, { method: 'PATCH', body: JSON.stringify(body) });
      msg.innerHTML = `<div class="msg success">${t('planUpdatedMsg') || 'Plan updated.'}</div>`;
    } else {
      await api('/api/platform/plans', { method: 'POST', body: JSON.stringify(body) });
      msg.innerHTML = `<div class="msg success">${t('planCreatedMsg') || 'Plan created.'}</div>`;
    }
    resetPlanForm();
    renderPricingPlans();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function togglePlanActive(id, currentlyActive) {
  try {
    await api('/api/platform/plans/' + id, { method: 'PATCH', body: JSON.stringify({ active: !currentlyActive }) });
    renderPricingPlans();
  } catch (e) { alert(e.message); }
}
async function renderContactMessages() {
  const container = document.getElementById('contactMessagesContainer');
  if (!container) return;
  try {
    const { messages } = await api('/api/platform/contact');
    container.innerHTML = messages.length === 0 ? `<div class="empty">${t('noContactMessages') || 'No messages yet.'}</div>` : `
      <table><thead><tr><th>${t('dateLabel') || 'Date'}</th><th>${t('nameLabel') || 'Name'}</th><th>${t('email')}</th><th>${t('messageLabel') || 'Message'}</th></tr></thead><tbody>
        ${messages.map(m => `<tr>
          <td style="white-space:nowrap;">${localeDate(new Date(m.createdAt))}</td>
          <td>${esc(m.name)}</td>
          <td><a href="mailto:${esc(m.email)}" style="color:var(--accent);">${esc(m.email)}</a></td>
          <td style="max-width:400px;white-space:pre-wrap;">${esc(m.message)}</td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function renderSuperBackupCodesStatus() {
  const container = document.getElementById('superBackupCodesStatusContainer');
  if (!container) return;
  try {
    const [{ remaining }, { factors }, { enabled: emailOtpEnabled }] = await Promise.all([
      api('/api/auth/mfa/backup-codes/status'),
      api('/api/auth/mfa/factors').catch(() => ({ factors: [] })),
      api('/api/auth/mfa/email-otp/status').catch(() => ({ enabled: false })),
    ]);
    const hasPrimaryMethod = factors.some(f => f.status === 'verified') || emailOtpEnabled;
    const warning = !hasPrimaryMethod
      ? `<div class="msg error" style="margin-bottom:8px;">${t('backupCodesNoPrimaryWarning') || 'Backup codes are a fallback, not a login method on their own — enable the authenticator app or email code above first, or these codes will never be asked for at login.'}</div>`
      : '';
    container.innerHTML = `
      ${warning}
      <div class="hint" style="margin-bottom:8px;">${remaining > 0 ? `${remaining} ${t('backupCodesRemainingLabel') || 'unused codes remaining'}` : t('noBackupCodesLabel') || 'No backup codes generated yet.'}</div>
      <button class="btn sm secondary" onclick="confirmGenerateSuperBackupCodes()">${remaining > 0 ? (t('regenerateBackupCodesBtn') || 'Regenerate codes') : (t('generateBackupCodesBtn') || 'Generate backup codes')}</button>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function confirmGenerateSuperBackupCodes() {
  if (!confirm(t('regenerateBackupCodesConfirm') || 'This will invalidate any existing backup codes. Continue?')) return;
  const container = document.getElementById('superBackupCodesStatusContainer');
  try {
    const { codes } = await api('/api/auth/mfa/backup-codes/generate', { method: 'POST' });
    showSuperBackupCodesModal(codes);
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function showSuperBackupCodesModal(codes) {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('yourBackupCodesTitle') || 'Your backup codes'}</h3>
    <div class="hint" style="margin-bottom:10px;">${t('backupCodesWarning') || 'Save these somewhere safe — each code works once, and this is the only time they\'ll be shown.'}</div>
    <div style="background:var(--surface-2,#232735);border-radius:8px;padding:12px;font-family:monospace;font-size:15px;line-height:2;text-align:center;margin-bottom:12px;">${codes.join('<br>')}</div>
    <button class="btn full" onclick="downloadBackupCodes(${JSON.stringify(codes).replace(/"/g,'&quot;')})">${t('downloadCodesBtn') || 'Download as text file'}</button>
    <button class="btn full secondary" style="margin-top:8px;" onclick="closeModal('authOverlay');renderSuperBackupCodesStatus();">${t('doneBtn') || 'Done'}</button>`;
  openModal('authOverlay');
}
function downloadBackupCodes(codes) {
  const blob = new Blob([`Hadam backup codes\n\n${codes.join('\n')}\n\nEach code works once. Keep this file somewhere safe.`], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'hadam-backup-codes.txt';
  link.click();
}
async function renderSuperEmailOtpStatus() {
  const container = document.getElementById('superEmailOtpStatusContainer');
  if (!container) return;
  try {
    const { enabled } = await api('/api/auth/mfa/email-otp/status');
    if (enabled) {
      container.innerHTML = `<span class="status-pill success">✅ ${t('emailOtpEnabledLabel') || 'Email code enabled'}</span>
        <button class="btn danger sm" style="margin-inline-start:8px;" onclick="toggleSuperEmailOtp(false)">${t('disableBtn') || 'Disable'}</button>`;
    } else {
      container.innerHTML = `<button class="btn sm secondary" onclick="toggleSuperEmailOtp(true)">${t('emailOtpEnableBtn') || 'Enable email code'}</button>`;
    }
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function toggleSuperEmailOtp(enabled) {
  try {
    await api('/api/auth/mfa/email-otp/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
    renderSuperEmailOtpStatus();
  } catch (e) { alert(e.message); }
}
async function superResetMfaByEmail() {
  const email = document.getElementById('resetMfaEmail').value.trim();
  const msg = document.getElementById('resetMfaMsg');
  if (!email) { msg.innerHTML = `<div class="msg error">${t('emailRequiredError') || 'Email is required.'}</div>`; return; }
  if (!confirm(t('resetMfaConfirmGeneric') || 'This removes every MFA method for that account, so they can log in with just their password and set up MFA again. Have you verified their identity? Continue?')) return;
  try {
    await api('/api/platform/users/reset-mfa-by-email', { method: 'POST', body: JSON.stringify({ email }) });
    msg.innerHTML = `<div class="msg success">${t('resetMfaSuccess') || 'MFA has been reset for this account.'}</div>`;
    document.getElementById('resetMfaEmail').value = '';
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function renderSuperMfaStatus() {
  const container = document.getElementById('superMfaStatusContainer');
  if (!container) return;
  try {
    const { factors } = await api('/api/auth/mfa/factors');
    const verified = factors.filter(f => f.status === 'verified');
    if (verified.length > 0) {
      container.innerHTML = `<div class="hint" style="margin-bottom:8px;">${t('mfaEnabledStatusMsg')}</div><button class="btn sm danger" onclick="disableSuperMfa('${verified[0].id}')">${t('disableMfaBtn')}</button>`;
    } else {
      container.innerHTML = `<div class="hint" style="margin-bottom:8px;">${t('mfaNotEnabledStatusMsg')}</div><button class="btn sm" onclick="startSuperMfaEnrollment()">${t('enableMfaBtn')}</button>`;
    }
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function startSuperMfaEnrollment() {
  const container = document.getElementById('superMfaStatusContainer');
  try {
    const { factorId, qrCode, secret } = await api('/api/auth/mfa/enroll', { method: 'POST' });
    container.innerHTML = `
      <div class="hint" style="margin-bottom:8px;">${t('mfaScanHint')}</div>
      <img src="${esc(qrCode)}" alt="${t('mfaScanHint')}" style="display:block;margin-bottom:8px;width:220px;height:220px;background:white;padding:8px;" onerror="this.style.display='none';document.getElementById('mfaQrError').style.display='block';">
      <div id="mfaQrError" class="msg error" style="display:none;margin-bottom:8px;">${t('mfaQrLoadErrorMsg') || 'The QR code image failed to load — use the manual entry code below instead.'}</div>
      <div class="hint" style="margin-bottom:10px;">${t('mfaManualEntryLabel')}: <code>${esc(secret)}</code></div>
      <div class="field"><label>${t('mfaCodeLabel')}</label><input id="superMfaEnrollCode" dir="ltr" inputmode="numeric" maxlength="6"></div>
      <div id="superMfaEnrollMsg"></div>
      <button class="btn full" onclick="confirmSuperMfaEnrollment('${factorId}')">${t('verifyBtn')}</button>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function confirmSuperMfaEnrollment(factorId) {
  const code = document.getElementById('superMfaEnrollCode').value.trim();
  const msg = document.getElementById('superMfaEnrollMsg');
  try {
    await api('/api/auth/mfa/verify-enrollment', { method: 'POST', body: JSON.stringify({ factorId, code }) });
    msg.innerHTML = `<div class="msg success">${t('mfaEnabledSuccessMsg')}</div>`;
    setTimeout(renderSuperMfaStatus, 1200);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function disableSuperMfa(factorId) {
  if (!confirm(t('disableMfaConfirm') || 'Disable two-factor authentication?')) return;
  try {
    await api('/api/auth/mfa/factors/' + factorId, { method: 'DELETE' });
    renderSuperMfaStatus();
  } catch (e) { alert(e.message); }
}
async function renderAuditLog(offset) {
  const container = document.getElementById('auditLogContainer');
  const limit = 50;
  const params = new URLSearchParams({ limit, offset });
  const email = document.getElementById('auditLogEmailFilter').value.trim();
  const eventType = document.getElementById('auditLogEventTypeFilter').value;
  const outcome = document.getElementById('auditLogOutcomeFilter').value;
  if (email) params.set('email', email);
  if (eventType) params.set('eventType', eventType);
  if (outcome) params.set('outcome', outcome);
  try {
    const { entries, total } = await api(`/api/platform/audit-log?${params.toString()}`);
    if (entries.length === 0) {
      container.innerHTML = `<div class="empty">${t('auditLogEmpty') || 'No matching events.'}</div>`;
      return;
    }
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    container.innerHTML = `
      <table style="font-size:13px;">
        <thead><tr><th>${t('auditLogWhen') || 'When'}</th><th>${t('auditLogEvent') || 'Event'}</th><th>${t('auditLogEmailCol') || 'Email'}</th><th>${t('auditLogOutcomeCol') || 'Outcome'}</th><th>${t('auditLogIp') || 'IP'}</th><th>${t('auditLogDetails') || 'Details'}</th></tr></thead>
        <tbody>
          ${entries.map(e => `<tr>
            <td style="white-space:nowrap;">${localeDate(new Date(e.createdAt))}</td>
            <td>${esc(t('auditEvent_' + e.eventType) || e.eventType)}</td>
            <td>${esc(e.email || '—')}</td>
            <td><span class="status-pill ${e.outcome === 'success' ? 'success' : 'failed'}">${esc(e.outcome)}</span></td>
            <td style="font-family:var(--font-mono);font-size:12px;">${esc(e.ipAddress || '—')}</td>
            <td style="font-size:12px;color:var(--text-dim);max-width:260px;">${Object.keys(e.details || {}).length ? esc(JSON.stringify(e.details)) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <span class="hint" style="margin:0;">${t('auditLogPageInfo') ? t('auditLogPageInfo').replace('{page}', currentPage).replace('{total}', totalPages) : `Page ${currentPage} of ${totalPages || 1}`}</span>
        <div>
          <button class="btn sm secondary" ${offset === 0 ? 'disabled' : ''} onclick="renderAuditLog(${Math.max(0, offset - limit)})">${t('auditLogPrev') || 'Previous'}</button>
          <button class="btn sm secondary" ${offset + limit >= total ? 'disabled' : ''} onclick="renderAuditLog(${offset + limit})">${t('auditLogNext') || 'Next'}</button>
        </div>
      </div>`;
  } catch (e) { container.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function renderMarketplaceApplications() {
  const el = document.getElementById('marketplaceApplicationsList');
  if (!el) return;
  const { members } = await api('/api/platform/marketplace-members');
  if (members.length === 0) { el.innerHTML = `<div class="empty">${t('noApplicationsYet')}</div>`; return; }
  const statusPillClass = { pending: '', active: 'success', rejected: 'failed', more_info_requested: '', suspended: 'failed' };
  el.innerHTML = `<table><thead><tr><th>${t('businessNameLabel')}</th><th>${t('ownerNameLabel')}</th><th>${t('email')}</th><th>${t('marketplacePlanLabel')}</th><th>${t('status')}</th><th>${t('subExpiresOnLabel')}</th><th>${helpIcon('marketReview', { what: 'helpMarketReviewWhat', why: 'helpMarketReviewWhy', next: 'helpMarketReviewNext', rules: 'helpMarketReviewRules' })}</th></tr></thead><tbody>
    ${members.map(m => `<tr>
      <td>${esc(m.businessName)}</td><td>${esc(m.ownerName)}</td><td>${esc(m.email)}</td>
      <td>${m.plan === 'featured' ? `★ ${t('featuredBadge')}` : t('jmPlanFreeOpt').split(' —')[0]}</td>
      <td><span class="status-pill ${statusPillClass[m.status] || ''}">${m.status.replace('_', ' ')}</span>${m.adminNote ? `<div class="hint" style="margin-top:2px;">${esc(m.adminNote)}</div>` : ''}</td>
      <td>${m.plan === 'featured' && m.subscriptionExpiresAt ? localeDate(new Date(m.subscriptionExpiresAt), { dateStyle: "medium" }) : '—'}</td>
      <td class="table-actions">
        ${m.status !== 'active' ? `<button class="btn sm" onclick="reviewMarketplaceMember('${m.id}','approve')">${t('approveBtn')}</button>` : ''}
        ${m.status === 'active' ? `<button class="btn sm ghost" onclick="reviewMarketplaceMember('${m.id}','suspend')">${t('suspendBtn')}</button>` : ''}
        ${m.status === 'suspended' ? `<button class="btn sm ghost" onclick="reviewMarketplaceMember('${m.id}','reactivate')">${t('reactivateBtn')}</button>` : ''}
        ${m.status === 'pending' ? `<button class="btn sm ghost" onclick="reviewMarketplaceMember('${m.id}','request_more_info')">${t('requestMoreInfoBtn')}</button>` : ''}
        ${!['rejected'].includes(m.status) ? `<button class="btn sm danger" onclick="reviewMarketplaceMember('${m.id}','reject')">${t('rejectBtn')}</button>` : ''}
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}
async function reviewMarketplaceMember(id, action) {
  let note = '';
  if (['reject', 'request_more_info', 'suspend'].includes(action)) {
    note = prompt(t('reviewNotePrompt') || 'Optional note (shown to the applicant):') || '';
  }
  try {
    await api(`/api/platform/marketplace-members/${id}/review`, { method: 'POST', body: JSON.stringify({ action, note }) });
    renderMarketplaceApplications();
  } catch (e) { alert(e.message); }
}
async function toggleTenant(id, currentStatus) {
  await api(`/api/platform/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ status: currentStatus === 'active' ? 'suspended' : 'active' }) });
  renderSuper();
}
async function deleteTenant(id, name) {
  var typed = prompt('Type "' + name + '" to permanently delete this store. This cannot be undone from here \u2014 the store, its data, and its staff/client access will all stop working immediately.');
  if (typed === null) return; // cancelled
  if (typed.trim() !== name) { alert('Store name did not match \u2014 nothing was deleted.'); return; }
  try {
    await api('/api/platform/tenants/' + id, { method: 'DELETE', body: JSON.stringify({ confirmName: typed.trim() }) });
    renderSuper();
  } catch (e) { alert(e.message); }
}

async function initSuperRecoveryFlow() {
  // Same principle as the tenant site: Supabase's recovery link lands back
  // here with tokens in the URL hash, and completing the reset must go
  // through Supabase's own client SDK, not our backend.
  if (location.hash.includes('error=')) {
    // An already-expired or already-used link redirects here with an
    // explicit error in the hash rather than firing PASSWORD_RECOVERY at
    // all — needs its own direct check, not just the timeout fallback below.
    showSuperInvalidRecoveryLinkMessage();
    return;
  }
  if (!location.hash.includes('type=recovery')) return;
  let config;
  try { config = await api('/api/config'); } catch { return; }
  if (config.authDriver !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) return;
  const sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  let recoveryStarted = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recoveryStarted = true; showSuperSetNewPasswordModal(sb); }
  });
  setTimeout(() => {
    if (!recoveryStarted) showSuperInvalidRecoveryLinkMessage();
  }, 3000);
}
function showSuperInvalidRecoveryLinkMessage() {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('setNewPasswordTitle')}</h3>
    <div class="msg error">${t('invalidRecoveryLinkMsg') || 'This password reset link is invalid or has expired. Please request a new one.'}</div>
    <button class="btn full" style="margin-top:10px;" onclick="history.replaceState(null,'',location.pathname);showSuperForgotPassword();">${t('requestNewLinkBtn') || 'Request a new link'}</button>`;
  openModal('authOverlay');
}
function showSuperSetNewPasswordModal(sb) {
  document.getElementById('authModalContent').innerHTML = `
    <h3>${t('setNewPasswordTitle')}</h3>
    <div class="field"><label>${t('newPasswordLabel')}</label><input type="password" id="superNewPassword"></div>
    <div class="field"><label>${t('confirmNewPasswordLabel')}</label><input type="password" id="superNewPasswordConfirm"></div>
    <div id="authMsg"></div>
    <button class="btn full" onclick="submitSuperNewPassword()">${t('setNewPasswordBtn')}</button>`;
  window._superRecoverySbClient = sb;
  openModal('authOverlay');
}
async function submitSuperNewPassword() {
  const newPassword = document.getElementById('superNewPassword').value;
  const confirmPassword = document.getElementById('superNewPasswordConfirm').value;
  const msg = document.getElementById('authMsg');
  if (newPassword !== confirmPassword) { msg.innerHTML = `<div class="msg error">${t('passwordsDontMatch')}</div>`; return; }
  if (newPassword.length < 8) { msg.innerHTML = `<div class="msg error">${t('passwordTooShortError') || 'Password must be at least 8 characters.'}</div>`; return; }
  window._superRecoveryPendingPassword = newPassword;
  try {
    const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
    const { isSame } = await api('/api/auth/check-password-different', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, newPassword }) });
    if (isSame) { msg.innerHTML = `<div class="msg error">${t('passwordSameAsCurrentError') || 'This is your current password — please choose a different one.'}</div>`; return; }
  } catch { /* if the check itself fails, fall through — Supabase's own call below still catches this case, just later */ }
  await attemptSuperRecoveryPasswordUpdate(newPassword);
}
async function attemptSuperRecoveryPasswordUpdate(newPassword) {
  const msg = document.getElementById('authMsg');
  const { error } = await window._superRecoverySbClient.auth.updateUser({ password: newPassword });
  if (error) {
    // Same principle as the tenant site: a recovery link only ever
    // establishes an aal1 session, so an MFA-enabled account needs an
    // extra verification step here before the reset can complete.
    if (/aal2/i.test(error.message)) { await showSuperRecoveryMfaChallenge(); return; }
    msg.innerHTML = `<div class="msg error">${esc(error.message)}</div>`;
    return;
  }
  await window._superRecoverySbClient.auth.signOut();
  history.replaceState(null, '', location.pathname);
  msg.innerHTML = `<div class="msg success">${t('passwordResetSuccess')}</div>`;
  setTimeout(() => { closeModal('authOverlay'); }, 1500);
}
async function showSuperRecoveryMfaChallenge() {
  const container = document.getElementById('authModalContent');
  const { data: mfaData } = await window._superRecoverySbClient.auth.mfa.listFactors();
  const hasTotp = mfaData && mfaData.totp && mfaData.totp.length > 0;
  const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
  const recoveryAccessToken = sessionData.session.access_token;
  let hasEmailOtp = false;
  try {
    const status = await fetch('/api/auth/mfa/email-otp/status', { headers: { Authorization: `Bearer ${recoveryAccessToken}` } }).then(r => r.json());
    hasEmailOtp = !!status.enabled;
  } catch { /* treat as unavailable if the check itself fails */ }
  if (!hasTotp && !hasEmailOtp) {
    container.innerHTML = `<h3>${t('setNewPasswordTitle')}</h3><div class="msg error">${t('recoveryMfaUnavailableMsg') || 'Two-factor verification is required to reset this password, but no verified method could be found. Please contact support.'}</div>`;
    return;
  }
  if (hasTotp && hasEmailOtp) {
    const factorId = mfaData.totp[0].id;
    container.innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaChooseMethodHint') || "Choose how you'd like to verify it's you."}</div>
      <button class="btn full secondary" style="margin-bottom:8px;" onclick="showSuperRecoveryTotpForm('${factorId}')">${t('mfaMethodAuthenticatorApp') || 'Authenticator app'}</button>
      <button class="btn full secondary" onclick="showSuperRecoveryEmailOtpForm()">${t('mfaMethodEmail') || 'Email code'}</button>
      <a href="#" onclick="showSuperRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
    return;
  }
  if (hasTotp) { showSuperRecoveryTotpForm(mfaData.totp[0].id); return; }
  showSuperRecoveryEmailOtpForm();
}
function showSuperRecoveryTotpForm(factorId) {
  const container = document.getElementById('authModalContent');
  container.innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('recoveryMfaRequiredHint') || 'This account has two-factor authentication enabled — enter a code from your authenticator app to finish resetting your password.'}</div>
    <div class="field"><label>${t('mfaCodeLabel')}</label><input id="superRecoveryMfaCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
    <div id="authMsg"></div>
    <button class="btn full" onclick="submitSuperRecoveryMfaCode('${factorId}')">${t('verifyBtn')}</button>
    <a href="#" onclick="showSuperRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
}
async function showSuperRecoveryEmailOtpForm() {
  const container = document.getElementById('authModalContent');
  container.innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="hint" style="margin-bottom:12px;">${t('mfaEmailSendingHint') || 'Sending a code to your email...'}</div>`;
  try {
    const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
    await api('/api/auth/mfa/email-otp/request', { method: 'POST', body: JSON.stringify({ tempToken: sessionData.session.access_token }) });
    container.innerHTML = `
      <h3>${t('mfaPromptTitle')}</h3>
      <div class="hint" style="margin-bottom:12px;">${t('mfaEmailSentHint')}</div>
      <div class="field"><label>${t('mfaCodeLabel')}</label><input id="superRecoveryEmailOtpCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>
      <div id="authMsg"></div>
      <button class="btn full" onclick="submitSuperRecoveryEmailOtpCode()">${t('verifyBtn')}</button>
      <a href="#" onclick="showSuperRecoveryBackupCodePrompt();return false;" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--accent);">${t('lostDeviceUseBackupLink') || 'Lost your authenticator? Use a backup code'}</a>`;
  } catch (e) {
    container.innerHTML = `<h3>${t('mfaPromptTitle')}</h3><div class="msg error">${esc(e.message)}</div>`;
  }
}
async function submitSuperRecoveryEmailOtpCode() {
  const code = document.getElementById('superRecoveryEmailOtpCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
    await api('/api/auth/mfa/email-otp/verify-for-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, code }) });
    await completeSuperRecoveryWithStashedPassword();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
function showSuperRecoveryBackupCodePrompt() {
  const container = document.getElementById('authModalContent');
  container.innerHTML = `
    <h3>${t('mfaPromptTitle')}</h3>
    <div class="hint" style="margin-bottom:12px;">${t('recoveryBackupCodeHint') || 'Enter one of your backup codes.'}</div>
    <div class="field"><label>${t('backupCodeLabel') || 'Backup code'}</label><input id="superRecoveryBackupCode" autocomplete="one-time-code" placeholder="XXXXX-XXXXX"></div>
    <div id="authMsg"></div>
    <button class="btn full" onclick="submitSuperRecoveryBackupCode()">${t('verifyBtn')}</button>`;
}
async function submitSuperRecoveryBackupCode() {
  const code = document.getElementById('superRecoveryBackupCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
    await api('/api/auth/mfa/backup-codes/verify-for-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, code }) });
    await completeSuperRecoveryWithStashedPassword();
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
// Shared final step: the password was already collected and confirmed
// different from the current one on the very first screen.
async function completeSuperRecoveryWithStashedPassword() {
  const msg = document.getElementById('authMsg');
  try {
    const { data: sessionData } = await window._superRecoverySbClient.auth.getSession();
    await api('/api/auth/mfa/set-password-after-recovery', { method: 'POST', body: JSON.stringify({ recoveryAccessToken: sessionData.session.access_token, newPassword: window._superRecoveryPendingPassword }) });
    await window._superRecoverySbClient.auth.signOut();
    history.replaceState(null, '', location.pathname);
    document.getElementById('authModalContent').innerHTML = `<h3>${t('setNewPasswordTitle')}</h3><div class="msg success">${t('passwordResetSuccess')}</div>`;
    setTimeout(() => { closeModal('authOverlay'); }, 1500);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}
async function submitSuperRecoveryMfaCode(factorId) {
  const code = document.getElementById('superRecoveryMfaCode').value.trim();
  const msg = document.getElementById('authMsg');
  try {
    const { data: challenge, error: challengeErr } = await window._superRecoverySbClient.auth.mfa.challenge({ factorId });
    if (challengeErr) throw challengeErr;
    const { error: verifyErr } = await window._superRecoverySbClient.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyErr) throw verifyErr;
    await attemptSuperRecoveryPasswordUpdate(window._superRecoveryPendingPassword);
  } catch (e) { msg.innerHTML = `<div class="msg error">${esc(e.message)}</div>`; }
}

/* if already logged in as superadmin, jump straight to the dashboard */
(async function boot() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('langSelect').value = state.lang;
  applyStaticTranslations();
  await initSuperRecoveryFlow();
  if (state.token) {
    try { const { user } = await api('/api/auth/me'); state.user = user; document.getElementById('authBtn').textContent = t('logout'); document.getElementById('authBtn').style.display = ''; document.getElementById('dashboardNavLink').style.display = 'inline'; go('super'); }
    catch { state.token = null; localStorage.removeItem('hadam_super_token'); }
  }
  const hashView = (window.location.hash || '').replace('#', '');
  if (['home', 'marketplace', 'sell', 'contact'].includes(hashView)) go(hashView);
  if (hashView === 'superadmin-login') onAuthBtn();
  const planParam = new URLSearchParams(window.location.search).get('plan');
  if (['store', 'marketplace', 'both'].includes(planParam)) document.getElementById('cPlan').value = planParam;
  wireCardFieldValidation('rn');
  wireCardFieldValidation('am');
  injectAllHelpIcons();
})();
