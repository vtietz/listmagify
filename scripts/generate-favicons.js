/**
 * Generate PNG favicons from SVG
 * Run: node scripts/generate-favicons.js
 */

const fs = require('fs');
const path = require('path');

// Simple emerald circle SVG (180x180 for Apple touch icon)
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <circle cx="90" cy="90" r="80" fill="#10b981"/>
</svg>`;

// Create apple-icon.svg (browsers can use SVG for apple-touch-icon)
const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'apple-icon.svg'), appleSvg);

console.log('✅ Generated apple-icon.svg');
console.log('');
console.log('For production, convert to PNG using:');
console.log('  - Online: https://cloudconvert.com/svg-to-png');
console.log('  - CLI: npm install -g sharp-cli && sharp -i public/apple-icon.svg -o public/apple-icon.png');
console.log('');
