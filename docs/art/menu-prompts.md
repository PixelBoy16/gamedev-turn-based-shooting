# ชุด prompt ภาพหน้าเมนูแรก (หน้าเข้าเล่นเกม)

โค้ดหน้าเมนู (`src/scenes/MenuScene.ts`) วางตำแหน่งไว้ตรงกับดีไซน์แล้ว: โลโก้กับ 3 ตัวละครทางซ้าย,
การ์ดโหมดเล่น 3 ใบทางขวา, ร้านค้ากับ Battle Pass ข้างล่าง, บัญชีกับเงินด้านบน
ที่ต้องวาดคือ **ภาพพื้นหลัง โลโก้ และไอคอน** เท่านั้น

**ไม่ต้องวาด:**
- ปุ่ม/การ์ด/แถบเงิน โค้ดวาดเอง (ขยายได้ทุกขนาด ตัวหนังสือไทยคม เปลี่ยนสีกับทำท่ากดได้)
- ตัวหนังสือไทยทุกอย่าง (สโลแกน ชื่อปุ่ม คำอธิบาย) โค้ดเขียนเอง ภาพที่ AI เขียนไทยมักเพี้ยน
- ตัวละคร 3 ตัว ใช้ชิ้นแต่งตัวที่วาดไว้แล้ว (`src/art/look/`)
- รูปโปรไฟล์มุมซ้ายบน ใช้หน้าตัวละครที่ผู้เล่นแต่งอยู่
- ไอคอน wifi / ฟันเฟือง / ปุ่ม + โค้ดวาดเองได้

## วิธีทำงาน

1. วาดทีละไฟล์ด้วย prompt ข้างล่าง **แนบภาพดีไซน์หน้าเมนูทุกครั้ง** เป็นตัวอย่างสไตล์
2. วางไฟล์ที่ `art-src/menu/` ตามชื่อในตาราง (ขนาดไม่ต้องเป๊ะ สคริปต์ตัดขอบและย่อให้)
3. บอก Claude ให้ต่อเข้าเกม: แปลงเป็น `public/art/sprites/menu-*.png`, `logo.png`, `menu-bg.jpg`
   แล้วจัดตำแหน่งตัวละครให้ยืนบนโขดหินพอดี

## เคล็ดลับกับ ChatGPT

- ถ้าได้พื้นหลังสีทึบ (โลโก้/ไอคอน) ให้ตอบ "make the background fully transparent, keep everything else identical"
- ถ้าภาพพื้นหลังมีปุ่ม ตัวหนังสือ หรือคนติดมา ให้ตอบ "remove all characters, text and UI, keep only the landscape"
- ถ้าโดนปฏิเสธเพราะคำว่ากระสุน/ระเบิด: ใช้ *toy, cartoon, fireworks* แทน แล้วเริ่มแชทใหม่
- ไอคอนทำในแชทเดียวกันต่อกันได้ สไตล์จะเข้ากันกว่า

---

## 1) `bg.png` ภาพพื้นหลัง

```
Use the attached menu mock-up as the style and layout reference. Draw ONLY its background
landscape as one wide image (16:9 if possible, otherwise 3:2). NO characters, NO buttons,
NO logo, NO text, NO icons, NO UI of any kind.
Style: bright sunny chunky cartoon mobile-game art, thick dark outlines, saturated colours,
soft painted shading.
- bright morning sky with soft pink-and-white clouds, a low sun glowing on the horizon
- a small floating grassy island near the top centre with a little radar dish building and a red flag
- distant mountains, a blue sea bay, green plateaus and a waterfall in the middle distance
- a few round craters with small flames and dark smoke on the plateaus (a cartoon battlefield)
- left edge: a grassy cliff with a red flag on a pole
- bottom-left, from about 8% to 55% of the width: a wide flat-topped rocky ledge, its flat top
  at about 85% of the image height, EMPTY (three characters will stand on it later)
- small props: an open wooden crate of cartoon cannon shells at the bottom centre, a grey stone
  crate at the bottom-left corner, tufts of grass and small flowers in the foreground corners
- keep the RIGHT half calmer and less detailed: big menu buttons will sit on top of it
- keep everything important away from the top and bottom 6% (the edges may be cropped)
```

## 2) `logo.png` โลโก้

ไม่ต้องมีแถบสโลแกน "ยิงหนึ่งนัด เปลี่ยนแผนที่ทั้งแผ่น" โค้ดวาดแถบนั้นเองใต้โลโก้

```
Use the attached menu mock-up as the style reference. Draw ONLY the game logo, on a fully
transparent background, wide 3:2 PNG, the logo filling most of the canvas, nothing cut off:
the word "BLACK" on the top line and "BOOM" on the bottom line, in huge chunky bold cartoon
letters with a cream-to-orange gradient fill, a thick dark outline and slight 3D depth.
The second "O" of BOOM is a round black cartoon bomb with a white skull on it and a lit,
sparking fuse. An orange-yellow spiky explosion burst behind the letters.
NO tagline, NO ribbon, NO other text.
```

## 3) ไอคอน (ไฟล์ละ 1 ภาพ)

ข้อความนำ (ใส่ต้นทุก prompt ของไอคอน):

```
Use the attached menu mock-up as the style reference. Draw ONE game icon on a fully
transparent background, square 1024x1024, centred, filling about 85% of the canvas.
No text, no frame, no circle or badge behind it, no ground shadow.
Chunky cartoon style, thick dark outline, bright saturated colours, soft painted shading.
Icon:
```

| ไฟล์ | ใช้ที่ | prompt (ต่อจากข้อความนำ) |
|---|---|---|
| `bot.png` | การ์ดเล่นกับบอท | `a cute boxy robot head, light blue-grey metal, glowing cyan eyes, round red ear caps, a short antenna with a yellow ball on top.` |
| `friends.png` | การ์ดเล่นกับเพื่อน | `two simple light-blue person silhouettes (head and shoulders), one slightly behind the other.` |
| `ranked.png` | การ์ดแข่งอันดับ | `a shiny golden trophy cup with a red star on it, framed by two golden laurel branches.` |
| `shop.png` | ปุ่มร้านค้า | `a pink shopping bag with a white star on the front and a gold handle.` |
| `pass.png` | ปุ่ม Battle Pass | `a golden ticket with a red star in the middle, tilted slightly.` |
| `coin.png` | แถบเหรียญ | `a round gold coin with a raised gold star in the middle.` |
| `gem.png` | แถบเพชร | `a cut bright blue diamond gem with a small sparkle.` |
