import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarParts, groupEntriesByDate, letterMoment, sentLetterEntries } from '../frontend/calendar.js';

test('calendar dates are calculated in Asia/Shanghai', () => {
  const parts = calendarParts('2026-11-02T16:30:00Z');
  assert.deepEqual(parts, {
    year: 2026,
    month: 11,
    day: 3,
    hour: '00',
    minute: '30',
    key: '2026-11-03',
  });
  assert.equal(calendarParts('2026-11-02T16:30:00').key, '2026-11-03');
});

test('archive includes sent letters and excludes drafts or returned versions', () => {
  const letters = [
    { id: 'published', workflowState: 'published', submittedAt: '2026-11-01T08:00:00Z' },
    { id: 'pending', workflowState: 'pendingReview', submittedAt: '2026-11-02T08:00:00Z' },
    { id: 'private', workflowState: 'private', createdAt: '2026-11-03T08:00:00Z' },
    { id: 'draft', workflowState: 'draft', createdAt: '2026-11-04T08:00:00Z' },
    { id: 'returned', workflowState: 'returnedForEdit', submittedAt: '2026-11-05T08:00:00Z' },
  ];
  assert.equal(letterMoment(letters[2]), '2026-11-03T08:00:00Z');
  assert.deepEqual(sentLetterEntries(letters).map(entry => entry.letter.id), ['private', 'pending', 'published']);
});

test('multiple letters on the same date remain grouped and sorted', () => {
  const entries = sentLetterEntries([
    { id: 'a', workflowState: 'published', submittedAt: '2026-11-02T01:00:00Z' },
    { id: 'b', workflowState: 'private', createdAt: '2026-11-02T03:00:00Z' },
  ]);
  const grouped = groupEntriesByDate(entries);
  assert.deepEqual(grouped.get('2026-11-02').map(entry => entry.letter.id), ['b', 'a']);
});
