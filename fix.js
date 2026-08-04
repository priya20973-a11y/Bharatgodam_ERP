const fs = require('fs');
let c = fs.readFileSync('lib/invoice/cold-transfer-receipt.ts', 'utf8');
c = c.replace(/\\\$\{/g, '${').replace(/\\\`/g, '`');
fs.writeFileSync('lib/invoice/cold-transfer-receipt.ts', c);
