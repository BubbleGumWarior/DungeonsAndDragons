const fs = require('fs');
const lines = fs.readFileSync('src/components/CampaignView.tsx', 'utf8').split('\n');
const line12358 = lines[12357]; // 0-indexed
console.log('Length:', line12358.length);
console.log('Char at 72:', JSON.stringify(line12358[72]));
console.log('Chars 65-80:', JSON.stringify(line12358.slice(65, 80)));
console.log('Full line:', JSON.stringify(line12358));
