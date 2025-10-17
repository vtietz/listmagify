#!/usr/bin/env node

/**
 * Displays important configuration info on startup
 */

const port = process.env.PORT || '3000';
const redirectUri = `http://127.0.0.1:${port}/api/auth/callback/spotify`;

console.log('\nSpotify Redirect URI: ' + redirectUri);
console.log('Configure at: https://developer.spotify.com/dashboard\n');
