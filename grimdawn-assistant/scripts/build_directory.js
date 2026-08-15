#!/usr/bin/env node
/** Build NPC / monster / faction / blueprint directory from sources + item_details */
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

const det = load('data_js/item_details.js').GD_DATA_ITEM_DETAILS || {};
const src = load('data_js/sources.js').GD_DATA_SOURCES || {};

function itemBrief(id) {
  const it = det[id];
  if (!it) return { id, nameZh: id };
  return {
    id,
    nameZh: it.nameZh || id,
    nameEn: it.nameEn || '',
    rarity: it.rarity || '',
    level: it.level || it.levelReq || null,
    slot: (it.slot && it.slot.zh) || '',
    setId: it.setId || null,
    setNameZh: it.setNameZh || null,
    mythical: !!it.mythical,
  };
}

// ---- NPC / merchant (merge by name) ----
const npcByName = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'npc' && g.type !== 'merchant') continue;
    for (const it of g.items || []) {
      const name = it.text || '未知';
      if (!npcByName.has(name)) {
        npcByName.set(name, {
          id: 'npcn_' + npcByName.size,
          name,
          type: g.type,
          roleZh: g.type === 'merchant' ? '商人' : 'NPC',
          titleZh: g.titleZh || '',
          locations: [],
          mapUrls: [],
          sells: [],
          sellIds: new Set(),
        });
      }
      const n = npcByName.get(name);
      if (it.sub && !n.locations.includes(it.sub)) n.locations.push(it.sub);
      if (it.mapUrl && !n.mapUrls.includes(it.mapUrl)) n.mapUrls.push(it.mapUrl);
      if (!n.sellIds.has(id)) {
        n.sellIds.add(id);
        n.sells.push(itemBrief(id));
      }
    }
  }
}
const npcs = [...npcByName.values()]
  .map((n) => {
    delete n.sellIds;
    n.sellCount = n.sells.length;
    n.sells.sort(
      (a, b) => (b.level || 0) - (a.level || 0) || a.nameZh.localeCompare(b.nameZh, 'zh')
    );
    n.mapUrl = n.mapUrls[0] || null;
    n.howToFind = [
      n.locations.length ? `出现位置：${n.locations.join('、')}` : '位置：数据未标注具体城镇',
      n.mapUrls.length
        ? '地图：可点「地图定位」打开 GrimTools 标注坐标'
        : '地图：暂无坐标锚点，请按城镇名在据点内找同名商人',
      n.type === 'merchant'
        ? '作用：出售下列装备/物品（部分需声望、任务或进度解锁）'
        : '作用：交互型 NPC',
      '怎么去：传送到对应城镇/据点 → 找商人/名单 → 或按 GrimTools 坐标走',
    ];
    return n;
  })
  .sort((a, b) => b.sellCount - a.sellCount || a.name.localeCompare(b.name, 'zh'));

// ---- Monsters (MI) ----
const monMap = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'monster') continue;
    for (const it of g.items || []) {
      const name = it.text || '未知怪物';
      if (!monMap.has(name)) {
        monMap.set(name, {
          id: 'mon_' + monMap.size,
          name,
          sub: it.sub || '',
          mapUrl: it.mapUrl || null,
          drops: [],
          dropIds: new Set(),
          roleZh: '专属掉落怪物',
          type: 'monster',
        });
      }
      const m = monMap.get(name);
      if (it.mapUrl) m.mapUrl = it.mapUrl;
      if (it.sub) m.sub = it.sub;
      if (!m.dropIds.has(id)) {
        m.dropIds.add(id);
        m.drops.push(itemBrief(id));
      }
    }
  }
}
const monsters = [...monMap.values()]
  .map((m) => {
    delete m.dropIds;
    m.dropCount = m.drops.length;
    m.howToFind = [
      m.sub ? `标注：${m.sub}` : '',
      m.mapUrl ? '地图可定位（GrimTools 怪物坐标）' : '暂无地图锚点',
      '作用：击杀掉落下列专属/高相关装备',
      '寻找：点地图定位，或按名称在 GrimTools 地图搜索',
    ].filter(Boolean);
    return m;
  })
  .sort((a, b) => b.dropCount - a.dropCount || a.name.localeCompare(b.name, 'zh'));

