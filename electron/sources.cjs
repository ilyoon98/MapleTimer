const score = (name) => /^maplestory$/i.test(name.trim()) ? 3
  : /maplestory|메이플스토리/i.test(name) && !/ - (chrome|google chrome|edge|microsoft edge)$/i.test(name) ? 2 : 0;
function sortSources(sources) {
  return [...sources].sort((a, b) => score(b.name) - score(a.name) || a.name.localeCompare(b.name, 'ko'));
}
module.exports = { score, sortSources };
