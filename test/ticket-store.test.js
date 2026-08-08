const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { TicketStore } = require('../src/ticket-store');

async function createStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyze-ticket-'));
  return { directory, store: new TicketStore(path.join(directory, 'tickets.json')) };
}

test('only one open ticket is allowed per member and server', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const first = await store.createTicket({
    channelId: 'channel-1', guildId: 'guild-1', ownerId: 'user-1', number: 1, subject: 'Help', details: 'Need support', channelName: 'ticket-1-help',
  });
  const duplicate = await store.createTicket({
    channelId: 'channel-2', guildId: 'guild-1', ownerId: 'user-1', number: 2, subject: 'Again', details: 'Need more support', channelName: 'ticket-2-again',
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.ticket.channelId, 'channel-1');
  assert.equal((await store.allocateTicketNumber()), 1);
});

test('closed tickets can be reopened and participants are persisted', async (t) => {
  const { directory, store } = await createStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.createTicket({
    channelId: 'channel-1', guildId: 'guild-1', ownerId: 'user-1', number: 1, subject: 'Help', details: 'Need support', channelName: 'ticket-1-help',
  });
  await store.addParticipant('channel-1', 'user-2');
  await store.closeTicket('channel-1', 'staff-1');
  await store.reopenTicket('channel-1');

  const ticket = await store.getTicket('channel-1');
  assert.equal(ticket.status, 'open');
  assert.deepEqual(ticket.participants, ['user-2']);
});
