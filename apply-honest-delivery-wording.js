'use strict';
const fs = require('fs');
const path = require('path');

function applyPatches(filePath, patches) {
  const full = path.resolve(filePath);
  let content = fs.readFileSync(full, 'utf8');
  for (const p of patches) {
    const count = content.split(p.find).length - 1;
    if (count === 0) { console.log(`SKIP (already applied or not found) [${filePath}] ${p.label}`); continue; }
    if (p.expect && count !== p.expect) throw new Error(`"${p.label}" in ${filePath} matched ${count}x, expected ${p.expect}. Aborting — check manually.`);
    content = content.split(p.find).join(p.replace);
    console.log(`OK [${filePath}] ${p.label} (${count}x)`);
  }
  fs.writeFileSync(full, content, 'utf8');
}

applyPatches('server.js', [
  { label: 'stop implying "delivered" means Inbox placement in the automatic check log', expect: 1,
    find: "      } else {\n        console.log(tag + ' automatic delivery check: email to ' + to + ' status = ' + status + ' \\u2014 looks fine.');\n      }",
    replace: "      } else if (status === 'delivered') {\n        console.log(tag + ' automatic delivery check: email to ' + to + ' was accepted by the recipient\\'s mail server (status = delivered). Note: this confirms the message was accepted, NOT that it reached the Inbox specifically \\u2014 spam-folder routing happens after this point and is never visible via any email API.');\n      } else {\n        console.log(tag + ' automatic delivery check: email to ' + to + ' status = ' + status + '.');\n      }" },
]);

console.log('\nDone.');
