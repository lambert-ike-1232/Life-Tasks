import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeDue, normalizeServerUrl, parseQuickAdd } from './parse.ts';

// Monday 2026-10-26
const MONDAY = new Date(2026, 9, 26);

test('plain title', () => {
  assert.deepEqual(parseQuickAdd('  buy milk  ', MONDAY), { title: 'buy milk' });
});

test('list, workspace and priority tokens', () => {
  assert.deepEqual(parseQuickAdd('Draft Q4 deck #to-do @toyota !high', MONDAY), {
    title: 'Draft Q4 deck',
    list: 'to do',
    workspace: 'toyota',
    priority: 'high',
  });
});

test('bare ! is high priority', () => {
  assert.equal(parseQuickAdd('pay rent !', MONDAY).priority, 'high');
});

test('due dates', () => {
  assert.equal(parseQuickAdd('x ^today', MONDAY).due_date, '2026-10-26');
  assert.equal(parseQuickAdd('x ^tomorrow', MONDAY).due_date, '2026-10-27');
  assert.equal(parseQuickAdd('x ^fri', MONDAY).due_date, '2026-10-30');
  assert.equal(parseQuickAdd('x ^monday', MONDAY).due_date, '2026-11-02'); // next week, not today
  assert.equal(parseQuickAdd('x ^2026-12-01', MONDAY).due_date, '2026-12-01');
});

test('unknown ^word stays in the title', () => {
  assert.deepEqual(parseQuickAdd('raise salary ^someday', MONDAY), { title: 'raise salary ^someday' });
});

test('describeDue', () => {
  assert.deepEqual(describeDue('2026-10-26', MONDAY), { label: 'Today', overdue: false });
  assert.deepEqual(describeDue('2026-10-27', MONDAY), { label: 'Tomorrow', overdue: false });
  assert.equal(describeDue('2026-10-20', MONDAY).overdue, true);
});

test('normalizeServerUrl', () => {
  assert.equal(normalizeServerUrl('192.168.1.20:8000'), 'http://192.168.1.20:8000');
  assert.equal(normalizeServerUrl('https://tasks.example.com/'), 'https://tasks.example.com');
});
