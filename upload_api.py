#!/usr/bin/env python3
"""Upload files to GitHub repo using browser session cookies + API."""
import base64, json, ssl, re, sys
import urllib.request, urllib.error, urllib.parse
from pathlib import Path

ctx = ssl._create_unverified_context()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
urllib.request.install_opener(opener)

OWNER, REPO = 'xiadasy', 'site-training-panel'
ROOT = Path('/var/minis/workspace/site-training-panel')
ENV_FILE = '/var/minis/offloads/env_cookies_github_com_1784432866.sh'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

# Parse cookies from env file
env_text = Path(ENV_FILE).read_text()
cookies = {}
for line in env_text.splitlines():
    m = re.match(r'(?:export\s+)?(\S+?)=(.+)', line.strip())
    if m and m.group(1).startswith('COOKIE_'):
        cookies[m.group(1)[7:]] = m.group(2).strip().strip("'\"")
CK = '; '.join(f'{k}={v}' for k, v in cookies.items())


def api(method, path, data=None):
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/{path}'
    h = {
        'User-Agent': UA,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Cookie': CK,
        'Content-Type': 'application/json',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
        return e.code, payload


def get_sha(path):
    st, data = api('GET', f'contents/{path}?ref=main')
    if st == 200 and isinstance(data, dict):
        return data.get('sha')
    return None


def put_file(path: Path, dest: str, message: str):
    content_b64 = base64.b64encode(path.read_bytes()).decode()
    payload = {'message': message, 'content': content_b64, 'branch': 'main'}
    sha = get_sha(dest)
    if sha:
        payload['sha'] = sha
    st, data = api('PUT', f'contents/{dest}', payload)
    print(f'  PUT {dest}: {st}')
    if st not in (200, 201):
        print(f'  resp: {str(data)[:300]}')
    return st in (200, 201)


files = [
    (ROOT / '.gitignore', '.gitignore', 'chore: add gitignore'),
    (ROOT / 'build_merged_data.py', 'build_merged_data.py', 'chore: add data builder script'),
    (ROOT / 'index.html', 'index.html', 'feat: publish training panel'),
    (ROOT / 'merged_data.js', 'merged_data.js', 'data: publish merged training dataset'),
]

print(f'cookie user: {cookies.get("dotcom_user", "?")}')
ok_all = True
for path, dest, msg in files:
    print(f'uploading {dest} ({path.stat().st_size} bytes)...')
    ok = put_file(path, dest, msg)
    if not ok:
        ok_all = False
print('ALL_OK' if ok_all else 'PARTIAL_FAIL')
