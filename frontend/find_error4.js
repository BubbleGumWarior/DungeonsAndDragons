const fs = require('fs');
const lines = fs.readFileSync('src/components/CampaignView.tsx', 'utf8').split('\n');
const line12358 = lines[12357]; // 0-indexed
// Check character codes around column 73
for (let i = 68; i <= 80; i++) {
  const ch = line12358[i];
  if (ch) console.log(`Col ${i+1}: ${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()})`);
}
