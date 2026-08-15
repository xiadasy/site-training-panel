#!/usr/bin/env python3
import json, pathlib
O='/var/minis/workspace/grimdawn-assistant/data_js'
classes={1:('士兵','Soldier'),2:('爆破者','Demolitionist'),3:('神秘学者','Occultist'),4:('夜刃','Nightblade'),5:('奥术师','Arcanist'),6:('萨满','Shaman'),7:('审判官','Inquisitor'),8:('死灵法师','Necromancer'),9:('守誓者','Oathkeeper'),10:('狂战士','Berserker')}
# 每个专精的“傻瓜式核心包”：主攻 / 辅助 / 生存
packs={
1:{'physical':(['力场波','裂甲之力','内部创伤'],['战吼','战争号令','小队战术'],['军事素养','久经沙场','百战之躯']),'melee':(['节奏打击','马尔科夫优势','佐尔汉的技艺'],['奥莱隆之怒','战意','闪击'],['军事素养','曼海尔的意志','战争号令'])},
2:{'fire':(['火焰打击','爆裂打击','炽烈硫磺'],['铝热地雷','地狱火地雷','附身烈焰'],['闪光弹','回火','复仇烈焰']),'bomb':(['罐式炸弹','手榴弹','黑水鸡尾酒'],['铝热地雷','痛苦烈焰','迫击抛射炮'],['闪光弹','防爆护盾','复仇烈焰'])},
3:{'pet':(['召唤乌鸦','召唤地狱犬','掌控'],['拜斯迈的羁绊','虚弱诅咒','易伤'],['德里格之血','守护者之躯','附身']),'vitality':(['噬命魔印','血瘟疫','黑死病'],['虚弱诅咒','易伤','末日闪电'],['德里格之血','守护者之躯','附身']),'acid':(['德里格的邪眼','血爆','邪物喷涌'],['虚弱诅咒','易伤','索拉尔的巫火'],['德里格之血','守护者之躯','附身'])},
4:{'cold':(['暗影袭','钢铁之环','寒霜之环'],['暗影面纱','夜之寒气','刀灵'],['气爆','暗影舞','刀锋壁障']),'pierce':(['双刃','贝尔戈斯安的切割','处决'],['暗影面纱','致命突袭','钢铁之环'],['气爆','暗影舞','刀锋壁障']),'vitality':(['幻影刀','寻心击','幽冥刃'],['暗影面纱','夜之寒气','无情终章'],['气爆','暗影舞','刀锋壁障'])},
5:{'aether':(['阿尔布雷特的虚化射线','崩解','毁灭'],['狂野之力','心智迅捷','净化'],['麦文的守护领域','艾瑞奥特之镜','奥术意志']),'cold':(['特洛赞的天之裂片','冰封之核','碎裂星体'],['星之契约','奥莱克希拉的急速冻结','绝对零度'],['麦文的守护领域','艾瑞奥特之镜','净化']),'elemental':(['帕内蒂的复制飞弹','超压','激射'],['伊斯坎德拉的元素转换','元素平衡','心智迅捷'],['麦文的守护领域','艾瑞奥特之镜','奥术意志'])},
6:{'lightning':(['原始打击','风暴潮','雷电打击'],['风之恶魔','狂风暴雨','风暴召唤者的契约'],['莫格卓根的契约','橡树皮','温迪戈图腾']),'vitality':(['吞噬虫群','温迪戈图腾','血之契约'],['风之恶魔','腐化风暴','紧缚藤蔓'],['莫格卓根的契约','野性之心','原始羁绊']),'pet':(['召唤荆棘兽','召唤原始之灵','原始羁绊'],['莫格卓根的契约','橡树皮','激励风采'],['温迪戈图腾','野性之心','吞噬虫群'])},
7:{'ranged':(['远程专家','爆裂子弹','风暴散射'],['武器之语','致命瞄准','责难光环'],['审判官秘印','重生之语','钢铁决心']),'elemental':(['艾尔格洛斯的风暴之盒','闪电绳链','阿拉加斯特的奥术织网'],['痛苦之语','死亡判决','责难光环'],['审判官秘印','重生之语','钢铁决心']),'fire':(['伊格纳法之焰','增强','地狱肃清'],['痛苦之语','死亡判决','责难光环'],['审判官秘印','重生之语','钢铁决心'])},
8:{'pet':(['骷髅复生','不死军团','召唤疫病恶魔'],['死亡主宰','坟墓呼唤','幽灵束缚'],['折磨印记','恶兆','幽灵之怒']),'vitality':(['吸取精华','饥渴之触','分解'],['骨刺收割','灵魂收割','灵魂虹吸'],['折磨印记','恶兆','幽灵束缚']),'aether':(['贪婪大地','腐烂','腐臭喷发'],['骨刺收割','灵魂收割','幽灵之怒'],['折磨印记','恶兆','幽灵束缚'])},
9:{'fire':(['正义狂热','圣化','惩戒'],['召唤至高神守护者','天神化身','美德降临'],['升华','庇护','坚毅']),'acid':(['德里格的斥责','审判','粉碎裁决'],['召唤至高神守护者','德里格之嗣','三巫神之路'],['升华','庇护','坚毅']),'shield':(['曼海尔神盾','复仇之盾','报复'],['美德降临','斥责','神圣使命'],['升华','庇护','坚毅'])},
10:{'cold':(['冰川之爪','永冬','冰暴'],['鸦人形态','阿玛托克契约','寒冰入体'],['集结战吼','血源苏醒','不羁狂怒']),'bleed':(['狼人形态','贪噬','血莽'],['猛袭','开裂创口','血性狂热'],['集结战吼','战意澎湃','野兽形态']),'physical':(['跃击','地裂波','雪崩'],['狼人形态','战争兵器','无尽狂怒'],['集结战吼','血源苏醒','不羁狂怒'])}}
D={
'physical':{'label':'物理/创伤','attr':'体魄为主；灵巧只补武器需求','route':['岔路口·黄','刺客之刃（绑定主攻）','海怪（双手）或盾女','乌龟','食尸鬼','奥莱隆'],'bind':'刺客印记→主攻技能；食尸鬼被动保命','gear':['物理','创伤','抗性降低','攻击能力']},
'fire':{'label':'火焰/燃烧','attr':'体魄保生存；精神补法器需求','route':['岔路口·绿','蜘蛛','蝰蛇','索拉尔巫刃（绑定高频技能）','火炬','食尸鬼/乌龟'],'bind':'索拉尔巫火→高频技能；火炬→范围技能','gear':['火焰','燃烧','元素抗性降低','施法速度']},
'lightning':{'label':'闪电/电击','attr':'体魄为主；灵巧补武器需求','route':['岔路口·绿','猎鹰/海啸','蝰蛇','寡妇（绑定风之恶魔等高频技能）','海怪（双手）','风暴牧羊人'],'bind':'奥术炸弹→风之恶魔/高频技能','gear':['闪电','电击','元素抗性降低','攻击速度']},
'cold':{'label':'冰冷/霜燃','attr':'体魄为主；灵巧满足双持，法系补精神','route':['岔路口·绿','海啸','蝰蛇','穆谟（绑定主攻）','利维坦','食尸鬼/乌龟'],'bind':'谣言→主攻；暴雪→范围技能','gear':['冰冷','霜燃','抗性降低','攻击能力']},
'acid':{'label':'酸毒/毒素','attr':'体魄为主；灵巧满足武器','route':['岔路口·绿','蝎子','毒蛇','穆谟（绑定主攻）','憎恶','食尸鬼'],'bind':'谣言→高频主攻；酸雾→范围技能','gear':['酸毒','毒素','抗性降低','攻击速度']},
'vitality':{'label':'活力/活力衰减','attr':'体魄为主；精神只补法器需求','route':['岔路口·红','蝙蝠（绑定高频技能）','豺狼','温迪戈','拉托什法杖','垂死之神'],'bind':'双生之牙→高频技能；温迪戈标记→范围技能','gear':['活力','活力衰减','抗性降低','施法速度']},
'aether':{'label':'虚化','attr':'体魄优先，精神满足法器后继续体魄','route':['岔路口·绿','蝰蛇','寡妇（绑定高频技能）','奥术风暴','垂死之神','乌龟'],'bind':'奥术炸弹→高频技能；生存触发留被动','gear':['虚化','虚化抗性降低','施法速度','能量回复']},
'pierce':{'label':'穿刺/双持','attr':'体魄与灵巧约 2:1，先满足武器','route':['岔路口·绿','猎鹰','刺客之刃','无名战士','食尸鬼','奥莱隆'],'bind':'刺客印记→主攻；暗影战士→范围技能','gear':['穿刺','攻击速度','攻击能力','抗性降低']},
'ranged':{'label':'双枪/远程元素','attr':'体魄为主；灵巧满足枪械','route':['岔路口·绿','蝰蛇','海啸/小恶魔','海德拉','寡妇或索拉尔巫刃','食尸鬼'],'bind':'降抗星座→高频射击；范围星座→武器池技能','gear':['远程','攻击速度','元素伤害','抗性降低']},
'pet':{'label':'召唤宠物','attr':'几乎全体魄；属性只为穿装备','route':['岔路口·紫','牧羊杖（绑定诅咒/虫群）','渡鸦','豹','莫格卓根狼','伊什塔克/拜斯迈羁绊'],'bind':'牧羊呼唤→可主动频繁施放的辅助技能；宠物星座→宠物攻击','gear':['宠物伤害','宠物抗性','宠物速度','全技能']},
'elemental':{'label':'元素施法','attr':'体魄为主；精神满足法器','route':['岔路口·绿','蝰蛇','小恶魔','海啸','盲眼贤者','乌龟'],'bind':'元素风暴→高频技能；元素探寻者→范围技能','gear':['元素伤害','施法速度','抗性降低','能量回复']},
'bleed':{'label':'流血/创伤','attr':'体魄为主；灵巧补武器需求','route':['岔路口·绿','猎鹰','猎犬','狩猎女神','莫格卓根狼','食尸鬼'],'bind':'猎鹰俯冲→主攻；狩猎女神→范围技能','gear':['流血','持续伤害','抗性降低','攻击速度']},
'bomb':{'label':'炸弹/迫击炮','attr':'体魄为主；精神满足副手','route':['岔路口·绿','小恶魔','蝰蛇','索拉尔巫刃','火炬','乌龟'],'bind':'降抗→地雷/鸡尾酒；火炬→炸弹','gear':['火焰','燃烧','技能冷却','施法速度']},
'melee':{'label':'近战普攻','attr':'体魄为主；灵巧满足武器','route':['岔路口·黄','刺客之刃','食尸鬼','海怪（双手）','奥莱隆','乌龟'],'bind':'刺客印记→主攻；保命星座保持被动','gear':['攻击速度','武器伤害','攻击能力','抗性']},
'shield':{'label':'盾击/反击','attr':'几乎全体魄；灵巧只补装备','route':['岔路口·黄','铁锤','盾女','铁匠','方尖碑','生命树'],'bind':'攻击星座→曼海尔神盾；防御星座被动','gear':['盾牌','反击','物理','格挡恢复']}}
# 45 双修：中文显示名、推荐流派类型（第一条为最省心）
combos={
'1-2':('突击兵','Commando',['physical','fire','bomb']),'1-3':('巫刃','Witchblade',['physical','vitality','acid']),'1-4':('剑圣','Blademaster',['pierce','cold','physical']),'1-5':('战斗法师','Battlemage',['aether','physical','elemental']),'1-6':('守望者','Warder',['lightning','physical','bleed']),'1-7':('战术家','Tactician',['ranged','physical','elemental']),'1-8':('死亡骑士','Death Knight',['aether','physical','vitality']),'1-9':('战争领主','Warlord',['physical','shield','fire']),'1-10':('无畏者','Dreadnaught',['physical','bleed','cold']),
'2-3':('烈焰术士','Pyromancer',['fire','ranged','pet']),'2-4':('破坏者','Saboteur',['cold','fire','bomb']),'2-5':('巫术师','Sorcerer',['fire','elemental','aether']),'2-6':('元素使','Elementalist',['lightning','fire','bomb']),'2-7':('净化者','Purifier',['ranged','fire','elemental']),'2-8':('污染者','Defiler',['fire','aether','vitality']),'2-9':('破盾者','Shieldbreaker',['fire','shield','bomb']),'2-10':('原初者','Primalist',['fire','physical','cold']),
'3-4':('巫猎','Witch Hunter',['acid','cold','vitality']),'3-5':('术士','Warlock',['vitality','aether','elemental']),'3-6':('咒术师','Conjurer',['pet','vitality','lightning']),'3-7':('欺诈者','Deceiver',['vitality','elemental','ranged']),'3-8':('秘术师','Cabalist',['pet','vitality','aether']),'3-9':('哨兵','Sentinel',['acid','vitality','shield']),'3-10':('秘法者','Mystic',['bleed','acid','cold']),
'4-5':('破法者','Spellbreaker',['cold','elemental','aether']),'4-6':('诡术师','Trickster',['cold','bleed','lightning']),'4-7':('渗透者','Infiltrator',['cold','pierce','elemental']),'4-8':('收割者','Reaper',['cold','vitality','aether']),'4-9':('德维什','Dervish',['acid','fire','pierce']),'4-10':('织幕者','Veilwalker',['cold','bleed','pierce']),
'5-6':('德鲁伊','Druid',['cold','lightning','elemental']),'5-7':('法术猎手','Mage Hunter',['aether','elemental','cold']),'5-8':('缚法者','Spellbinder',['aether','vitality','pet']),'5-9':('圣殿骑士','Templar',['fire','aether','shield']),'5-10':('唤法者','Evoker',['cold','elemental','aether']),
'6-7':('召唤者','Vindicator',['lightning','ranged','vitality']),'6-8':('祭司','Ritualist',['pet','vitality','lightning']),'6-9':('执政官','Archon',['lightning','physical','fire']),'6-10':('符文守卫','Runekeeper',['cold','lightning','bleed']),
'7-8':('使徒','Apostate',['aether','vitality','ranged']),'7-9':('圣骑士','Paladin',['fire','ranged','shield']),'7-10':('狂信者','Zealot',['cold','ranged','bleed']),
'8-9':('压迫者','Oppressor',['vitality','aether','shield']),'8-10':('掠夺者','Reaver',['vitality','cold','pet']),'9-10':('领主','Thane',['physical','cold','bleed'])}
# 一个组合+流派生成一套可执行说明
def choose_pack(cid,t):
    p=packs[cid]
    if t in p:return p[t]
    # 相近替代
    groups={'ranged':['fire','elemental','physical'],'pierce':['melee','cold'],'bleed':['physical','melee'],'bomb':['fire'],'shield':['physical','fire'],'elemental':['aether','cold','fire'],'aether':['vitality','elemental'],'lightning':['elemental','physical'],'acid':['vitality','cold']}
    for k in groups.get(t,[]):
        if k in p:return p[k]
    return next(iter(p.values()))
