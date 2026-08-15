#!/usr/bin/env node
/**
 * Build v12 guides:
 * - attribute / skill / devotion point rules
 * - 10 mastery skill lists + skill icon classes
 * - material/component/potion icon gallery from icon_meta + allItems
 * - monster/NPC name directory from itemdb
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const browser = '/var/minis/browser';

function loadWindow(file) {
  const ctx = { window: {}, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { timeout: 180000 });
  return ctx.window;
}

console.log('load itemdb...');
const w = loadWindow(path.join(browser, '1786770866_itemdb.js'));
console.log('load zh...');
// zh assigns db_l10n_texts['zh']=...
const zhCtx = { window: w, db_l10n_texts: w.db_l10n_texts || {}, console: { log() {}, warn() {}, error() {} } };
vm.createContext(zhCtx);
vm.runInContext(fs.readFileSync(path.join(browser, '1786770866_zh.js'), 'utf8'), zhCtx, {
  timeout: 180000,
});
const texts = (zhCtx.db_l10n_texts && (zhCtx.db_l10n_texts.zh || zhCtx.db_l10n_texts)) || w.db_l10n_texts?.zh || {};
console.log('zh texts', Object.keys(texts).length);

function t(tag) {
  if (!tag) return '';
  return texts[tag] || '';
}

// copy skill sprites into project
const skillDir = path.join(root, 'icons/skills');
fs.mkdirSync(skillDir, { recursive: true });
fs.copyFileSync(path.join(browser, '1786770865_skills.css'), path.join(skillDir, 'skills.css'));
const webpSrc = fs.existsSync(path.join(browser, '1786770872_skills.webp'))
  ? path.join(browser, '1786770872_skills.webp')
  : path.join(browser, '1786770865_skills.webp');
fs.copyFileSync(webpSrc, path.join(skillDir, 'skills.webp'));
// fix css url to local
let skillCss = fs.readFileSync(path.join(skillDir, 'skills.css'), 'utf8');
skillCss = skillCss.replace(/url\((['"]?)[^)'"]*skills\.webp\1\)/g, "url('skills.webp')");
// ensure background image rule exists
if (!/skills\.webp/.test(skillCss)) {
  skillCss = `.skill-icon{background-image:url('skills.webp');background-repeat:no-repeat;display:inline-block}\n` + skillCss;
}
fs.writeFileSync(path.join(skillDir, 'skills.css'), skillCss);

// parse skill css classes
const skillClasses = new Set(
  [...skillCss.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{/g)].map((m) => m[1])
);

const CLASS_META = [
  { id: 1, key: 'soldier', nameZh: '士兵', nameEn: 'Soldier', tag: 'tagClass01SkillName00A', color: '#c4a35a' },
  { id: 2, key: 'demolitionist', nameZh: '爆破者', nameEn: 'Demolitionist', tag: 'tagClass02SkillName00A', color: '#d17a3a' },
  { id: 3, key: 'occultist', nameZh: '神秘学者', nameEn: 'Occultist', tag: 'tagClass03SkillName00', color: '#9b6bb8' },
  { id: 4, key: 'nightblade', nameZh: '夜刃', nameEn: 'Nightblade', tag: 'tagClass04SkillName00', color: '#6aa4c8' },
  { id: 5, key: 'arcanist', nameZh: '奥术师', nameEn: 'Arcanist', tag: 'tagClass05SkillName00', color: '#5b8fdb' },
  { id: 6, key: 'shaman', nameZh: '萨满', nameEn: 'Shaman', tag: 'tagClass06SkillName00', color: '#5faf6e' },
  { id: 7, key: 'inquisitor', nameZh: '审判官', nameEn: 'Inquisitor', tag: 'tagGDX1Class07SkillName00A', color: '#c9b36a', dlc: 'gdx1' },
  { id: 8, key: 'necromancer', nameZh: '死灵法师', nameEn: 'Necromancer', tag: 'tagGDX1Class08SkillName00A', color: '#7d8a9a', dlc: 'gdx1' },
  { id: 9, key: 'oathkeeper', nameZh: '守誓者', nameEn: 'Oathkeeper', tag: 'tagGDX2Class09SkillName00A', color: '#d4c07a', dlc: 'gdx2' },
  { id: 10, key: 'berserker', nameZh: '狂战士', nameEn: 'Berserker', tag: 'tagGDX3Class10SkillName00A', color: '#c45a5a', dlc: 'gdx3' },
];

// skillIcons: tag -> icon class name?
const skillIcons = w.skillIcons || {};
console.log('skillIcons count', Object.keys(skillIcons).length);
const sampleIcon = skillIcons[Object.keys(skillIcons)[0]];
console.log('sample skillIcon value', sampleIcon);

// Build skills per class from tags Class0X
const masterySkills = CLASS_META.map((cls) => {
  const prefix = cls.id <= 6 ? `tagClass${String(cls.id).padStart(2, '0')}SkillName` : null;
  const skills = [];
  for (const [tag, iconVal] of Object.entries(skillIcons)) {
    const isClass =
      (cls.id <= 6 && tag.startsWith(`tagClass${String(cls.id).padStart(2, '0')}SkillName`)) ||
      (cls.id === 7 && tag.includes('Class07SkillName')) ||
      (cls.id === 8 && tag.includes('Class08SkillName')) ||
      (cls.id === 9 && tag.includes('Class09SkillName')) ||
      (cls.id === 10 && tag.includes('Class10SkillName'));
    if (!isClass) continue;
    if (/SkillName00/.test(tag)) continue; // mastery title
    const nameZh = t(tag) || tag;
    const descTag = tag.replace('SkillName', 'SkillDescription');
    const descZh = t(descTag) || '';
    // path like ui/skills/icons/class01/skillicon_cadence1_up.png
    // css class: skills-ui_skills_icons_class01_skillicon_cadence1_up
    let path = '';
    if (typeof iconVal === 'string') path = iconVal;
    else if (iconVal && iconVal.class) path = iconVal.class;
    else if (iconVal && iconVal.icon) path = iconVal.icon;
    else path = String(iconVal || '');
    let iconClass = path.replace(/^\./, '');
    if (iconClass.endsWith('.png')) iconClass = iconClass.slice(0, -4);
    iconClass = 'skills-' + iconClass.replace(/\//g, '_');
    const hasIcon = skillClasses.has(iconClass);
    skills.push({
      tag,
      nameZh,
      descZh: descZh.slice(0, 180),
      iconPath: path,
      iconClass,
      hasIcon,
    });
  }
  // sort by tag
  skills.sort((a, b) => a.tag.localeCompare(b.tag));
  return {
    ...cls,
    nameZh: t(cls.tag) || cls.nameZh,
    skillCount: skills.length,
    skills,
  };
});

// Point rules from playerBio/engine
const bio = w.playerBio || {};
const engine = w.engine || {};
const pointGuide = {
  title: '属性点 · 技能点 · 星座点',
  level: {
    maxLevel: bio.maxLevel || 100,
    note: '满级以当前版本 itemdb 为准',
  },
  attributes: {
    title: '属性点（体魄/体格、灵巧、精神）',
    perLevel: bio.attributePointsIncrement ?? 1,
    maxAttributePoints: bio.maxAttributePoints ?? null,
    questAttributePoints: engine.questAttributePoints || [],
    baseStats: {
      strengthPerPoint: bio.strengthIncrement,
      cunningPerPoint: bio.cunningIncrement,
      spiritPerPoint: bio.spiritIncrement,
      healthPerPhysique: bio.healthIncrement,
      healthPerCunning: bio.healthIncrementCunning,
      healthPerSpirit: bio.healthIncrementSpirit,
      energyPerSpirit: bio.energyIncrement,
    },
    howTo: [
      '每升 1 级获得属性点（默认 1 点，以版本为准）',
      '体魄/体格：提高力量需求满足度、生命与护甲相关收益',
      '灵巧：提高灵巧需求、攻击能力与部分攻击向收益',
      '精神：提高精神需求、能量与施法向收益',
      '任务也会奖励额外属性点（见 questAttributePoints）',
      '洗点：使用属性重置药剂（商人/奖励）',
    ],
    tips: [
      '先点到能穿当前毕业装的力量/灵巧/精神门槛，再按流派堆主属性',
      '双持/远程/法术对三项需求不同，以装备红字需求为准',
      '不要无脑全堆主属性导致穿不上关键散件',
    ],
  },
  skills: {
    title: '技能点（专精树）',
    initial: bio.initialSkillPoints ?? null,
    perLevel: bio.skillPointsIncrement ?? 3,
    maxSkillPoints: bio.maxSkillPoints ?? null,
    questSkillPoints: engine.questSkillPoints || [],
    masteryBar: '每条专精左侧专精条也要投入点数解锁上层技能',
    howTo: [
      '选 1～2 个专精（双修）',
      '技能点用于：专精条解锁 + 具体技能/修饰技能',
      '上层技能通常要专精条达到一定层数才能点',
      '任务奖励额外技能点（见列表）',
      '洗点：技能重置药剂',
    ],
    tips: [
      '先点核心输出循环与生存键，再铺修饰与光环',
      '装备上的 +技能等级能省技能点，可适当少点满',
      '专精条点数本身也提供属性，不是纯浪费',
    ],
  },
  devotion: {
    title: '星座点（天神信仰 / Devotion）',
    maxDevotionPoints: bio.maxDevotionPoints ?? 55,
    howTo: [
      '摧毁世界各处的破碎石碑/神龛（Shrine）获得星座点',
      '普通/精英/终极难度的神龛可分别供奉，总计可拿满星座点',
      '在星座盘上先点外圈小星座攒亲和（Affinity），再点内圈强力星座',
      '星座技能可绑定到默认武器攻击或指定技能上触发',
      '洗点：星座重置药剂（部分任务/商人）',
    ],
    tips: [
      '先规划终局大星座需要的亲和颜色，再倒推外圈',
      '常用思路：一条主输出星座技能 + 生存/抗性/攻击能力节点',
      '详细星座盘请用 GrimTools 计算器对照（本页给规则与点数上限）',
    ],
    grimtools: 'https://www.grimtools.com/calc/',
  },
  rawBio: bio,
};

// Materials from icon_meta + allItems
const iconMeta = JSON.parse(
  fs
    .readFileSync(path.join(root, 'data_js/icon_meta.js'), 'utf8')
    .replace(/^window\.GD_ICON_META\s*=\s*/, '')
    .replace(/;\s*$/, '')
);

