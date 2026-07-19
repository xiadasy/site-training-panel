#!/usr/bin/env python3
import json,csv,re,glob,html
from pathlib import Path
from datetime import datetime,timezone,timedelta

ROOT=Path('/var/minis/workspace')
A=ROOT/'_train_import_a/payload/马拉松训练计划制定.json'
B=ROOT/'_train_import_b/running_window_package_2'
GARMIN=Path('/var/minis/shared/garmin/data')
OUT=ROOT/'training-panel/merged_data.js'

RUN_KEYS='跑步 训练 配速 心率 跑量 公里 km LSD T课 恢复 轻松 长距离 间歇 阈值 体重 睡眠 腿 心悸 胸口 热 高温 下雨 酒 咖啡'.split()
COACH_KEYS='判断 评价 建议 正确 训练 负荷 恢复 心率 配速 执行 取消 休息 风险'.split()
NOISE_KEYS='打包 压缩包 网页 导出 文件 路径 启动提示词 Tool result'.split()

def clean(s):
 s=re.sub(r'<user-attached-files>.*?</user-attached-files>','',s,flags=re.S)
 s=re.sub(r'\[Tool result:.*?\]\s*','',s,flags=re.S)
 s=re.sub(r'```.*?```','',s,flags=re.S)
 s=re.sub(r'\s+',' ',s).strip()
 return s

def pick(items,keys,limit=900):
 scored=[]
 for i,s in enumerate(items):
  s=clean(s)
  if not s or len(s)<5 or any(k in s for k in NOISE_KEYS): continue
  score=sum(s.count(k) for k in keys)+min(len(s)/500,2)
  if score>0: scored.append((score,i,s))
 scored=sorted(scored,reverse=True)[:3]
 scored=sorted(scored,key=lambda x:x[1])
 out=[]
 for _,_,s in scored:
  if len(s)>520:s=s[:520].rstrip('，。； ')+ '…'
  if s not in out:out.append(s)
 text=' / '.join(out)
 return text[:limit] if text else '无'

def pick_feel(items,limit=1200):
 candidates=[]
 positive='跑完 感觉 感到 状态 睡 太热 心率 腿 胸 心悸 喘 体重 喝酒 咖啡 疲劳 疼 不舒服 开心 轻松 跑不动'.split()
 for i,raw in enumerate(items):
  s=clean(raw)
  if not s or len(s)<3 or any(k in s for k in NOISE_KEYS):continue
  if s.startswith('#') or '周课表' in s or '周定位' in s or re.search(r'date,weight|activity_id|dict_keys',s):continue
  score=sum(3 for k in positive if k in s)+(5 if '跑完' in s else 0)+(3 if '感觉' in s else 0)
  if score:candidates.append((score,i,s))
 if not candidates:return '无'
 candidates.sort(key=lambda x:(x[0],x[1]),reverse=True)
 s=candidates[0][2]
 return (s[:limit].rstrip('，。； ')+('…' if len(s)>limit else ''))

def pick_coach(items,limit=1600):
 candidates=[]
 for i,raw in enumerate(items):
  s=clean(raw)
  if not s or len(s)<20 or any(k in s for k in NOISE_KEYS):continue
  if s.startswith('读取') or s.startswith('拉取') or s.startswith('检查'):continue
  score=sum(s.count(k) for k in COACH_KEYS)+(6 if '判断' in s else 0)+(4 if '评价' in s else 0)+(3 if '##' in s else 0)
  if score:candidates.append((score,i,s))
 if not candidates:return '无'
 candidates.sort(key=lambda x:(x[0],x[1]),reverse=True)
 s=candidates[0][2]
 return (s[:limit].rstrip('，。； ')+('…' if len(s)>limit else ''))

def lap_rows(a):
 out=[]
 for i,l in enumerate(a.get('_laps') or [],1):
  dist=(l.get('distance') or 0)/1000; dur=l.get('duration') or 0
  out.append({'index':l.get('lapIndex') or i,'distance':round(dist,3),'pace':fmtpace(dur/dist if dist else 0),'avg_hr':l.get('averageHR'),'max_hr':l.get('maxHR'),'power':l.get('averagePower'),'cadence':l.get('averageRunCadence'),'step':l.get('wktStepIndex')})
 return out

def fmtpace(sec):
 if not sec:return '—'
 sec=round(sec);return f"{sec//60}'{sec%60:02d}"

def local_day_a(ts):
 d=datetime.fromisoformat(ts.replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8)))
 return d.strftime('%Y-%m-%d')

# messages by local day
msg={}
def add(day,role,text):
 if not text:return
 msg.setdefault(day,{'user':[],'assistant':[]})[role].append(text)

sess=json.load(open(A,encoding='utf-8'))[0]
for m in sess['messages']:
 role=m.get('role')
 if role not in ('user','assistant'):continue
 text='\n'.join(p.get('text','') for p in m.get('parts',[]) if p.get('type')=='text')
 add(local_day_a(m['createdAt']),role,text)
chat=json.load(open(B/'transcript/chat.json',encoding='utf-8'))
for m in chat['messages']:
 role=m.get('role'); text=m.get('text','')
 if role in ('user','assistant'):add(m['created_at'][:10],role,text)