// ---- Factions ----
const facMap = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'faction') continue;
    for (const it of g.items || []) {
      const name = it.text || '未知势力';
      if (!facMap.has(name)) {
        facMap.set(name, {
          id: 'fac_' + facMap.size,
          name,
          sub: it.sub || '声望商人/奖励',
          mapUrl: it.mapUrl || null,
          items: [],
          ids: new Set(),
          roleZh: '势力声望',
          type: 'faction',
        });
      }
      const f = facMap.get(name);
      if (!f.ids.has(id)) {
        f.ids.add(id);
        f.items.push(itemBrief(id));
      }
    }
  }
}
const factions = [...facMap.values()]
  .map((f) => {
    delete f.ids;
    f.itemCount = f.items.length;
    f.howToFind = [
      '作用：提升该势力声望后，在对应声望商人处购买/解锁奖励',
      f.sub ? `说明：${f.sub}` : '',
      '寻找：各势力主城/营地声望商人（库恩堡、三巫、巴罗霍尔姆、巫登沼泽等）',
    ].filter(Boolean);
    return f;
  })
  .sort((a, b) => b.itemCount - a.itemCount);

// ---- Blueprints ----
const bpMap = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'blueprint') continue;
    for (const it of g.items || []) {
      const fullName = it.text || '未知设计图';
      const bpName = fullName.replace(/^设计图：/, '').replace(/^Blueprint:\s*/i, '');
      if (!bpMap.has(fullName)) {
        bpMap.set(fullName, {
          id: 'bp_' + bpMap.size,
          name: fullName,
          nameShort: bpName,
          sub: it.sub || '设计图/配方',
          mapUrl: it.mapUrl || null,
          products: [],
          productIds: new Set(),
        });
      }
      const b = bpMap.get(fullName);
      if (!b.productIds.has(id)) {
        b.productIds.add(id);
        b.products.push(itemBrief(id));
      }
    }
  }
}
const blueprints = [...bpMap.values()]
  .map((b) => {
    delete b.productIds;
    b.productCount = b.products.length;
    b.craftWhere = '铁匠 / 背包制作栏（学会设计图后）';
    b.howTo = [
      '1. 先获得该设计图（掉落/商人/任务/箱）',
      '2. 背包中右键 → 学习设计图',
      '3. 打开制作界面或找铁匠，消耗材料生成成品',
      '注：本快照含「设计图→成品」；材料数量以游戏内/GrimTools 物品页为准',
    ];
    return b;
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

// ---- Containers ----
const containers = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'container') continue;
    for (const it of g.items || []) {
      const name = it.text || '容器';
      if (!containers.has(name)) {
        containers.set(name, {
          name,
          mapUrl: it.mapUrl || null,
          items: [],
          ids: new Set(),
          roleZh: '容器/可破坏物',
        });
      }
      const c = containers.get(name);
      if (it.mapUrl) c.mapUrl = it.mapUrl;
      if (!c.ids.has(id)) {
        c.ids.add(id);
        c.items.push(itemBrief(id));
      }
    }
  }
}
const containerList = [...containers.values()]
  .map((c) => {
    delete c.ids;
    c.itemCount = c.items.length;
    c.howToFind = [
      c.mapUrl ? '地图可定位该容器类型刷新点' : '暂无地图锚点',
      '作用：破坏/开启后有机会掉落下列物品',
    ];
    return c;
  })
  .sort((a, b) => b.itemCount - a.itemCount);

// ---- Quest rewards from sources ----
const quests = new Map();
for (const [id, s] of Object.entries(src)) {
  for (const g of s.groups || []) {
    if (g.type !== 'quest') continue;
    for (const it of g.items || []) {
      const name = it.text || '任务';
      if (!quests.has(name)) quests.set(name, { name, sub: it.sub || '', items: [] });
      quests.get(name).items.push(itemBrief(id));
    }
  }
}

