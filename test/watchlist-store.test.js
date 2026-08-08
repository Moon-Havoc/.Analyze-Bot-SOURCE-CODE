const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WatchlistStore } = require('../src/watchlist-store');

async function createStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyze-watchlist-'));
  return {
    directory,
    store: new WatchlistStore(path.join(directory, 'watchlists.json')),
  };
}

test('member flags are scoped to the Discord server', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const record = await store.addMember('guild-a', 'user-1', {
    reason: 'Suspicious alt account activity',
    addedBy: 'moderator-1',
  });

  assert.equal(record.userId, 'user-1');
  assert.equal((await store.getMember('guild-a', 'user-1')).reason, 'Suspicious alt account activity');
  assert.equal(await store.getMember('guild-b', 'user-1'), null);
  assert.equal(await store.removeMember('guild-a', 'user-1'), true);
  assert.equal(await store.getMember('guild-a', 'user-1'), null);
});

test('server flags persist across store instances', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.addGuild('123456789012345678', {
    reason: 'Reports of coordinated raids',
    addedBy: 'moderator-1',
  });

  const restartedStore = new WatchlistStore(path.join(directory, 'watchlists.json'));
  const record = await restartedStore.getGuild('123456789012345678');
  assert.equal(record.reason, 'Reports of coordinated raids');
  assert.equal(record.addedBy, 'moderator-1');
});

test('notes can be appended to an existing member flag', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.addMember('guild-a', 'user-1', { reason: 'Initial flag', addedBy: 'moderator-1' });
  const note = await store.addNote('member', 'guild-a:user-1', { authorId: 'moderator-2', text: 'Followed up, still suspicious' });

  assert.equal(note.text, 'Followed up, still suspicious');
  const record = await store.getMember('guild-a', 'user-1');
  assert.equal(record.notes.length, 1);
  assert.equal(record.notes[0].authorId, 'moderator-2');
});

test('adding a note to a non-existent flag returns null', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const result = await store.addNote('member', 'guild-a:missing-user', { authorId: 'moderator-1', text: 'n/a' });
  assert.equal(result, null);
});

test('findMemberAcrossGuilds surfaces a member\'s flags from every guild', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.addMember('guild-a', 'user-1', { reason: 'Suspicious in server A', addedBy: 'moderator-1' });
  await store.addMember('guild-b', 'user-1', { reason: 'Suspicious in server B', addedBy: 'moderator-2' });
  await store.addMember('guild-a', 'user-2', { reason: 'Unrelated member', addedBy: 'moderator-1' });

  const results = await store.findMemberAcrossGuilds('user-1');
  assert.equal(results.length, 2);
  const guildIds = results.map((r) => r.guildId).sort();
  assert.deepEqual(guildIds, ['guild-a', 'guild-b']);
  assert.equal(await (await store.findMemberAcrossGuilds('user-3')).length, 0);
});
