"""Draw the independent CPU mesh inspection files with Pillow, without a browser."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent / "qa-screenshots"
font_path = Path("C:/Windows/Fonts/msyh.ttc")
for name in ["enemy-costumes-troops", "enemy-costumes-bosses", "roll-poses"]:
    data = json.loads((root / (name + ".json")).read_text(encoding="utf-8"))
    scale = 2
    width, height = data["width"], data["height"]
    image = Image.new("RGB", (width * scale, (height + 80) * scale), "#d6d7ce")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, int(height * .83) * scale, width * scale, (height + 80) * scale), fill="#b9bfb4")
    for face in data["faces"]:
        draw.polygon([(x * scale, y * scale) for x, y in face["p"]], fill=tuple(max(0, min(255, c)) for c in face["c"]))
    font = ImageFont.truetype(str(font_path), 21 * scale)
    small = ImageFont.truetype(str(font_path), 13 * scale)
    for label in data["labels"]:
        draw.text((label["x"] * scale, (height + 4) * scale), label["text"], font=font, fill="#26352e", anchor="mt")
        draw.text((label["x"] * scale, (height + 38) * scale), label["detail"], font=small, fill="#546259", anchor="mt")
    image.resize((width, height + 80), Image.Resampling.LANCZOS).save(root / (name + ".png"))
    print(root / (name + ".png"))
