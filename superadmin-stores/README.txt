HADAM - SUPERADMIN STORES ADD-ON  (built 24 Sep 2026)
=====================================================
Page:  https://hadamplatform.com/superadmin/stores  (also a "Stores" item in the main menu, superadmin only)
- Overview tiles: stores per status + with/without marketplace listing (click a tile to filter)
- Find a store: name, subdomain, owner email or ID
- Deleted stores: "Restore" button (sets status back to active, clears deleted_at/deleted_by)
- Access: signed-in superadmin only + 6-digit code emailed to the superadmin (via Resend, valid 10 min, 5 tries). Verified for 8 hours per browser tab. Checked on the server.

INSTALL (Git Bash)
1) Unzip so the folder sits next to server.js:
     cd ~/Desktop/hadam-v3
     unzip -o /c/Users/LENOVO/Downloads/superadmin-stores-v8.zip -d .
     ls superadmin-stores        -> router.cjs  page.html  page.js  README.txt

2) Hook it into server.js (plain Node http server). Two lines, added by this command:
     sed -i "s|^const server = http.createServer(async (req, res) => {|const saStores = require('./superadmin-stores/router.cjs');\nconst server = http.createServer(async (req, res) => {\n  if (await saStores(req, res)) return;|" server.js
   Check:  grep -n "saStores" server.js      (must show exactly 2 lines)
           node --check server.js            (must print nothing)

3) Push:
     git add superadmin-stores server.js
     git commit -m "Superadmin: stores overview, search, restore deleted stores"
     git push
4) Wait until Render shows the deploy as Live, then open hadamplatform.com/superadmin/stores

Uses existing Render env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, RESEND_API_KEY, FROM_EMAIL.
Optional: SA_MARKETPLACE_TABLE=<table name> if the marketplace report says "not found".
No database changes needed. No changes to app.js.

MAIN MENU ITEM (v5)
- public-platform/index.html loads the menu script, right after <script src="/app.js"></script>:
     <script src="/superadmin/stores/nav.js" defer></script>
- "Stores admin" appears right after "Dashboard" only while a superadmin is logged in, hides on logout.
- Opens inside the same page (overlay, Close / Esc) and reuses the dashboard login - no separate login screen.

STORE + MARKETPLACE (v7)
- Each row shows Store status and Marketplace status (from marketplace_members) side by side.
  Link: upgraded_to_tenant_id, else the same owner email. Marketplace-only members are listed too.
- Actions: Activate store / Activate marketplace / Activate both ("both" checks both first, never half-applies).
- Marketplace can be re-activated from: suspended, expired, deleted (and inactive/cancelled/disabled).
  pending / rejected -> use the normal Marketplace approvals. Featured with an ended period -> use Renew.
- Audit entries: store_restored, marketplace_reactivated (best effort). Render log lines "[superadmin-stores] ... activated ...".

PUBLIC DIRECTORY (v8)
- Public "Marketplace & Stores" lists a STORE only if: status active + plan 'marketplace' or 'both' +
  current_subscriptions.expiry_date not passed (same rules as GET /api/platform/directory).
- Stores admin shows "Listed / Not listed" with the reason. For a store, Activate marketplace
  sets plan 'store' -> 'both' (keeps the store) and re-activates its member listing if possible.
  An expired subscription is never overridden here - renew it.
- Audit: store_listed_in_marketplace.
