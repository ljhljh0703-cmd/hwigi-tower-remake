"""Export text-free dice and roulette parts from their transparent masters."""
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

SOURCE = Path(__file__).resolve().parent
DEST = SOURCE.parents[1] / "public/art/ui/combat-controls"
DEST.mkdir(exist_ok=True, parents=True)

def part_at(sheet, index):
    part = sheet.crop((sheet.width * index // 3, 0, sheet.width * (index + 1) // 3, sheet.height))
    bounds = part.getchannel("A").point(lambda alpha: 255 if alpha > 64 else 0).getbbox()
    return part.crop(bounds)

def tint(image, shadows, lights):
    result = ImageOps.colorize(ImageOps.grayscale(image), shadows, lights).convert("RGBA")
    result.putalpha(image.getchannel("A"))
    return result

sheet = Image.open(SOURCE / "dice-source.png").convert("RGBA")
for i, name in enumerate(("bone", "ego", "socket")):
    tile = part_at(sheet, i).resize((44, 44), Image.Resampling.LANCZOS)
    if name == "socket":
        tile.save(DEST / "socket.png", optimize=True)
        continue
    atlas = Image.new("RGBA", (44, 88))
    atlas.alpha_composite(tile)
    atlas.alpha_composite(tile.resize((44, 42), Image.Resampling.LANCZOS), (0, 46))
    atlas.save(DEST / f"{name}.png", optimize=True)

socket = part_at(sheet, 2).resize((88, 88), Image.Resampling.LANCZOS)
slate = tint(socket, "#222b25", "#b8b395")
ImageEnhance.Brightness(slate).enhance(0.76).save(DEST / "slot-frame.png", optimize=True)
slate.save(DEST / "slot-filled.png", optimize=True)
tint(socket, "#171316", "#ac7850").resize((44, 44), Image.Resampling.LANCZOS).save(
    DEST / "stolen-socket.png", optimize=True,
)

sheet = Image.open(SOURCE / "wheel-source.png").convert("RGBA")
for i, (name, size) in enumerate((("rim", (264, 264)), ("hub", (96, 96)), ("pointer", (22, 35)))):
    part_at(sheet, i).resize(size, Image.Resampling.LANCZOS).save(DEST / f"{name}.png", optimize=True)

# The same copper plate is shared by the end-turn and counter controls.
plate = Image.open(SOURCE / "copper-source.png").convert("RGBA")
bounds = plate.getchannel("A").point(lambda alpha: 255 if alpha > 10 else 0).getbbox()
plate = plate.crop(bounds).resize((512, 88), Image.Resampling.LANCZOS)
pressed = ImageEnhance.Brightness(plate).enhance(0.77).resize((512, 82), Image.Resampling.LANCZOS)
disabled = ImageOps.colorize(ImageOps.grayscale(plate), "#25211e", "#908676").convert("RGBA")
disabled.putalpha(plate.getchannel("A"))
states = Image.new("RGBA", (512, 264))
states.alpha_composite(plate)
states.alpha_composite(pressed, (0, 94))
states.alpha_composite(disabled, (0, 176))
states.save(DEST / "turn-button.png")

# Export the reroll states separately so CSS can keep the painted corners at
# the same size on both compact touch controls and wide desktop buttons.
for name, source in (("reroll", plate), ("reroll-pressed", pressed), ("reroll-disabled", disabled)):
    source.resize((160, 64), Image.Resampling.LANCZOS).save(DEST / f"{name}.png", optimize=True)