def build_for(a,b,t,i):
    pa,pb=choose_pack(a,t),choose_pack(b,t)
    dmg=D[t]
    core=[]
    for x in pa[0][:2]+pb[0][:2]:
        if x not in core:core.append(x)
    support=[]
    for x in pa[1][:2]+pb[1][:2]:
        if x not in support:support.append(x)
    survive=[]
    for x in pa[2][:2]+pb[2][:2]:
        if x not in survive:survive.append(x)
    weapon={'pet':'法器/副手；只看宠物词条','ranged':'双枪或双手远程','shield':'单手武器 + 盾','bomb':'法器 + 副手','elemental':'法器 + 副手','aether':'法器/副手或流派专属武器','cold':'双持近战或法器（按主攻技能）','pierce':'双持近战','lightning':'双手近战优先','bleed':'双手近战优先'}.get(t,'单手+副手或双手武器，跟随核心技能')
    return {'id':f'{a}-{b}-{t}','name':f"{dmg['label']} · {core[0]}主攻",'type':t,'difficulty':['最省心','进阶','装备成型后'][min(i,2)],'summary':f"用{core[0]}清怪，{support[0]}负责降抗/增伤，危险时开{survive[0]}。只堆一种主伤害，不要平均分配。",'damage':dmg['label'],'weapon':weapon,'attribute':dmg['attr'],'skills':{'max':core,'support':support,'onePoint':survive,'order':[f"1–20级：先把{core[0]}及其修饰点高，同时专精条持续推进",f"20–50级：补{support[0]}和{support[1] if len(support)>1 else '降抗技能'}，第二专精先拿生存/降抗",f"50–100级：补满主攻链、降抗与专属技能；其余生存被动先 1 点再看装备加成"]},'devotion':dmg,'gearKeywords':dmg['gear'],'loop':[f"常驻光环/宠物全部开启",f"先放 {support[0]} 降抗或控场",f"用 {core[0]} 持续主攻",f"精英/BOSS补 {core[1] if len(core)>1 else support[-1]}",f"血线危险开 {survive[0]}，不要站地板技能"]}