# Garmin dedupe; prefer richer record
acts={}
for f in glob.glob(str(GARMIN/'activities_*.json'))+[str(B/'data/activities_window2.json')]:
 try:x=json.load(open(f,encoding='utf-8'))
 except:continue
 if not isinstance(x,list):continue
 for a in x:
  if not isinstance(a,dict) or not a.get('activityId'):continue
  aid=str(a['activityId']); old=acts.get(aid)
  score=len(json.dumps(a,ensure_ascii=False)) + 100000*bool(a.get('_laps'))
  oldscore=len(json.dumps(old,ensure_ascii=False))+100000*bool(old and old.get('_laps')) if old else -1
  if score>oldscore:acts[aid]=a

runs=[]
for a in acts.values():
 typ=(a.get('activityType') or {}).get('typeKey','')
 dist=(a.get('distance') or 0)/1000
 if typ not in ('running','trail_running','treadmill_running') or dist<=0:continue
 date=str(a.get('startTimeLocal',''))[:10]
 dur=a.get('duration') or 0
 pace=dur/dist if dist else 0
 name=a.get('activityName') or '跑步'
 low=name.lower()
 if '长距离' in name or dist>=24:kind='L'
 elif any(k in name for k in ('阈值','T课','T维护','间歇')):kind='T'
 elif '恢复' in name:kind='R'
 else:kind='E'
 runs.append({'date':date,'start':a.get('startTimeLocal'),'activity_id':str(a['activityId']),'title':name,'distance':round(dist,3),'duration_min':round(dur/60,1),'pace':fmtpace(pace),'pace_sec':round(pace,1),'avg_hr':a.get('averageHR'),'max_hr':a.get('maxHR'),'avg_power':a.get('avgPower'),'cadence':a.get('averageRunningCadenceInStepsPerMinute'),'te':a.get('aerobicTrainingEffect'),'anaerobic_te':a.get('anaerobicTrainingEffect'),'load':a.get('activityTrainingLoad'),'water_ml':a.get('waterEstimated'),'calories':a.get('calories'),'vo2max':a.get('vO2MaxValue'),'kind':kind,'laps':lap_rows(a)})
runs.sort(key=lambda x:x['start'] or x['date'])

# weights
weights={}
for f in [Path('/var/minis/shared/running/body_metrics_manual.csv'),B/'data/body_metrics_manual.csv']:
 if not f.exists():continue
 for r in csv.DictReader(open(f,encoding='utf-8')):
  d=r['date'][:10]
  if r.get('weight_kg'):weights[d]={'value':float(r['weight_kg']),'source':r.get('source','')}

# shoes
shoe_rows=[]
f=Path('/var/minis/shared/running/shoe_mileage.csv')
if f.exists():shoe_rows=list(csv.DictReader(open(f,encoding='utf-8')))
shoe_by_date={r['date']:r for r in shoe_rows}
shoe_sum={}
for r in shoe_rows:
 s=shoe_sum.setdefault(r['shoe'],{'name':r['shoe'],'km':0,'runs':0})
 s['km']+=float(r['distance_km']);s['runs']+=1

byday={}
for r in runs:byday.setdefault(r['date'],[]).append(r)
all_days=sorted(set(msg)|set(byday)|set(weights))
days={}
for d in all_days:
 mm=msg.get(d,{'user':[],'assistant':[]})
 days[d]={'runs':byday.get(d,[]),'weight':weights.get(d),'shoe':shoe_by_date.get(d,{}).get('shoe'),'feel':pick_feel(mm['user']),'coach':pick_coach(mm['assistant']),'user_messages':len(mm['user']),'assistant_messages':len(mm['assistant'])}

latest=runs[-1]['date']; latest_dt=datetime.strptime(latest,'%Y-%m-%d')
week_start=latest_dt-timedelta(days=latest_dt.weekday())
week_runs=[r for r in runs if datetime.strptime(r['date'],'%Y-%m-%d')>=week_start]
month_runs=[r for r in runs if r['date'][:7]==latest[:7]]
latest_vo2=next((r['vo2max'] for r in reversed(runs) if r.get('vo2max')),None)
latest_weight=weights[max(weights)] if weights else None
recent=list(reversed(runs[-10:]))

out={'meta':{'generated_at':datetime.now().isoformat(timespec='seconds'),'window1_messages':len(sess['messages']),'window2_messages':chat['total_messages'],'date_start':min(all_days),'date_end':max(all_days),'garmin_runs':len(runs)},'career':{'distance_km':44932.08,'runs':5113,'hours':3686.1,'calories':2455194,'avg_distance':8.78,'avg_pace':"4'55",'streak_weeks':125},'summary':{'latest_date':latest,'week_km':round(sum(r['distance'] for r in week_runs),2),'week_runs':len(week_runs),'month_km':round(sum(r['distance'] for r in month_runs),2),'month_runs':len(month_runs),'latest_weight':latest_weight,'vo2max':latest_vo2,'pb':'2:38:07','pb_race':'2019北京马拉松','pb_date':'2019-11-03','current_cycle_result':'2:42:17','current_cycle_race':'2026无锡马拉松','goal':'2:31:00'},'runs':runs,'recent':recent,'weights':[{'date':d,**v} for d,v in sorted(weights.items())],'shoes':list(shoe_sum.values()),'days':days}
OUT.write_text('window.MERGED_DATA='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print('wrote',OUT,OUT.stat().st_size)
print('runs',len(runs),'days',len(days),'range',min(days),max(days),'week',out['summary']['week_km'],'month',out['summary']['month_km'])