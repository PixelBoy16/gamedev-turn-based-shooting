# ชุด prompt ภาพตัวละครแบบแต่งตัวได้

ตัวละครในเกมซ้อนจากภาพหลายชั้น: ตัวเปล่า (5 ส่วน: ขา ลำตัว แขนซ้าย แขนขวา หัว) แล้ววางชิ้นแต่งตัวทับทีละชั้น
ทุกไฟล์ต้องอยู่บน **ผืน 1024×1024 พื้นโปร่งใส ท่าเดียวกัน ตำแหน่งเดียวกัน** ไม่อย่างนั้นซ้อนแล้วจะเหลื่อม

**ทุกชิ้นต้องวาดหน้าตรง สมมาตร ไม่เอียง ไม่หันข้าง** (เสื้อ เป้ หมวก ฯลฯ) ชิ้นที่เอียงจะซ้อนบนตัวหน้าตรงไม่พอดี
และจัดใน lab ยาก ถ้า ChatGPT วาดเอียงมา ให้ตอบว่า *"redraw it perfectly front-facing and symmetrical, flat front view"*

## วิธีทำงาน

1. ชิ้นที่ครอปมาเดี่ยวๆ (ขนาดผืนอะไรก็ได้) วางที่ `art-src/look-raw/` แล้วเพิ่มบรรทัดใน `art-src/look-raw/plan.json`
   เป็น `"ชื่อ": [กว้าง, กลางx, บนสุดy]` (พิกัดบน `body.png`) จากนั้นรัน `python3 tools/fit_look.py ชื่อ`
   สคริปต์จะวางชิ้นลงผืน 1024×1024 ให้ที่ `art-src/look/` (ถ้าได้ไฟล์บนผืน 1024 ตรงตำแหน่งแล้ว วางที่ `art-src/look/` ตรงๆ ได้เลย)
2. ตรวจด้วย `python3 tools/check_look.py` (ดูว่าผืนถูกขนาด พื้นโปร่งใส ชื่อถูก ขาดไฟล์ไหน)
3. คัดลอกไป `src/art/look/` **ใน branch `feat/painted-look`** แล้วจัดตำแหน่งละเอียดใน `http://localhost:5179/?lab`
   (ซ้าย: เลือกชุดที่ใส่ + รายการเลเยอร์ คลิกชื่อเพื่อเลือก คลิกจุดเพื่อซ่อน / กลาง: ลากชิ้นที่เลือก /
   ขวา: เลื่อน ขนาด หมุน กลับด้าน ลำดับหน้า-หลัง แล้วกดบันทึก)

> ห้ามวาง `body.png` ใน `src/art/look/` บน main จนกว่าจะครบทุกชิ้น: พอมีไฟล์นี้ เกมจะใช้ภาพวาดทั้งหมดทันที
> ชิ้นที่ยังไม่มีไฟล์จะหายไปเลย

## เคล็ดลับกับ ChatGPT

- **แนบ `body.png` ทุกครั้ง** ที่วาดชิ้นแต่งตัว (ยกเว้นตอนวาด body เอง ให้แนบภาพตัวอย่างสไตล์แทน)
- ถ้าได้พื้นหลังสีทึบ ให้ตอบกลับว่า "make the background fully transparent, keep everything else identical"
- ถ้าชิ้นวางเพี้ยนนิดหน่อยไม่เป็นไร แก้ใน `?lab` ได้ แต่ถ้าขนาดผิดมาก (หมวกใหญ่กว่าหัวสองเท่า) ให้สั่งวาดใหม่
- ถ้าโดนปฏิเสธ: เลี่ยงคำทหาร/อาวุธ ใช้ *costume, toy, cosplay, adventure gear* แทน และเริ่มแชทใหม่
- ทำทีละไฟล์ในแชทเดียวกันได้ แต่ถ้าสไตล์เริ่มเพี้ยน ให้เริ่มแชทใหม่แล้วแนบ `body.png` + ชิ้นที่ได้แล้วสักชิ้นเป็นตัวอย่าง

## ข้อความนำ (ใส่ต้นทุก prompt ของชิ้นแต่งตัว)

