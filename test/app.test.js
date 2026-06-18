const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('createApp builds an Express application without opening a database connection', () => {
  const app = createApp();

  assert.equal(typeof app.handle, 'function');
  assert.equal(app.get('view engine'), 'hbs');
});

test('createApp serves the local Bootstrap stylesheet', async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/vendor/bootstrap/css/bootstrap.min.css`);
  const stylesheet = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/css/);
  assert.match(stylesheet, /--bs-body-font-family/);
});

test('createApp exposes an unauthenticated health check', async (t) => {
  const app = createApp();
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: 'ok' });
});
