const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { BlacklistStore } = require('../src/blacklist-store');

async function createStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyze-bot-'));
  return {
    directory,
    store: new BlacklistStore(path.join(directory, 'blacklists.json')),
  };
}

test('member blacklists are scoped to the Discord server', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const record = await store.addMember('guild-a', 'user-1', {
    reason: 'Evidence attached to case 42',
    addedBy: 'moderator-1',
  });

  assert.equal(record.id, 'user-1');
  assert.equal((await store.getMember('guild-a', 'user-1')).reason, 'Evidence attached to case 42');
  assert.equal(await store.getMember('guild-b', 'user-1'), null);
  assert.equal(await store.removeMember('guild-a', 'user-1'), true);
  assert.equal(await store.getMember('guild-a', 'user-1'), null);
});

test('global server blacklists persist across store instances', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.addGuild('123456789012345678', {
    reason: 'Confirmed abusive server',
    addedBy: 'moderator-1',
  });

  const restartedStore = new BlacklistStore(path.join(directory, 'blacklists.json'));
  const record = await restartedStore.getGuild('123456789012345678');
  assert.equal(record.reason, 'Confirmed abusive server');
  assert.equal(record.addedBy, 'moderator-1');
});

test('findMemberAcrossGuilds surfaces a member\'s records from every guild', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.addMember('guild-a', 'user-1', { reason: 'Scam links posted', addedBy: 'moderator-1' });
  await store.addMember('guild-b', 'user-1', { reason: 'Alt account of known scammer', addedBy: 'moderator-2' });
  await store.addMember('guild-a', 'user-2', { reason: 'Unrelated member', addedBy: 'moderator-1' });

  const results = await store.findMemberAcrossGuilds('user-1');
  assert.equal(results.length, 2);
  const guildIds = results.map((r) => r.guildId).sort();
  assert.deepEqual(guildIds, ['guild-a', 'guild-b']);
  assert.equal(await (await store.findMemberAcrossGuilds('user-3')).length, 0);
});
