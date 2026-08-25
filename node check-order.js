'use strict';
// Read-only diagnostic: prints the exact stored fields for one specific
// order (the "mouse" test order), straight from data/db.json. This bypasses
// any browser/terminal timing confusion — it's the ground truth of what the
// server actually has saved right now.
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const ORDER_ID = 'b827c70e-b88c-487f-9a78-f369aa67a588';
const order = db.orders.find(o => o.id === ORDER_ID);
if (!order) {
  console.log('Order not found:', ORDER_ID);
} else {
  console.log(JSON.stringify(order, null, 2));
}
