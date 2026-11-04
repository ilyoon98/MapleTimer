const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sortSources, score } = require('./sources.cjs');
test('게임과 게임명이 있는 브라우저 페이지를 구분하고 원본 목록은 보존한다', () => {
  const rows = [{name:'메이플스토리 - Chrome'}, {name:'Discord'}, {name:'MapleStory'}];
  assert.equal(sortSources(rows)[0].name, 'MapleStory');
  assert.equal(rows[0].name, '메이플스토리 - Chrome');
  assert.equal(score(rows[0].name), 0);
});
