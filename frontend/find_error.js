const fs = require('fs');
const lines = fs.readFileSync('src/components/CampaignView.tsx', 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const next = lines[i+1] || '';
  const singleQuoteCount = (line.match(/'/g) || []).length;
  if (singleQuoteCount % 2 !== 0 && next.trim().match(/^[0-9a-zA-Z.]/)) {
    console.log(`Line ${i+1}: ${line}`);
    console.log(`Line ${i+2}: ${next}`);
    console.log('---');
  }
}
