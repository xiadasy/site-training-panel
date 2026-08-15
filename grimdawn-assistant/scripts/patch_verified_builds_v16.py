#!/usr/bin/env python3
import json,re,pathlib
root=pathlib.Path('/var/minis/workspace/grimdawn-assistant')
p=root/'data_js/build_guides.js';t=p.read_text();d=json.loads(re.sub(r'^window\.GD_BUILD_GUIDES\s*=\s*','',t).rstrip(' ;\n'))
# 所有自动生成路线降级为概念草案，不能使用精确逐点功能
for grp in d['combos']+d['singles']:
 for b in grp['builds']:
  b['verification']={'level':'concept','label':'算法组合 · 未经外部Build逐点验证','exact':False,'note':'仅用于了解可能方向；不能作为1-100级逐点抄作业。'}
# 用可追溯 GrimTools 1.2.1.6 成品配置替换神秘+萨满宠物路线
G=next(x for x in d['combos'] if x['key']=='3-6');b=next(x for x in G['builds'] if x['id']=='3-6-pet')
b.update({
 'name':'宠物咒术师 · 完整乌鸦/荆棘兽链','difficulty':'来源验证','summary':'宠物输出；乌鸦不是只点本体，必须配套血肉缝合、风暴之心、闪电打击。荆棘兽和神秘学者/萨满宠物光环共同构成完整体系。','damage':'宠物元素/流血','weapon':'按来源 Build 配装；先看宠物词条与宠物抗性','attribute':'来源成品：体魄554、灵巧106、精神346（含基础/装备环境，仅作目标参考）',
 'skills':{'max':['召唤乌鸦','血肉缝合','风暴之心','闪电打击','召唤地狱犬','灰烬之爪','地狱之火','炼狱吐息','召唤荆棘兽','大地猛击','激励风采','召唤原始之灵'],'support':['掌控','拜斯迈的羁绊','虚弱诅咒','易伤','德里格之血','守护者之躯','莫格卓根的契约','橡树皮','野性之心','原始羁绊','风之恶魔','狂风暴雨','风暴漩涡','吞噬虫群'],'onePoint':['末日闪电'],'order':['开荒阶段不等于最终成品点法；先用一只主宠和完整修饰链升级。','86级目标由最终248点配置按优先级截取，并保留乌鸦完整技能链。','100级按来源Build裸点还原；装备+技能另算，不写入裸点。']},
 'exactTargets':{
  '3':{'mastery':50,'skills':{'掌控':10,'拜斯迈的羁绊':2,'易伤':10,'虚弱诅咒':7,'守护者之躯':9,'德里格之血':7,'风暴之心':1,'闪电打击':12,'召唤地狱犬':7,'末日闪电':1,'灰烬之爪':1,'地狱之火':1,'炼狱吐息':1,'召唤乌鸦':8,'血肉缝合':1}},
  '6':{'mastery':50,'skills':{'莫格卓根的契约':7,'大地猛击':1,'召唤荆棘兽':14,'橡树皮':5,'野性之心':1,'原始羁绊':12,'激励风采':12,'风之恶魔':1,'吞噬虫群':1,'召唤原始之灵':4,'风暴漩涡':1,'狂风暴雨':11}}
 },
 'verification':{'level':'verified','label':'来源验证 · GrimTools 1.2.1.6','exact':True,'version':'1.2.1.6','sourceName':'Conjurer, Level 100','sourceUrl':'https://www.grimtools.com/calc/gZwQ5Ll2','forumSource':'https://forums.crateentertainment.com/t/sanguine-lupus-pet-conjurer/88128','note':'100级裸点总计248（含两条50专精）；86级按该成品目标和优先级推导，不等于作者逐级练级日记。'}
})
d['version']=16;d['sourceNote']='只有标记“来源验证”的路线才开放等级精确加点；其余算法组合仅作方向草案。'
p.write_text('window.GD_BUILD_GUIDES = '+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';\n')
print('verified',sum(1 for g in d['combos']+d['singles'] for b in g['builds'] if b['verification']['exact']),'concept',sum(1 for g in d['combos']+d['singles'] for b in g['builds'] if not b['verification']['exact']))