```
Use the attached character (body.png) as the exact template. Output ONE square 1024x1024 PNG
with a fully transparent background. Draw ONLY the item described below, sized and positioned
exactly where it would sit on this character in this exact pose, as if the character were wearing it.
Do NOT draw the character's body, skin, face or anything else - only the item, everything
else transparent. Draw it perfectly front-facing and symmetrical, a flat front view, not turned
or angled, exactly matching the template's straight-on pose. Same art style as the template:
thick dark outlines, flat saturated colours with soft painted shading, chunky tough cartoon look.
```

---

## 1) body.png (ทำก่อน และต้องได้ตัวที่ชอบจริงก่อนไปต่อ)

แนบภาพตัวอย่างสไตล์ (ภาพ 3 ตัวละครที่ชอบ) แล้วใช้:

```
Same art style as the attached image: tough chunky cartoon, thick dark outlines, saturated
colours, soft painted shading. Draw ONE plain base character as a dress-up mannequin:
- square 1024x1024 PNG, fully transparent background, no ground, no shadow, no text
- standing perfectly straight, facing the viewer, symmetrical
- arms hanging down a little away from the body, both hands in fists, black fingerless gloves
- big squarish head about 2/5 of the total height, completely BALD, no hair, no hat
- face: NO eyes and NO eyebrows (leave smooth skin there), small nose, a cocky grin with teeth
- plain tight dark-grey t-shirt, plain dark-grey trousers, chunky black boots
- top of the head at about 12% from the top of the canvas, soles of the boots at about
  94% from the top, character centred horizontally
```

ตาแยกเป็นชั้น เพราะเกมเปลี่ยนแบบตาได้ ถ้าวาดตาติดมากับตัว จะเปลี่ยนตาไม่ได้

### 1b) ตัดตัวเป็น 5 ส่วน

เกมใช้ตัวแยกส่วน (ถ้ามีครบจะใช้แทน `body.png`) เพื่อให้ lab ปรับสัดส่วน หัว แขน ขา แยกกันได้
และชุดเซ็ต (ชุดหมี) จะโชว์แค่หัว ไม่มีกำปั้นหรือรองเท้าโผล่

**ทางลัด:** ตัดจาก `body.png` ด้วย `python3 tools/split_body.py` (ตอนนี้ทำไว้แล้ว ใช้ได้เลย)

ถ้าวาด body ใหม่ ให้ตัดด้วยสคริปต์เดิม (อาจต้องขยับเส้นตัดบนสุดของไฟล์) หรือสั่ง ChatGPT ทีละส่วน:
แนบ `body.png` แล้วใช้ *"Using the attached character as the exact template, output ONE 1024x1024
transparent PNG with ONLY its [head and neck / torso / left arm as seen on screen / right arm as seen
on screen / legs and boots], in exactly the same size and position, everything else transparent."*

| ไฟล์ | ส่วน |
|---|---|
| `body-head.png` | หัว ใบหู คอ |
| `body-torso.png` | ลำตัวถึงเข็มขัด |
| `body-arm-left.png` | แขนซ้าย (ซ้ายของจอ) ไหล่ถึงกำปั้น |
| `body-arm-right.png` | แขนขวา (ขวาของจอ) ไหล่ถึงกำปั้น **มือนี้ถือปืน** |
| `body-legs.png` | สะโพก ขา รองเท้า |

---

## 2) ชิ้นสำหรับ 3 ตัวในหน้าเมนู (17 ไฟล์)

แต่ละชิ้น: ข้อความนำ + บรรทัดด้านล่าง

### ตัวซ้าย: ผมหางม้า แว่นกันลม เสื้อเกราะเบา ตาหรี่ ลายพราง

