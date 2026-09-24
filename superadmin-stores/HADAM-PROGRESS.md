# Hadam progress backup — 24 Sep 2026

## Done this session
- Built Superadmin Stores add-on (superadmin-stores.zip): stores overview by status, find-a-store,
  with/without marketplace report, Restore deleted stores. Tested with sample data (server + browser).
- Installs as a separate folder + 1 line in server.js. Page: hadamplatform.com/superadmin/stores

## Found this session
- The server.zip / app.zip from the previous chat never reached the PC (not in Downloads).
- server.js in hadam-v3 is 96 KB, changed 24 Sep 18:14; the old copy in hadam-v3/hadam-cloud is 375 KB.
  Check with `git diff --stat HEAD -- server.js` before pushing anything else.
- hadam-v3/hadam-cloud/ is an old nested copy from 29 Aug — not the live code.

## Next
1. Install + push the add-on, restore Sport-store (ayman-store) from the new page.
2. Add a "Stores" link in the superadmin dashboard (app.js) pointing to /superadmin/stores.
3. Still open: ~33-route admin-client security audit; Resend delivery to non-sandbox address;
   Store A/B password-reset test; Fulfillment Queue "Save changes" failure; PayPal admin UI;
   auth_audit_log missing 'details' column; mandatory backup codes at MFA setup.
