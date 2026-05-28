// Mock Teams Workflow webhook receiver.
//
// Each POST is validated against the Adaptive Card envelope shape and stored
// in memory under the URL path. Tests can:
//   POST /webhook/{any-name}   — same shape as a real Workflows webhook
//   GET  /received             — every payload received, newest first
//   GET  /received/{name}      — payloads for a specific channel
//   POST /reset                — clear stored payloads
//
// Returns 400 if the envelope doesn't match the modern Workflows format so a
// regression in our Go client surfaces in the e2e suite.

import http from 'node:http';

const received = []; // [{ name, at, body }]

function jsonError(res, status, msg) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: msg }));
}

function jsonOk(res, body) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalid: raw };
  }
}

function validateAdaptiveCard(body) {
  if (!body || body.__invalid !== undefined) {
    return 'invalid JSON body';
  }
  if (body.type !== 'message') {
    return `expected type="message", got ${JSON.stringify(body.type)}`;
  }
  if (!Array.isArray(body.attachments) || body.attachments.length === 0) {
    return 'expected non-empty attachments array';
  }
  const att = body.attachments[0];
  if (att.contentType !== 'application/vnd.microsoft.card.adaptive') {
    return `unexpected contentType ${JSON.stringify(att.contentType)}`;
  }
  if (!att.content || att.content.type !== 'AdaptiveCard') {
    return 'attachment.content.type must be AdaptiveCard';
  }
  if (!Array.isArray(att.content.body) || att.content.body.length === 0) {
    return 'card body must be non-empty';
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return jsonOk(res, { ok: true, count: received.length });
  }

  if (req.method === 'GET' && url.pathname === '/received') {
    return jsonOk(res, received);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/received/')) {
    const name = decodeURIComponent(url.pathname.slice('/received/'.length));
    return jsonOk(res, received.filter((r) => r.name === name));
  }

  if (req.method === 'POST' && url.pathname === '/reset') {
    received.length = 0;
    return jsonOk(res, { reset: true });
  }

  if (req.method === 'POST' && url.pathname.startsWith('/webhook/')) {
    const name = decodeURIComponent(url.pathname.slice('/webhook/'.length));
    const body = await readBody(req);
    const err = validateAdaptiveCard(body);
    if (err) {
      console.warn(`[mock-teams] reject ${name}: ${err}`);
      return jsonError(res, 400, err);
    }
    const entry = { name, at: new Date().toISOString(), body };
    received.unshift(entry);
    console.log(`[mock-teams] accepted ${name} (${received.length} total)`);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  return jsonError(res, 404, `no handler for ${req.method} ${url.pathname}`);
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`[mock-teams] listening on :${port}`));
