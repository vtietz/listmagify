#!/usr/bin/env node

/**
 * Displays important configuration info on startup
 */

const nextAuthUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const redirectUri = `${nextAuthUrl}/api/auth/callback/spotify`;

console.log('\nSpotify Redirect URI: ' + redirectUri);
console.log('Configure at: https://developer.spotify.com/dashboard\n');
