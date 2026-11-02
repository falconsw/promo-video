# Generates text-free 9:16 cover backgrounds with Gemini image (gemini-3-pro-image), several variants in parallel.
#   python3 gen_cover_bg.py thumbnails            → thumbnails/a-shock.jpeg, b-relief.jpeg, c-chibi.jpeg
# Edit PROMPTS per video: the problem moment (a), the relief after the product (b), a playful chibi (c).
# Variant A (the shocked "problem" face) works best. Key: ~/.config/gemini/api_key.
import json, sys, base64, urllib.request, pathlib, concurrent.futures as cf
key = (pathlib.Path.home() / '.config/gemini/api_key').read_text().strip()
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'thumbnails'); out.mkdir(parents=True, exist_ok=True)
STYLE = ("Vertical 9:16 YouTube Shorts cover illustration. Keep the top third of the frame calm and dark "
         "(deep navy night sky or wall) so a big title can be placed there later. Absolutely no text, letters, "
         "numbers, logos or watermarks anywhere in the image; the screens show only abstract glowing shapes and lines.")
PROMPTS = {
 "a-shock": "Light anime illustration with clean line art and soft cel shading. A young software developer with short dark hair "
            "and a dark hoodie sits at a desk at night in front of a laptop. The laptop screen glows with an alarming red warning bar. "
            "He grabs his head with an exaggerated anime shocked face, a big sweat drop, eyes wide. Red glow on his face, the room in deep navy blue. " + STYLE,
 "b-relief": "Light anime illustration with clean line art and soft cel shading. A young software developer with short dark hair "
            "and a dark hoodie leans back in his chair at night with a relaxed, confident smile, holding a coffee mug. His laptop screen shows "
            "a dark interface with a small glowing green gauge. Warm amber desk-lamp light mixed with green screen glow, cozy room in deep navy. " + STYLE,
 "c-chibi": "Playful flat cartoon style with thick clean outlines and bright cel colors. A cute chibi developer character with short dark hair "
            "and a hoodie proudly holds up a giant glowing green gauge meter like a trophy, little sparkles around it, an open laptop beside him. "
            "Dark navy background with warm amber and neon green accents. " + STYLE,
}
def gen(name, prompt):
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "9:16", "imageSize": "2K"}}}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
    d = json.load(urllib.request.urlopen(req, timeout=240))
    for p in d["candidates"][0]["content"]["parts"]:
        if "inlineData" in p:
            ext = p["inlineData"]["mimeType"].split("/")[-1]
            f = out / f"{name}.{ext}"; f.write_bytes(base64.b64decode(p["inlineData"]["data"])); return str(f)
    return name + ": no image " + json.dumps(d)[:300]
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(lambda kv: gen(*kv), PROMPTS.items()): print(r)
