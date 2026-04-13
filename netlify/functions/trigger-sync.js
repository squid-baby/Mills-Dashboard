// Dispatches the sync-numbers.yml workflow via GitHub API workflow_dispatch.
// GITHUB_TOKEN must be set in Netlify env vars (actions:write scope).

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = process.env.GH_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, message: 'GH_DISPATCH_TOKEN not configured' }) };
  }

  const res = await fetch(
    'https://api.github.com/repos/squid-baby/Mills-Dashboard/actions/workflows/sync-numbers.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, message: 'Sync triggered' }) };
  }
  const body = await res.text();
  return { statusCode: 502, body: JSON.stringify({ ok: false, message: body }) };
}
