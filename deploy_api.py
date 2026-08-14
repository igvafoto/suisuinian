import base64, json, urllib.request, urllib.error, urllib.parse

TOKEN = ""  # 部署前在此填入你的 GitHub token；用完即清，勿留存明文
REPO = "igvafoto/suisuinian"
API = "https://api.github.com/repos/%s/contents/" % REPO
HDR = {"Authorization": "token " + TOKEN, "Content-Type": "application/json", "User-Agent": "deploy"}

def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=HDR, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}

readme = ("# Murmur · 语音日记\n\n随时用语音记录Murmur，第二天自动整理成温暖的今日回顾。\n"
          "纯前端 PWA，部署在 GitHub Pages，可安装到 iPhone 主屏幕。\n"
          "数据只存在你自己的手机本地，不上传任何服务器。\n")

files = [(".nojekyll", b""),
         ("README.md", readme.encode("utf-8"))] + [
    (f, open(f, "rb").read()) for f in
    ["index.html", "styles.css", "app.js", "manifest.json", "sw.js",
     "icon-192.png", "icon-512.png", "icon-1024.png", "apple-touch-icon.png",
     "icon-192-v2.png", "icon-512-v2.png", "icon-1024-v2.png", "apple-touch-icon-v2.png",
     "report-sample.html"]]

for path, raw in files:
    body = {"message": "add " + path, "content": base64.b64encode(raw).decode(), "branch": "main"}
    st, js = req("PUT", API + urllib.parse.quote(path), body)
    if st in (404, 409, 422):  # 已存在，取 sha 后更新
        _, cur = req("GET", API + urllib.parse.quote(path) + "?ref=main")
        if isinstance(cur, dict) and cur.get("sha"):
            body["sha"] = cur["sha"]
            st, js = req("PUT", API + urllib.parse.quote(path), body)
    print("upload", path, st, (js.get("message") if st >= 400 else "ok"))
