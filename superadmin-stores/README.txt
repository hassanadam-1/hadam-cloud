HADAM - SUPERADMIN STORES ADD-ON  (built 24 Sep 2026)
=====================================================
Page:  https://hadamplatform.com/superadmin/stores
- Overview tiles: stores per status + with/without marketplace listing (click a tile to filter)
- Find a store: name, subdomain, owner email or ID
- Deleted stores: "Restore" button (sets status back to active, clears deleted_at/deleted_by)
- Access: signed-in superadmin only + 6-digit code emailed to the superadmin (via Resend, valid 10 min, 5 tries). Verified for 8 hours per browser tab. Checked on the server.

INSTALL (Git Bash)
1) Unzip so the folder sits next to server.js:
     cd ~/Desktop/hadam-v3
     unzip -o /c/Users/LENOVO/Downloads/superadmin-stores-v3.zip -d .
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
