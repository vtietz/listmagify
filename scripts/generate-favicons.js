#!/usr/bin/env node
/**
 * Favicons build: rasterize SVG icons into PNGs for Apple & favicon sizes.
 * Usage: node scripts/generate-favicons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const iconSvg = path.join(publicDir, 'icon.svg');
const appleSvg = path.join(publicDir, 'apple-icon.svg');

async function ensureFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required source: ${file}`);
  }
}

async function renderPng(inputSvg, outPath, size) {
  await sharp(inputSvg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(outPath);
  console.log(`✓ ${path.basename(outPath)} (${size}x${size})`);
}

(async function main() {
  try {
    await ensureFile(iconSvg);
    await ensureFile(appleSvg);

    // Apple Touch Icon (primary)
    await renderPng(appleSvg, path.join(publicDir, 'apple-icon.png'), 180);

    // Favicons
    await renderPng(iconSvg, path.join(publicDir, 'favicon-32x32.png'), 32);
    await renderPng(iconSvg, path.join(publicDir, 'favicon-16x16.png'), 16);

    // Android Chrome (optional)
    await renderPng(iconSvg, path.join(publicDir, 'android-chrome-192x192.png'), 192);
    await renderPng(iconSvg, path.join(publicDir, 'android-chrome-512x512.png'), 512);

    console.log('\nAll favicons generated to public/.');
  } catch (err) {
    console.error('Failed to build favicons:', err.message);
    process.exit(1);
  }
})();