entries=[]
for key,(zh,en,ts) in combos.items():
    a,b=map(int,key.split('-'))
    entries.append({'key':key,'classIds':[a,b],'classZh':f"{classes[a][0]} + {classes[b][0]}",'comboZh':zh,'comboEn':en,'builds':[build_for(a,b,t,i) for i,t in enumerate(ts)]})
# 单专精也提供 3 个开荒方向
singles=[]
for cid in classes:
    ts=list(packs[cid].keys())[:3]
    bs=[]
    for i,t in enumerate(ts):
        fake=build_for(cid,cid,t,i)
        # 去重同专精技能
        for k in ('max','support','onePoint'):
            fake['skills'][k]=list(dict.fromkeys(fake['skills'][k]))
        fake['id']=f'{cid}-{t}'
        bs.append(fake)
    singles.append({'key':str(cid),'classIds':[cid],'classZh':classes[cid][0],'comboZh':classes[cid][0]+'开荒','comboEn':classes[cid][1],'builds':bs})
data={'version':14,'sourceNote':'职业名参考 GrimTools；流派框架综合 GrimTools Builds、Crate 官方论坛与当前 1.3.0.x 技能数据。加点为开荒/成型方向，不伪装成唯一毕业答案。','sources':[{'name':'GrimTools Builds','url':'https://www.grimtools.com/builds/'},{'name':'Crate Classes, Skills and Builds','url':'https://forums.crateentertainment.com/c/grimdawn/classes-skills-and-builds/21'},{'name':'GrimTools Calculator','url':'https://www.grimtools.com/calc/'}],'types':D,'combos':entries,'singles':singles}
pathlib.Path(O+'/build_guides.js').write_text('window.GD_BUILD_GUIDES = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('wrote combos',len(entries),'builds',sum(len(x['builds']) for x in entries))