// ---- Built-in craft/mat guide (game basics, not full db) ----
const craftGuide = {
  title: '制作与材料 · 基础说明',
  summary:
    '恐怖黎明里「材料」多用于铁匠制作、设计图、圣物与附魔；「药剂」是战斗中喝的消耗品。当前装备快照未收录全部材料/药剂条目，这里先给常用逻辑 + 可检索的设计图成品关系。',
  materials: [
    {
      name: '废料 / Scrap',
      role: '最基础的通用材料',
      uses: ['铁匠拆解装备产出', '多种低中阶制作与修复相关消耗'],
      how: '打怪掉落、拆解白/蓝装、商人偶尔有售',
    },
    {
      name: '奥术精华 / Aetherial clusters 等精华类',
      role: '中高阶制作与圣物组件',
      uses: ['设计图成品', '圣物合成', '部分附魔/组件'],
      how: '对应主题区域怪物与宝箱；高阶图更吃特定精华',
    },
    {
      name: '组件材料（血、骨、皮、铁、晶体…）',
      role: '武器/防具组件与设计图原料',
      uses: ['插入装备的组件', '设计图配方'],
      how: '按材料主题刷对应怪物族；看设计图 tooltip 列出的材料',
    },
    {
      name: '势力信物 / 徽章类',
      role: '声望与势力商人兑换',
      uses: ['声望任务', '势力商店解锁高级货'],
      how: '做该势力任务、交任务物品、刷该势力敌对目标',
    },
  ],
  potions: [
    {
      name: '生命药水',
      role: '战斗回血',
      uses: ['主线/精英/终极都必备', '高阶图要更高阶药水'],
      how: '炼金商人购买；部分任务奖励；可快捷键',
    },
    {
      name: '能量药水',
      role: '回能量（蓝）',
      uses: ['法术/技能流续航'],
      how: '炼金商人；与生命药同分栏快捷键',
    },
    {
      name: '抗性临时药剂 / 油类',
      role: '短时提高抗性或伤害',
      uses: ['进凶险区域前预喝', 'Boss 战缓冲'],
      how: '炼金/特殊商人；看描述中的抗性类型',
    },
    {
      name: '净化 / 解控类消耗品',
      role: '解异常或防控制',
      uses: ['高控制图、PvE 机制战'],
      how: '商人与制作；按当前版本 tooltip',
    },
  ],
  blacksmith: [
    '铁匠位置：各大主城与重要据点（如恶魔十字、库恩堡等）',
    '功能：制造（已学设计图）、拆解装备产材料、有时重锻/其它服务随进度解锁',
    '设计图：背包右键学习 → 制作列表出现对应成品',
    '材料不够时：按设计图 tooltip 点材料名看获取，或去对应区域刷怪/拆装',
  ],
  tips: [
    '搜「设计图」页：看哪个图能做出哪件装备',
    '搜「NPC」页：看谁卖什么、在哪个镇、怎么过去',
    '装备详情里的「获取来源」：怪物/商人/箱/随机/势力会写在部件下',
    '点「地图」若在 App 内无反应：已改为复制链接 + 系统浏览器打开',
  ],
};

const directory = {
  generatedAt: new Date().toISOString(),
  note: '由 sources.js + item_details.js 汇总。完整材料/药剂数值库需另接 itemdb 消耗品表。',
  counts: {
    npcs: npcs.length,
    monsters: monsters.length,
    factions: factions.length,
    blueprints: blueprints.length,
    containers: containerList.length,
    questRewards: quests.size,
  },
  npcs,
  monsters,
  factions,
  blueprints,
  containers: containerList,
  questRewards: [...quests.values()],
  craftGuide,
};

const out = path.join(root, 'data_js/directory.js');
fs.writeFileSync(out, 'window.GD_DATA_DIRECTORY = ' + JSON.stringify(directory) + ';\n');
console.log('OK', directory.counts, 'MB', (fs.statSync(out).size / 1024 / 1024).toFixed(2));
