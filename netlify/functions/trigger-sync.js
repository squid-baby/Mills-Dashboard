// Dispatches the sync-numbers.yml workflow via GitHub API workflow_dispatch.
// GITHUB_TOKEN must be set in Netlify env vars (actions:write scope).

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return new Response('GITHUB_TOKEN not configured', { status: 500 });

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
    return Response.json({ ok: true, message: 'Sync triggered' });
  }
  const body = await res.text();
  return Response.json({ ok: false, message: body }, { status: 502 });
};

export const config = { path: '/api/trigger-sync' };
