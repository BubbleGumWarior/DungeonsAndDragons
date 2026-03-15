const fs = require('fs');
const content = fs.readFileSync('src/components/CampaignView.tsx', 'utf8');
// Search for any single-quoted string that contains a newline
const regex = /'[^']*\n[^']*'/g;
let match;
while ((match = regex.exec(content)) !== null) {
  const lineNum = content.slice(0, match.index).split('\n').length;
  console.log(`Line ~${lineNum}: ${JSON.stringify(match[0].slice(0, 100))}`);
}
console.log('Done');
