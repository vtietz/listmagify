#!/usr/bin/env node

/**
 * Displays important configuration info on startup
 */

const port = process.env.PORT || '3000';
const redirectUri = `http://127.0.0.1:${port}/api/auth/callback/spotify`;

console.log('\n' + '='.repeat(80));
console.log('🎵  Spotify Playlist Editor - Configuration');
console.log('='.repeat(80));
console.log(`\n📍 App URL: http://127.0.0.1:${port}`);
console.log(`\n🔗 Spotify Redirect URI (configure in Spotify Developer Console):`);
console.log(`\n   ${redirectUri}`);
console.log(`\n   👉 Dashboard: https://developer.spotify.com/dashboard`);
console.log('='.repeat(80) + '\n');
