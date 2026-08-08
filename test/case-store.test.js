const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CaseStore } = require('../src/case-store');

async function createStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyze-case-'));
  return { directory, store: new CaseStore(path.join(directory, 'cases.json')) };
}

test('case numbers increment and are scoped to the Discord server', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const first = await store.createCase({
    guildId: 'guild-a', subject: 'Alt account ring', details: 'Multiple linked accounts', openedBy: 'staff-1',
  });
  const second = await store.createCase({
    guildId: 'guild-a', subject: 'Scam reports', details: 'Several DM scam reports', openedBy: 'staff-1',
  });

  assert.equal(first.number, 1);
  assert.equal(second.number, 2);
  assert.equal(first.status, 'open');
  assert.equal(await store.getCase('guild-b', first.number), null);
  assert.equal((await store.getCase('guild-a', first.number)).subject, 'Alt account ring');
});

test('closing a case records verdict and prevents double close', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const created = await store.createCase({
    guildId: 'guild-a', subject: 'Alt account ring', details: 'Multiple linked accounts', openedBy: 'staff-1',
  });
  const closed = await store.closeCase('guild-a', created.number, { closedBy: 'staff-2', verdict: 'Confirmed, member banned' });

  assert.equal(closed.status, 'closed');
  assert.equal(closed.verdict, 'Confirmed, member banned');
  assert.equal(closed.closedBy, 'staff-2');
  assert.equal(await store.closeCase('guild-a', created.number, { closedBy: 'staff-2', verdict: 'again' }), null);
});

test('notes and linked subjects accumulate on a case', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const created = await store.createCase({
    guildId: 'guild-a', subject: 'Alt account ring', details: 'Multiple linked accounts', openedBy: 'staff-1',
  });
  await store.addNote('guild-a', created.number, { authorId: 'staff-1', text: 'Found a third linked account' });
  await store.linkId('guild-a', created.number, 'user-99');
  await store.linkId('guild-a', created.number, 'user-99'); // duplicate should be ignored

  const record = await store.getCase('guild-a', created.number);
  assert.equal(record.notes.length, 1);
  assert.deepEqual(record.linkedIds, ['user-99']);
});

test('findCasesByLinkedId returns cases scoped to the guild, newest first', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const first = await store.createCase({
    guildId: 'guild-a', subject: 'First case', details: 'details', openedBy: 'staff-1',
  });
  const second = await store.createCase({
    guildId: 'guild-a', subject: 'Second case', details: 'details', openedBy: 'staff-1',
  });
  await store.linkId('guild-a', first.number, 'user-1');
  await store.linkId('guild-a', second.number, 'user-1');

  const linked = await store.findCasesByLinkedId('guild-a', 'user-1');
  assert.equal(linked.length, 2);
  assert.equal(linked[0].number, second.number);
  assert.equal(await (await store.findCasesByLinkedId('guild-b', 'user-1')).length, 0);
});
