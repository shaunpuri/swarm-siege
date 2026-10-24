# Shared ChatGPT tab helpers for gpt-maps.py and gpt-bases.py (exec'd inside browser-harness,
# which preloads js/cdp/switch_tab). Callers define OUT; progress is logged to OUT/log.txt.

import base64, os, subprocess, time

TAB_URL = "chatgpt.com"

def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(OUT + "/log.txt", "a") as f:
        f.write(line + "\n")


def current_tab():
    ids = [t["targetId"] for t in cdp("Target.getTargets")["targetInfos"] if t["type"] == "page" and TAB_URL in t["url"]]
    if not ids:
        # Chrome was restarted: open ChatGPT (the profile is already signed in)
        new_tab("https://chatgpt.com/")
        time.sleep(8)
        ids = [t["targetId"] for t in cdp("Target.getTargets")["targetInfos"] if t["type"] == "page" and TAB_URL in t["url"]]
        if not ids:
            raise RuntimeError("ChatGPT tab not found")
    return ids[0]


def tab():
    switch_tab(current_tab())


def page_images():
    # generated images are big blob: images; message markup varies, so look at the whole page.
    # Maps are wide 16:9 pictures, so anything squarer (a stray sprite) is never a result.
    return js("[...document.querySelectorAll('main img')].filter(i=>i.naturalWidth>800&&i.complete&&i.src.startsWith('blob:')&&i.naturalWidth/i.naturalHeight>1.6&&i.naturalWidth/i.naturalHeight<1.95).map(i=>i.src)")


def last_reply():
    return js("[...document.querySelectorAll('[data-message-author-role=assistant]')].slice(-1).map(m=>m.innerText).join('')") or ""


def open_chat(url):
    js(f"location.href={url!r}")
    time.sleep(6)
    tab()


def send(prompt):
    js("(()=>{const e=document.querySelector('#prompt-textarea')||document.querySelector('.ProseMirror[contenteditable=true]');e.focus()})()")
    time.sleep(0.4)
    cdp("Input.insertText", text=prompt)
    time.sleep(0.8)
    press_key("Enter")
    # Enter is ignored while an attachment is still uploading: retry until the composer empties
    for _ in range(20):
        time.sleep(3)
        left = js("(()=>{const e=document.querySelector('#prompt-textarea')||document.querySelector('.ProseMirror[contenteditable=true]');return e?e.innerText.trim().length:0})()")
        if not left:
            time.sleep(2)
            return
        js("(document.querySelector('[data-testid=send-button]')||document.querySelector('form button[aria-label=Send]'))?.click()")
    raise RuntimeError("prompt was never sent")


def wait_image(before):
    # generation takes 1-4 minutes; give up after 8. Nothing counts for the first 35 seconds
    # (no real image is that fast), so stray images that appear on a freshly opened page are
    # never mistaken for the result; save() also rejects near-duplicates of saved maps.
    for n in range(120):
        time.sleep(4)
        busy = js("!!document.querySelector('[data-testid=stop-button]')")
        if n < 8:
            continue
        fresh = [s for s in page_images() if s not in before]
        # uploaded references and late-loading old images look like saved maps: skip them
        for s in fresh:
            if is_duplicate(fetch(s)):
                before.add(s)
        fresh = [s for s in fresh if s not in before]
        if not busy and fresh:
            time.sleep(4)
            return [s for s in page_images() if s not in before]
        reply = last_reply().lower()
        if not busy and ("out of image" in reply or "image creations" in reply):
            raise RuntimeError("image limit: " + reply[:200])
    raise RuntimeError("timed out waiting for image")


def fetch(src):
    data = js(f"fetch({src!r}).then(r=>r.blob()).then(b=>new Promise(res=>{{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)}}))")
    return base64.b64decode(data.split(",", 1)[1])


def saved_files():
    return [open(f"{OUT}/{n}", "rb").read() for n in os.listdir(OUT) if n.endswith(".png")]


def thumb(path):
    # 32x18 greyscale fingerprint, to catch the same picture re-encoded
    out = subprocess.run(["convert", path, "-resize", "32x18!", "-colorspace", "Gray", "-depth", "8", "gray:-"], capture_output=True, check=True).stdout
    return list(out)


def is_duplicate(raw):
    tmp = OUT + "/check.tmp.png"
    with open(tmp, "wb") as f:
        f.write(raw)
    mine = thumb(tmp)
    os.remove(tmp)
    for other in os.listdir(OUT):
        if other.endswith(".png") and not other.endswith(".tmp.png"):
            if sum(abs(a - b) for a, b in zip(mine, thumb(f"{OUT}/{other}"))) / len(mine) < 6:
                return True
    return False


def save(src, path):
    raw = fetch(src)
    tmp = path + ".tmp.png"
    with open(tmp, "wb") as f:
        f.write(raw)
    mine = thumb(tmp)
    # never save the same picture twice under two names, even re-encoded
    for other in os.listdir(OUT):
        if not other.endswith(".png") or other.endswith(".tmp.png"):
            continue
        diff = sum(abs(a - b) for a, b in zip(mine, thumb(f"{OUT}/{other}"))) / len(mine)
        if diff < 6:
            os.remove(tmp)
            raise RuntimeError(f"{os.path.basename(path)} would duplicate {other} (diff {diff:.1f})")
    os.replace(tmp, path)


def generate(prompt, path):
    activate_tab(current_tab())
    send(prompt)
    # the uploaded reference shows up in the sent message; everything on the page now is "old"
    time.sleep(6)
    before = set(page_images())
    imgs = wait_image(before)
    save(imgs[0], path)
    log(f"saved {os.path.basename(path)} ({len(imgs)} option(s))")


def upload(paths):
    # one path or a list: every file is attached to the next message
    paths = [paths] if isinstance(paths, str) else paths
    # the composer's general file input (no accept filter) takes the layout reference
    # a fresh chat can take a few seconds to render its composer: wait for the input
    nid = 0
    for _ in range(30):
        doc = cdp("DOM.getDocument", depth=-1, pierce=True)
        nid = cdp("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector="input[type=file][multiple]:not([accept])")["nodeId"]
        if nid:
            break
        time.sleep(1)
    cdp("DOM.setFileInputFiles", files=paths, nodeId=nid)
    for _ in range(30):
        time.sleep(1)
        if js("[...document.querySelectorAll('form img')].filter(i=>i.naturalWidth>300).length") >= len(paths):
            time.sleep(2)
            return
    raise RuntimeError("upload did not attach")


