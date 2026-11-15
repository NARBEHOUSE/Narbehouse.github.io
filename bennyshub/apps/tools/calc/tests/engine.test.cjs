'use strict';
/* Calculator engine tests (Node only): node --test bennyshub/apps/tools/calc/tests/engine.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../calc-engine.js');

function run(keys) {
  const calc = Calc.create();
  let last = null;
  for (const key of keys) last = calc.press(key);
  return { calc, last, view: calc.view() };
}
const keys = text => text.split(' ').filter(Boolean);

test('order of operations: times before plus', () => {
  const { view, last } = run(keys('2 + 3 * 4 ='));
  assert.equal(view.main, '14');
  assert.equal(view.expression, '2 + 3 × 4 =');
  assert.equal(last.say, '2 plus 3 times 4 equals 14');
});

test('multi-digit numbers, decimals and floating-point noise', () => {
  assert.equal(run(['1', '2', '+', '3', '0', '=']).view.main, '42');
  assert.equal(run(['0', '.', '1', '+', '0', '.', '2', '=']).view.main, '0.3');
  assert.equal(run(['1', '0', '/', '4', '=']).view.main, '2.5');
  assert.equal(run(['1', '/', '3', '=']).view.main, '0.333333333333');
  assert.equal(run(['5', '-', '8', '=']).view.main, '−3');
});

test('digits are grouped with commas', () => {
  assert.equal(run(keys('1 2 3 4 5 6 7')).view.main, '1,234,567');
  assert.equal(run(keys('9 9 9 9 * 9 9 9 9 =')).view.main, '99,980,001');
});

test('live preview while typing', () => {
  assert.equal(run(keys('2 + 3 * 4')).view.preview, '= 14');
  assert.equal(run(keys('2 +')).view.preview, '');
  assert.equal(run(keys('7')).view.preview, '');
});

test('divide by zero shows a friendly message and clear recovers', () => {
  const { calc, view, last } = run(keys('8 / 0 ='));
  assert.equal(view.state, 'error');
  assert.equal(view.main, "Can't divide by 0");
  assert.equal(last.ok, false);
  assert.match(last.say, /can't divide by zero/i);
  calc.press('clear');
  assert.equal(calc.view().main, '0');
  // A digit after an error starts fresh too.
  const again = run(keys('8 / 0 = 5'));
  assert.equal(again.view.main, '5');
  assert.equal(again.view.expression, '5');
});

test('percent: phone-calculator rules', () => {
  assert.equal(run(keys('5 0 + 1 0 % =')).view.main, '55');
  assert.equal(run(keys('5 0 - 1 0 % =')).view.main, '45');
  assert.equal(run(keys('2 0 0 * 5 % =')).view.main, '10');
  assert.equal(run(keys('5 0 % =')).view.main, '0.5');
  assert.equal(run(keys('5 0 %')).view.main, '50%');
  assert.equal(run(keys('5 0 %')).last.say, '50 percent');
  // No digit straight after a percent.
  assert.equal(run(keys('5 % 3')).last.ok, false);
});

test('plus/minus sign toggle', () => {
  assert.equal(run(keys('5 negate')).view.main, '−5');
  assert.equal(run(keys('5 negate negate')).view.main, '5');
  assert.equal(run(keys('3 - negate 5 =')).view.main, '8');
  assert.equal(run(keys('3 - negate 5')).view.expression, '3 − (−5)');
  assert.equal(run(keys('negate 4 =')).view.main, '−4');
  assert.equal(run(keys('negate 4')).last.say, 'negative 4');
});

test('operators replace each other and trailing operators are ignored', () => {
  assert.equal(run(keys('6 + * 2 =')).view.main, '12');
  assert.equal(run(keys('6 + =')).view.main, '6');
  assert.equal(run(keys('+ 3 =')).view.main, '3');
});

test('decimal point rules', () => {
  assert.equal(run(keys('.')).view.main, '0.');
  assert.equal(run(keys('. 5 + . 5 =')).view.main, '1');
  assert.equal(run(keys('1 . 5 .')).last.ok, false);
  assert.equal(run(keys('7 .')).last.say, '7 point');
  assert.equal(run(keys('7 . +')).view.expression, '7 +');
});

test('backspace removes one thing at a time', () => {
  assert.equal(run(keys('1 2 3 del')).view.main, '12');
  assert.equal(run(keys('1 2 + del')).view.expression, '12');
  assert.equal(run(keys('5 % del')).view.main, '5');
  assert.equal(run(keys('negate 5 del')).view.main, '0');
  assert.equal(run(keys('del')).last.ok, false);
  // After "=", the answer becomes editable.
  const { view } = run(keys('6 * 7 = del'));
  assert.equal(view.main, '4');
  assert.equal(view.state, 'typing');
});

test('after equals: digits start fresh, operators keep the answer', () => {
  assert.equal(run(keys('2 + 2 = 9')).view.expression, '9');
  assert.equal(run(keys('2 + 2 = * 3 =')).view.main, '12');
  const repeated = run(keys('2 + 2 = ='));
  assert.equal(repeated.view.main, '4');
  assert.equal(repeated.last.say, '2 plus 2 equals 4');
});

test('digit limit', () => {
  const { calc } = run(Array(15).fill('9'));
  assert.equal(calc.press('9').ok, false);
  assert.equal(calc.view().main, '999,999,999,999,999');
});

test('huge and tiny answers use scientific form and speak sensibly', () => {
  const big = run([...Array(15).fill('9'), '*', ...Array(10).fill('9'), '=']);
  assert.match(big.view.main, /× 10\^24$/);
  assert.match(big.last.say, /times 10 to the power of 24$/);
  const tiny = run(keys('1 / 9 9 9 9 9 9 9 ='));
  assert.match(tiny.view.main, /× 10\^-7$/);
  assert.match(tiny.last.say, /to the power of negative 7$/);
});

test('history keeps finished sums, newest first', () => {
  const { calc } = run(keys('1 + 1 = clear 2 * 3 ='));
  const history = calc.history();
  assert.equal(history.length, 2);
  assert.deepEqual(history.map(h => [h.expression, h.result]), [['2 × 3', '6'], ['1 + 1', '2']]);
});

test('speech for the whole screen', () => {
  assert.equal(Calc.create().speech(), 'zero');
  assert.equal(run(keys('1 2 + 3')).calc.speech(), '12 plus 3');
  assert.equal(run(keys('1 2 + 3 =')).calc.speech(), '12 plus 3 equals 15');
  assert.equal(run(keys('1 2 =')).calc.speech(), '12');
});
