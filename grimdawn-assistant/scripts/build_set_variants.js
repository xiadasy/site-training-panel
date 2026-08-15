#!/usr/bin/env node
/** Link normal / empowered / mythical set versions that share the same Chinese name. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

function load(rel) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { timeout: 60000 });
  return ctx.window;
}

const sets = load('data_js/sets.js').GD_DATA_SETS || [];
const index = load('data_js/sets_index.js').GD_DATA_SETS_INDEX || [];

function setMyth(s) {
  if (s.mythical) return true;
  const ms = s.members || [];
  return ms.length > 0 && ms.every((m) => m.mythical || m.style?.mythical);
}
function setEmpowered(s) {
  if (setMyth(s)) return false;
  const ms = s.members || [];
  return ms.some((m) => m.style?.empowered);
}
function versionKey(s) {
  if (setMyth(s)) return 'myth';
  if (setEmpowered(s)) return 'empowered';
  return 'normal';
}
function versionLabel(k) {
  return { myth: '神话', empowered: '强化', normal: '普通' }[k] || k;
}

const byName = new Map();
for (const s of sets) {
  const n = (s.nameZh || '').trim();
  if (!n) continue;
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(s);
}

const variantMap = {}; // id -> { family, version, versionZh, siblings:[{id,version,versionZh,level,numId}] }
let familyCount = 0;
for (const [name, arr] of byName.entries()) {
  if (arr.length < 2) continue;
  // need at least two different version keys
  const keyed = arr.map((s) => ({ s, v: versionKey(s) }));
  const keys = new Set(keyed.map((x) => x.v));
  if (keys.size < 2) continue;
  familyCount++;
  const siblings = keyed
    .map(({ s, v }) => ({
      id: s.id,
      numId: s.numId,
      version: v,
      versionZh: versionLabel(v),
      level: s.level,
      pieceCount: s.pieceCount,
      dlcZh: s.dlc?.zh || s.dlcZh || '',
      mythical: v === 'myth',
    }))
    .sort((a, b) => {
      const order = { normal: 0, empowered: 1, myth: 2 };
      return (order[a.version] ?? 9) - (order[b.version] ?? 9) || (a.level || 0) - (b.level || 0);
    });
  for (const sib of siblings) {
    variantMap[sib.id] = {
      family: name,
      version: sib.version,
      versionZh: sib.versionZh,
      siblings: siblings.filter((x) => x.id !== sib.id),
      all: siblings,
    };
  }
}

// also attach into sets objects in memory and rewrite sets.js + sets_index.js lightly via sidecar
const out = {
  generatedAt: new Date().toISOString(),
  familyCount,
  linkedSets: Object.keys(variantMap).length,
  note: '同中文名套装的普通/强化/神话版本关联。例：野兽召唤者的华服 is44(普通) ↔ is82(神话)。',
  map: variantMap,
};
fs.writeFileSync(path.join(root, 'data_js/set_variants.js'), 'window.GD_DATA_SET_VARIANTS = ' + JSON.stringify(out) + ';\n');

// patch index entries with variant meta (rewrite file)
for (const it of index) {
  const v = variantMap[it.id];
  if (!v) {
    it.hasVariants = false;
    continue;
  }
  it.hasVariants = true;
  it.version = v.version;
  it.versionZh = v.versionZh;
  it.variantSiblings = v.siblings;
  it.variantAll = v.all;
  // ensure mythical flag consistent
  if (v.version === 'myth') it.mythical = true;
}
// write sets_index back
fs.writeFileSync(
  path.join(root, 'data_js/sets_index.js'),
  'window.GD_DATA_SETS_INDEX = ' + JSON.stringify(index) + ';\n'
);

// annotate full sets
for (const s of sets) {
  const v = variantMap[s.id];
  if (!v) {
    s.hasVariants = false;
    s.version = versionKey(s);
    s.versionZh = versionLabel(s.version);
    continue;
  }
  s.hasVariants = true;
  s.version = v.version;
  s.versionZh = v.versionZh;
  s.variantSiblings = v.siblings;
  s.variantAll = v.all;
  s.mythical = v.version === 'myth' || !!s.mythical;
}
fs.writeFileSync(path.join(root, 'data_js/sets.js'), 'window.GD_DATA_SETS = ' + JSON.stringify(sets) + ';\n');

console.log('families', familyCount, 'linked', out.linkedSets);
console.log('sample 野兽', variantMap['is44'], variantMap['is82']);
