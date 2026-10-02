import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, createApplication } from '../server.js';
import { SampleCatalog } from '../SampleCatalog.js';

test('standalone host serves exact help/font-map files, not other root files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reports-web-resources-'));
  const app = createApplication({ ...config, webRoot: dir }, new SampleCatalog(config.resourceRoot, async () => []));
  try {
    await writeFile(join(dir, 'font-map.json'), '{"version":1}');
    await writeFile(join(dir, 'preview-help.html'), '<!doctype html><title>Reports Web ヘルプ</title>');
    await writeFile(join(dir, 'internal.json'), '{"notPublic":true}');
    app.listen(0, '127.0.0.1'); await once(app, 'listening');
    const base = `http://127.0.0.1:${(app.address() as any).port}/demo/reports.web/`;
    const map = await fetch(base + 'font-map.json');
    assert.equal(map.status, 200); assert.deepEqual(await map.json(), { version: 1 });
    const help = await fetch(base + 'preview-help.html');
    assert.equal(help.status, 200); assert.match(help.headers.get('content-type')!, /text\/html/);
    assert.match(await help.text(), /Reports Web ヘルプ/);
    assert.equal((await fetch(base + 'preview-help.html', { method: 'HEAD' })).status, 200);
    for (const file of ['fontmap.json', 'internal.json', 'preview-help.html.bak', '.env'])
      assert.equal((await fetch(base + file)).status, 404, file);
  } finally {
    app.closeAllConnections();
    if (app.listening) await new Promise<void>(resolve => app.close(() => resolve()));
    await rm(dir, { recursive: true, force: true }); // Own mkdtemp fixture only.
  }
});
