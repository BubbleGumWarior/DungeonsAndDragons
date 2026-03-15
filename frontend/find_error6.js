const fs = require('fs');
const lines = fs.readFileSync('src/components/CampaignView.tsx', 'utf8').split('\n');
// Print lines 12340-12370 with raw content
for (let i = 12339; i < 12370; i++) {
  const hasNonAscii = /[^\x00-\x7F]/.test(lines[i]);
  console.log(`Line ${i+1}${hasNonAscii ? ' [NON-ASCII]' : ''}: ${lines[i]}`);
}
