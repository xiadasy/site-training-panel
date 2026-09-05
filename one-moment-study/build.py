from pathlib import Path
p=Path(__file__).resolve().parent
html=(p/'page.html').read_text()
for marker,name in [('/*__STYLE__*/','style.css'),('/*__CORE__*/','core.js'),('/*__APP__*/','app.js')]:
    assert html.count(marker)==1, marker
    html=html.replace(marker,(p/name).read_text())
(p/'index.html').write_text(html)
print(f'Built {p / "index.html"}: {len(html.encode())} bytes')
