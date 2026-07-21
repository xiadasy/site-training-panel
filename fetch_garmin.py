#!/usr/bin/env python3
"""
Garmin Connect data fetcher for GitHub Actions.
Fetches recent running activities + laps and merges with existing data.
Uses garminconnect library with stored token.
"""
import json, os, sys, datetime, re
from pathlib import Path

def main():
    try:
        from garminconnect import Garmin
    except ImportError:
        os.system(f'{sys.executable} -m pip install garminconnect -q')
        from garminconnect import Garmin

    # Load token from env (set as GitHub Secret)
    token_json = os.environ.get('GARMIN_TOKEN', '')
    email = os.environ.get('GARMIN_EMAIL', '')
    password = os.environ.get('GARMIN_PASSWORD', '')

    token_dir = Path('/tmp/garmin_tokens')
    token_dir.mkdir(parents=True, exist_ok=True)

    # If token JSON provided, write it to file
    if token_json:
        try:
            token_data = json.loads(token_json)
            (token_dir / 'garmin_tokens.json').write_text(json.dumps(token_data))
        except:
            pass

    client = Garmin(email, password)
    try:
        client.login(str(token_dir))
        print("✅ Garmin login via token OK")
    except Exception as e:
        print(f"⚠️ Token login failed: {e}, trying fresh login...")
        try:
            client.login()
            client.garth.dump(str(token_dir))
            print("✅ Fresh login OK")
        except Exception as e2:
            print(f"❌ Login failed: {e2}")
            sys.exit(1)

    # Fetch last 14 days of activities
    today = datetime.date.today()
    start = today - datetime.timedelta(days=14)
    activities = client.get_activities(0, 100)
    filtered = [a for a in activities if start.isoformat() <= a.get("startTimeLocal","")[:10] <= today.isoformat()]
    print(f"📊 Found {len(filtered)} activities in {start} ~ {today}")

    # Get laps for running activities
    runs = []
    for a in filtered:
        if (a.get("activityType") or {}).get("typeKey") != "running":
            continue
        if (a.get("distance") or 0) <= 0:
            continue
        aid = a["activityId"]
        try:
            splits = client.get_activity_splits(aid)
            a["_laps"] = splits.get("lapDTOs", []) if isinstance(splits, dict) else []
            print(f"  ✅ {a.get('startTimeLocal','')[:10]} {a.get('activityName','')} - {len(a['_laps'])} laps")
        except Exception as e:
            a["_laps"] = []
            print(f"  ⚠️ laps failed for {aid}: {e}")
        runs.append(a)

    # Fetch Garmin calendar workouts and build weekly plan data
    try:
        months = {(today.year, today.month)}
        end_day = today + datetime.timedelta(days=14)
        months.add((end_day.year, end_day.month))
        items = []
        for y, m in months:
            cal = client.get_scheduled_workouts(y, m)
            items.extend(cal.get('calendarItems', []))
        plans = {}
        for item in items:
            if item.get('itemType') != 'workout' or item.get('sportTypeKey') != 'running': continue
            ds, title = item.get('date',''), item.get('title','')
            if not ds: continue
            d = datetime.date.fromisoformat(ds)
            monday = d - datetime.timedelta(days=d.weekday())
            rows = plans.setdefault(monday.isoformat(), [None] * 7)
            # Extract numeric distance for plan target
            nums = re.findall(r'(\d+(?:\.\d+)?)\s*(?:km|公里)', title, re.I)
            distance = float(nums[-1]) if nums else 0
            # Quality workouts encode repetitions (e.g. 3x2km), so read the workout's total target distance.
            if re.search(r'\d+\s*[x×]\s*\d+(?:\.\d+)?\s*km', title, re.I) and item.get('workoutId'):
                try:
                    detail = client.get_workout_by_id(item['workoutId'])
                    distance = round(float(detail.get('estimatedDistanceInMeters') or 0) / 1000, 2) or distance
                except Exception: pass
            clean = re.sub(r'^\d{1,2}/\d{1,2}\s*', '', title)
            clean = re.sub(r'\s*\d+(?:\.\d+)?\s*(?:km|公里).*$', '', clean, flags=re.I).strip()
            # Clean up residual patterns like "3x" from quality workouts
            clean = re.sub(r'\s*\d+\s*[x×]\s*$', '', clean).strip()
            rows[d.weekday()] = {'type': clean or title, 'plan': distance, 'title': title, 'workout_id': item.get('workoutId')}
        Path('weekly_plans.json').write_text(json.dumps(plans, ensure_ascii=False, indent=2), encoding='utf-8')
        Path('weekly_plans.js').write_text('window.WEEKLY_PLANS=' + json.dumps(plans, ensure_ascii=False, separators=(',',':')) + ';\n', encoding='utf-8')
        print(f"📅 Saved {len(plans)} Garmin calendar weeks")
    except Exception as e:
        print(f"⚠️ Calendar fetch failed, keeping existing plan: {e}")

    # Save to data file
    out_file = Path('garmin_data.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(runs, f, ensure_ascii=False)
    print(f"💾 Saved {len(runs)} runs to {out_file}")
    return 0

if __name__ == '__main__':
    sys.exit(main())