| ไฟล์ | prompt (ต่อจากข้อความนำ) |
|---|---|
| `hair-ponytail-back.png` | `Item: only the BACK part of a black ponytail hairstyle - the ponytail itself, which hangs behind the head on the right side. Nothing that would cover the face or the top of the head.` |
| `hair-ponytail-front.png` | `Item: only the FRONT part of a black ponytail hairstyle - the hair covering the top of the head and a short fringe over the forehead, with a small red hair tie. Not the hanging tail.` |
| `glasses-goggles.png` | `Item: a pair of round orange-lens adventure goggles with a black strap, worn over the eyes.` |
| `cloth-vest.png` | `Item: a dark grey padded adventure vest with a row of pouches across the chest, worn over an olive-green short-sleeve shirt. Draw the shirt and vest only (torso and upper arms), no trousers.` |
| `eyes-squint.png` | `Item: only a pair of narrowed, squinting confident eyes with thick angry eyebrows. Nothing else of the face.` |
| `face-warpaint.png` | `Item: only face paint - two short dark stripes on each cheek. Nothing else.` |

### ตัวกลาง: หมวกนักบิน ผมตั้ง ผ้าคลุม แผลเป็น (เสื้อกล้ามกับตาจ้องคือค่าเริ่มต้น)

| ไฟล์ | prompt (ต่อจากข้อความนำ) |
|---|---|
| `hat-aviator.png` | `Item: a brown leather aviator cap with ear flaps and big round blue-lens goggles pushed up on the forehead.` |
| `hair-spiky-back.png` | `Item: only the BACK part of a spiky orange-red hairstyle - a few spikes sticking out behind the top of the head. Nothing in front of the face.` |
| `hair-spiky-front.png` | `Item: only the FRONT part of a spiky orange-red hairstyle - spikes on top of the head and over the forehead.` |
| `back-cape.png` | `Item: a torn red cape with a green scarf around the neck, hanging behind the character's back (only the edges show at the sides and below the arms).` |
| `face-scar.png` | `Item: only a small red X-shaped scar on the right cheek. Nothing else.` |
| `cloth-tank.png` | `Item: an olive-green tank top with a brown belt with a silver buckle, and a small gold star badge on the shoulder. Torso only, no trousers.` |
| `eyes-glare.png` | `Item: only a pair of fierce glaring eyes with thick angry eyebrows angled down. Nothing else of the face.` |

### ตัวขวา: ชุดกะโหลกหมี ตาเรืองแสง เป้

| ไฟล์ | prompt (ต่อจากข้อความนำ) |
|---|---|
| `set-bearskull-body.png` | `Item: the BODY part of a brown teddy-bear costume - a furry brown suit covering the torso, arms and legs, with a cream ribcage pattern on the chest, knee pads. Not the hood.` |
| `set-bearskull-hood.png` | `Item: the HOOD part of a brown teddy-bear costume - a furry bear hood with round ears and a cream skull mask on the forehead, framing the face (the face itself stays visible, leave it transparent).` |
| `eyes-glow.png` | `Item: only a pair of glowing cyan eyes with a soft cyan glow around them and thick angry eyebrows. Nothing else of the face.` |
| `back-ammo.png` | `Item: a chunky olive-green backpack with yellow lights, worn on the back (only the sides show behind the arms).` |

---

## 3) ชิ้นที่เหลือ (ทำหลังจาก 3 ตัวในเมนูผ่านแล้ว)

| ไฟล์ | ชิ้น |
|---|---|
| `hat-spikecrown.png` | มงกุฎเหล็กหนาม |
| `hat-bandana.png` | ผ้าโพกหัว |
| `hat-helm.png` | หมวกเหล็ก |
| `glasses-shades.png` | แว่นดำ |
| `hair-buzz-back.png`, `hair-buzz-front.png` | ผมเกรียน (ชิ้นหลังอาจเกือบว่าง: แค่ขอบผมด้านหลัง) |
| `hair-mohawk-back.png`, `hair-mohawk-front.png` | ทรงโมฮอว์ก |
| `face-beard.png` | เคราดุ |
| `cloth-armor.png` | เกราะเหล็ก |
| `cloth-trench.png` | โค้ทสนาม |
| `cloth-ninja.png` | ชุดนินจา |
| `eyes-sharp.png` | ตาคม |
| `back-ironwings.png` | ปีกเหล็ก |

ถ้าเพิ่มชิ้นใหม่ใน `config/game.json` ชื่อไฟล์คือ `<slot>-<id>.png` (ผมกับชุดมี 2 ไฟล์ตามแบบด้านบน)
สคริปต์ตรวจจะอ่านรายการจาก config เอง
