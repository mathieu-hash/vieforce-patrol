const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, escapeAttr } = require('../../js/_util/escape.js');

test('escapeHtml: null and undefined → ""', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: numeric 0 is preserved (regression — old _esc returned "")', () => {
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml: empty string → ""', () => {
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: plain ASCII is unchanged', () => {
  assert.equal(escapeHtml('Golden Feed Supply'), 'Golden Feed Supply');
});

test('escapeHtml: ampersand → &amp;', () => {
  assert.equal(escapeHtml('A & B'), 'A &amp; B');
});

test('escapeHtml: angle brackets → &lt; &gt;', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml: double-quote → &quot;', () => {
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
});

test('escapeHtml: single-quote → &#39;', () => {
  assert.equal(escapeHtml("don't"), 'don&#39;t');
});

test('escapeHtml: forward-slash → &#x2F; (defense for </script> contexts)', () => {
  assert.equal(escapeHtml('a/b'), 'a&#x2F;b');
});

test('escapeHtml: full XSS payload neutralised', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const out = escapeHtml(payload);
  assert.equal(out, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('>'));
});

test('escapeHtml: surrogate-pair emoji preserved', () => {
  // U+1F4F7 (camera): two-code-unit surrogate pair must survive intact.
  assert.equal(escapeHtml('📷 ok'), '📷 ok');
});

test('escapeHtml: number type coerces via String()', () => {
  assert.equal(escapeHtml(42), '42');
});

test('escapeAttr: handles &<>" but leaves single-quotes alone (double-quoted attr context)', () => {
  assert.equal(escapeAttr('a"b'), 'a&quot;b');
  assert.equal(escapeAttr('<x>'), '&lt;x&gt;');
  assert.equal(escapeAttr("don't"), "don't");
});

test('escapeAttr: null → ""', () => {
  assert.equal(escapeAttr(null), '');
  assert.equal(escapeAttr(undefined), '');
});

test('escapeAttr: numeric 0 preserved', () => {
  assert.equal(escapeAttr(0), '0');
});