function bitmapClass(bitmap) {
  if (!bitmap) return '';
  let a = String(bitmap).replace(/\//g, '_').replace(/[()]/g, '');
  if (a.endsWith('.png')) a = a.slice(0, -4);
  return 'itemdb-' + a;
}

const materials = [];
const seenBmp = new Set();
for (const [id, it] of Object.entries(w.allItems || {})) {
  const cls = it.Class || it.class || '';
  const bmp = it.bitmap || it.previewBitmap || '';
  const nameTag = it.nameTag || it.tag || it.name || '';
  const nameZh = t(nameTag) || nameTag;
  const isMat =
    /ItemArtifact|OneShot_Potion|ItemArtifactFormula|ItemRelic|ItemComponent|ItemEnchantment|QuestItem/i.test(cls) ||
    /craftingparts|components|materials|potion|relic|blueprint|enchant/i.test(bmp);
  if (!isMat) continue;
  const icon = bitmapClass(bmp);
  if (icon && !iconMeta[icon] && !/craftingparts|potion|component|material|relic|enchant|blueprint/i.test(icon)) {
    // skip if no icon and not craft path
  }
  const cat = /potion|Potion|OneShot_Potion/i.test(cls + bmp)
    ? 'potion'
    : /component|Component/i.test(cls + bmp)
      ? 'component'
      : /relic|artifact(?!formula)|ItemRelic|ItemArtifact\b/i.test(cls + bmp)
        ? 'relic'
        : /blueprint|Formula|ArtifactFormula/i.test(cls + bmp)
          ? 'blueprint'
          : /enchant|Enchant/i.test(cls + bmp)
            ? 'enchant'
            : 'material';
  const key = icon || id;
  if (seenBmp.has(key + nameZh)) continue;
  seenBmp.add(key + nameZh);
  materials.push({
    id,
    nameZh: nameZh || id,
    nameTag,
    category: cat,
    className: cls,
    bitmap: bmp,
    iconClass: icon,
    hasIcon: !!(icon && iconMeta[icon]),
    level: it.levelRequirement || it.level || null,
    descZh: (t((nameTag || '') + 'Desc') || t(nameTag + '_Desc') || '').slice(0, 160),
  });
}
// also add pure icon_meta craft entries not in allItems
for (const [cls, meta] of Object.entries(iconMeta)) {
  if (!/craftingparts|components_component|potion|materials_craft|relic/i.test(cls)) continue;
  if (materials.some((m) => m.iconClass === cls)) continue;
  const pathGuess = cls.replace(/^itemdb-/, '').replace(/_/g, '/');
  const base = pathGuess.split('/').pop() || cls;
  let cat = 'material';
  if (/potion/i.test(cls)) cat = 'potion';
  else if (/component/i.test(cls)) cat = 'component';
  else if (/relic/i.test(cls)) cat = 'relic';
  else if (/blueprint/i.test(cls)) cat = 'blueprint';
  materials.push({
    id: cls,
    nameZh: base.replace(/_/g, ' '),
    nameTag: '',
    category: cat,
    className: '',
    bitmap: pathGuess + '.png',
    iconClass: cls,
    hasIcon: true,
    level: null,
    descZh: '',
    fromIconOnly: true,
  });
}
materials.sort((a, b) => a.category.localeCompare(b.category) || a.nameZh.localeCompare(b.nameZh, 'zh'));

// Monsters with zh names
const monsters = [];
for (const [mid, m] of Object.entries(w.monsters || {})) {
  const tag = m.nameTag || m.tag || m.name || '';
  const nameZh = t(tag) || tag || mid;
  const level = m.level || m.actorLevel || null;
  monsters.push({
    id: mid,
    nameZh,
    nameTag: tag,
    level,
    mapUrl: m.mapId ? `https://www.grimtools.com/map/monsters/${String(m.mapId).replace(/\D/g, '')}` : null,
    // portrait not in itemdb sprites usually
    hasPortrait: false,
    rawKeys: Object.keys(m).slice(0, 12),
  });
}
// improve mapUrl from existing directory if present
let oldDir = null;
try {
  oldDir = loadWindow(path.join(root, 'data_js/directory.js')).GD_DATA_DIRECTORY;
} catch {}
const monMapByName = new Map((oldDir?.monsters || []).map((x) => [x.name, x]));
for (const m of monsters) {
  const hit = monMapByName.get(m.nameZh);
  if (hit?.mapUrl) m.mapUrl = hit.mapUrl;
  if (hit?.drops) m.drops = hit.drops;
  if (hit?.sub) m.sub = hit.sub;
}
monsters.sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh'));

// Merchants with names
const merchants = [];
for (const [oid, m] of Object.entries(w.merchants || {})) {
  const tag = m.nameTag || m.tag || m.name || oid;
  const nameZh = t(tag) || t('tagNPC_' + tag) || tag;
  merchants.push({
    id: oid,
    nameZh,
    nameTag: tag,
    mapUrl: /^\d+$/.test(String(oid).replace(/\D/g, ''))
      ? `https://www.grimtools.com/map/objects/${String(oid).replace(/\D/g, '')}`
      : oid.startsWith('o')
        ? `https://www.grimtools.com/map/objects/${oid.slice(1)}`
        : null,
    hasPortrait: false,
  });
}
// merge with directory npcs
if (oldDir?.npcs) {
  for (const n of oldDir.npcs) {
    const hit = merchants.find((x) => x.nameZh === n.name || n.name.includes(x.nameZh));
    if (hit) {
      hit.locations = n.locations;
      hit.mapUrl = n.mapUrl || hit.mapUrl;
      hit.mapUrls = n.mapUrls;
      hit.sells = n.sells;
      hit.sellCount = n.sellCount;
      hit.howToFind = n.howToFind;
    } else {
      merchants.push({
        id: n.id,
        nameZh: n.name,
        locations: n.locations,
        mapUrl: n.mapUrl,
        mapUrls: n.mapUrls,
        sells: n.sells,
        sellCount: n.sellCount,
        howToFind: n.howToFind,
        hasPortrait: false,
      });
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  gameVersion: '1.3.0.6',
  note:
    '技能图标来自 GrimTools skills.webp；材料/组件图标来自 itemdb.webp。NPC/怪物全身立绘不在 itemdb 精灵中，页内用名称+地图+掉落/货物识别；完整模型需游戏内或 Wiki。',
  pointGuide,
  masteries: masterySkills,
  materials: {
    counts: materials.reduce((a, m) => {
      a[m.category] = (a[m.category] || 0) + 1;
      return a;
    }, {}),
    items: materials.filter((m) => m.hasIcon || m.nameZh).slice(0, 2500),
  },
  monsters: {
    count: monsters.length,
    // keep MI-focused subset + search all names lightly
    mi: (oldDir?.monsters || []).map((m) => ({
      nameZh: m.name,
      sub: m.sub,
      mapUrl: m.mapUrl,
      drops: m.drops,
      howToFind: m.howToFind,
      hasPortrait: false,
    })),
    allNamesSample: monsters.slice(0, 500).map((m) => ({ id: m.id, nameZh: m.nameZh, level: m.level })),
  },
  npcs: {
    count: merchants.length,
    items: merchants,
    portraitNote: '当前数据无 NPC 肖像精灵；以名称、位置、出售列表识别。',
  },
};

const outPath = path.join(root, 'data_js/guides.js');
fs.writeFileSync(outPath, 'window.GD_DATA_GUIDES = ' + JSON.stringify(out) + ';\n');
console.log('wrote', outPath, (fs.statSync(outPath).size / 1024 / 1024).toFixed(2), 'MB');
console.log(
  'masteries',
  masterySkills.map((m) => m.nameZh + ':' + m.skillCount)
);
console.log('materials counts', out.materials.counts);
console.log('monsters', monsters.length, 'mi', out.monsters.mi.length, 'npc', merchants.length);
console.log('skill icon sample', masterySkills[0]?.skills?.[0]);
