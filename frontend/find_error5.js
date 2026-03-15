const fs = require('fs');
const content = fs.readFileSync('src/components/CampaignView.tsx', 'utf8');
// Find the skill search input placeholder
const idx = content.indexOf('Search skills');
if (idx === -1) { console.log('Not found'); process.exit(); }
const lineNum = content.slice(0, idx).split('\n').length;
console.log('Line:', lineNum);
const lines = content.split('\n');
for (let i = lineNum - 5; i < lineNum + 5; i++) {
  console.log(`Line ${i+1}: ${JSON.stringify(lines[i])}`);
}
