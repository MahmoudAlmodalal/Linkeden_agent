#!/usr/bin/env node
import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';

/**
 * LinkedIn OAuth 2.0 Helper Script
 * Exchanges authorization code for 60-day access token and fetches Person URN.
 */

try {
  process.loadEnvFile?.();
} catch {
  // Ignore missing or unreadable .env file
}

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || process.argv[2];
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || process.argv[3];
const PORT = process.env.OAUTH_PORT || 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'w_member_social openid profile email';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log(`
Usage:
  node scripts/get_linkedin_token.mjs <CLIENT_ID> <CLIENT_SECRET>
  Or set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in your environment/.env.
`);
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(
  CLIENT_ID
)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=${encodeURIComponent(SCOPES)}`;

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const code = reqUrl.searchParams.get('code');
    const returnedState = reqUrl.searchParams.get('state');
    const error = reqUrl.searchParams.get('error');
    const errorDescription = reqUrl.searchParams.get('error_description');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Authentication Failed</h1><p>${error}: ${errorDescription}</p>`);
      console.error(`\nOAuth Error: ${error} - ${errorDescription}`);
      server.close();
      process.exit(1);
      return;
    }

    if (returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('State mismatch - potential CSRF detected.');
      server.close();
      process.exit(1);
      return;
    }

    // Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    });

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    const accessToken = tokenData.access_token;
    const expiresInSec = tokenData.expires_in || 5184000; // ~60 days
    const expiryDate = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // Fetch user profile to get person URN (sub)
    let personUrn = null;
    try {
      const userinfoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userinfoRes.ok) {
        const userInfo = await userinfoRes.json();
        if (userInfo.sub) {
          personUrn = `urn:li:person:${userInfo.sub}`;
        }
      }
    } catch (e) {
      console.warn('Could not auto-fetch userinfo:', e.message);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; line-height: 1.6;">
          <h2 style="color: #0a66c2;">✅ LinkedIn Authentication Successful!</h2>
          <p>Access Token retrieved successfully. You can close this browser tab.</p>
          <p>Check your terminal for the generated credentials to paste into <code>.env</code>.</p>
        </body>
      </html>
    `);

    console.log('\n======================================================');
    console.log('✅ LinkedIn OAuth 2.0 Credentials Successfully Retrieved');
    console.log('======================================================\n');
    console.log(`LINKEDIN_ACCESS_TOKEN=${accessToken}`);
    if (personUrn) {
      console.log(`LINKEDIN_PERSON_URN=${personUrn}`);
    }
    console.log(`\n⏳ Token expires at: ${expiryDate} (~${Math.round(expiresInSec / 86400)} days)`);
    console.log('💡 Note: Set a calendar reminder to refresh this token ~7 days before expiry.\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Error: ${err.message}`);
    console.error('Callback handling error:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n🔗 Open the following link in your browser to authorize LinkedIn:');
  console.log(`\n${authUrl}\n`);
  console.log(`Waiting for callback on ${REDIRECT_URI} ... (Press Ctrl+C to cancel)`);
});
