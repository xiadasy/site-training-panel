#!/usr/bin/env python3
"""
Online data builder for GitHub Actions.
Merges fetched Garmin data (garmin_data.json) with existing merged_data.js,
keeping all historical runs and appending new ones.
No dependency on local chat data or local Garmin files.
"""
import json, os, sys, re
from pathlib import Path
from datetime import datetime, timedelta

def fmtpace(sec):
    if not sec: return '—'
    sec = round(sec)
    return f"{sec//60}'{sec%60:02d}"

def local_day(ts):
    if not ts: return ''
    return ts[:10]

# Load existing merged data (keep history)
existing = {}
if Path('merged_data.js').exists():
    raw = Path('merged_data.js').read_text(encoding='utf-8')
    if raw.startswith('window.MERGED_DATA='):
        payload = raw[len('window.MERGED_DATA='):]
        if payload.endswith(';'): payload = payload[:-1]
        if payload.endswith('\n'): payload = payload.strip()
        try:
            existing = json.loads(payload)
        except:
            print("⚠️ Could not parse existing merged_data.js, starting fresh")

# Load newly fetched Garmin data
new_runs = []
if Path('garmin_data.json').exists():
    new_runs = json.loads(Path('garmin_data.json').read_text(encoding='utf-8'))
    print(f"📊 Loaded {len(new_runs)} new activities from Garmin")

# Merge runs by activity_id (dedupe, prefer newer fetch with laps)
all_runs = {}
for r in existing.get('runs', []):
    all_runs[str(r.get('activity_id'))] = r

for a in new_runs:
    aid = str(a.get('activityId'))
    if not aid: continue
    typ = (a.get('activityType') or {}).get('typeKey','')
    dist = (a.get('distance') or 0) / 1000
    if dist <= 0: continue
    date = str(a.get('startTimeLocal',''))[:10]
    dur = a.get('duration') or 0
    pace = dur/dist if dist else 0
    name = a.get('activityName') or '跑步'
    if '长距离' in name or dist >= 24: kind = 'L'
    elif any(k in name for k in ('阈值','T课','T维护','间歇')): kind = 'T'
    elif '恢复' in name: kind = 'R'
    else: kind = 'E'

    laps = []
    for i, l in enumerate(a.get('_laps') or [], 1):
        ldist = (l.get('distance') or 0) / 1000
        ldur = l.get('duration') or 0
        laps.append({
            'index': l.get('lapIndex') or i,
            'distance': round(ldist, 3),
            'pace': fmtpace(ldur/ldist if ldist else 0),
            'avg_hr': l.get('averageHR'),
            'max_hr': l.get('maxHR'),
            'power': l.get('averagePower'),
            'cadence': l.get('averageRunCadence'),
            'step': l.get('wktStepIndex')
        })

    all_runs[aid] = {
        'date': date,
        'start': a.get('startTimeLocal'),
        'activity_id': aid,
        'title': name,
        'distance': round(dist, 3),
        'duration_min': round(dur/60, 1),
        'pace': fmtpace(pace),
        'pace_sec': round(pace, 1),
        'avg_hr': a.get('averageHR'),
        'max_hr': a.get('maxHR'),
        'avg_power': a.get('avgPower'),
        'cadence': a.get('averageRunningCadenceInStepsPerMinute'),
        'te': a.get('aerobicTrainingEffect'),
        'anaerobic_te': a.get('anaerobicTrainingEffect'),
        'load': a.get('activityTrainingLoad'),
        'water_ml': a.get('waterEstimated'),
        'calories': a.get('calories'),
        'vo2max': a.get('vO2MaxValue'),
        'kind': kind,
        'laps': laps
    }

runs = sorted(all_runs.values(), key=lambda x: x.get('start') or x.get('date',''))
print(f"🏃 Total runs after merge: {len(runs)}")

# Build summary
latest = runs[-1]['date'] if runs else datetime.now().strftime('%Y-%m-%d')
latest_dt = datetime.strptime(latest, '%Y-%m-%d')
week_start = latest_dt - timedelta(days=latest_dt.weekday())
week_runs = [r for r in runs if datetime.strptime(r['date'],'%Y-%m-%d') >= week_start]
month_runs = [r for r in runs if r['date'][:7] == latest[:7]]
latest_vo2 = next((r['vo2max'] for r in reversed(runs) if r.get('vo2max')), None)

# Build day index from existing (preserves chat feel/coach data)
days = existing.get('days', {})
# Add/update days with new runs
for r in runs:
    d = r['date']
    if d not in days:
        days[d] = {'runs': [], 'weight': None, 'shoe': None, 'feel': '无', 'coach': '无', 'user_messages': 0, 'assistant_messages': 0}
    day_runs = [x for x in days[d]['runs'] if x['activity_id'] != r['activity_id']]
    day_runs.append(r)
    days[d]['runs'] = day_runs

# Sort days
days = {k: days[k] for k in sorted(days)}

# Weights from existing
weights = existing.get('weights', [])
# Shoes from existing
shoes = existing.get('shoes', [])
# Career total (from悦跑圈)
career = existing.get('career', {
    'distance_km': 44932.08, 'runs': 5113, 'hours': 3686.1,
    'calories': 2455194, 'avg_distance': 8.78, 'avg_pace': "4'55", 'streak_weeks': 125
})

out = {
    'meta': {
        'generated_at': datetime.now().isoformat(timespec='seconds'),
        'window1_messages': existing.get('meta',{}).get('window1_messages',788),
        'window2_messages': existing.get('meta',{}).get('window2_messages',582),
        'date_start': min(days) if days else latest,
        'date_end': max(days) if days else latest,
        'garmin_runs': len(runs),
        'auto_updated': True
    },
    'career': career,
    'summary': {
        'latest_date': latest,
        'week_km': round(sum(r['distance'] for r in week_runs), 2),
        'week_runs': len(week_runs),
        'month_km': round(sum(r['distance'] for r in month_runs), 2),
        'month_runs': len(month_runs),
        'latest_weight': existing.get('summary',{}).get('latest_weight'),
        'vo2max': latest_vo2,
        'pb': '2:38:07',
        'pb_race': '2019北京马拉松',
        'pb_date': '2019-11-03',
        'current_cycle_result': '2:42:17',
        'current_cycle_race': '2026无锡马拉松',
        'goal': '2:31:00'
    },
    'runs': runs,
    'recent': list(reversed(runs[-10:])),
    'weights': weights,
    'shoes': shoes,
    'days': days
}

Path('merged_data.js').write_text(
    'window.MERGED_DATA=' + json.dumps(out, ensure_ascii=False, separators=(',',':')) + ';\n',
    encoding='utf-8'
)
print(f"✅ Built merged_data.js ({Path('merged_data.js').stat().st_size} bytes)")
print(f"   Runs: {len(runs)} | Days: {len(days)} | Week: {out['summary']['week_km']}km | Month: {out['summary']['month_km']}km")
