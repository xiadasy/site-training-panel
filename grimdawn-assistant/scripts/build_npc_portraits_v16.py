#!/usr/bin/env python3
import json,requests,pathlib,re
root=pathlib.Path('/var/minis/workspace/grimdawn-assistant'); outdir=root/'npc_portraits';outdir.mkdir(exist_ok=True)
pages=json.load(open('/tmp/npcwiki_pages.json'))
zh={'Barnabas':'巴纳巴斯','Captain John Bourbon':'约翰·波旁队长','Inquisitor Creed':'审判官克里德','Ulgrim':'乌尔格林','Warden Krieg':'典狱长克里格','Kalderos':'卡尔德罗斯','Direni':'迪瑞尼','Elsa':'艾尔莎','Luther Graves':'路德·格雷夫斯','Korinia':'科琳娜','Riggs':'里格斯','Uroboruuk':'乌罗布鲁克','Sahdina':'萨蒂娜','Spirit Guide':'灵魂向导','Etram Fald - Celestial Smith':'埃特拉姆·法尔德','Hallena - Legion Smith':'哈莱娜','Valdrick - Legion Smith':'瓦尔德里克','Kory the Keeper':'守护者科里','Quade':'奎德','The Messenger':'信使','Malkadarr, Champion of Death\'s Vigil':'死亡守夜人冠军马尔卡达尔','Karros Adal - Wares of the Damned':'卡罗斯·阿达尔','Algosia Fald - Celestial Forge':'阿尔戈西亚·法尔德','Bella Fald - Celestial Forge':'贝拉·法尔德'}
rows=[]
for p in pages:
 title=p.get('title');u=p.get('thumbnail',{}).get('source')
 if not u or title not in zh:continue
 ext='.png' if '.png' in u.lower() else '.jpg'; fn=re.sub(r'[^a-z0-9]+','-',title.lower()).strip('-')+ext
 try:
  r=requests.get(u,timeout=30);r.raise_for_status();(outdir/fn).write_bytes(r.content)
  rows.append({'nameZh':zh[title],'nameEn':title,'image':'npc_portraits/'+fn,'wikiUrl':'https://grimdawn.fandom.com/wiki/'+title.replace(' ','_'),'source':'Grim Dawn Official Wiki'})
 except Exception as e:print('fail',title,e)
(root/'data_js/npc_portraits.js').write_text('window.GD_NPC_PORTRAITS = '+json.dumps({'version':16,'count':len(rows),'note':'真实游戏截图来自 Grim Dawn Official Wiki；并非每个商人/NPC都有可用肖像。','items':rows},ensure_ascii=False,separators=(',',':'))+';\n')
print('downloaded',len(rows),sum((outdir/x['image'].split('/')[-1]).stat().st_size for x in rows))
