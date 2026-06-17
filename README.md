# DetectLog — Security Monitoring System

ระบบกันขโมยที่ใช้ ESP32 เป็นเซ็นเซอร์ตรวจจับ ส่งข้อมูลผ่าน Google Apps Script และแสดงผลผ่าน Web Dashboard

---

## ภาพรวมระบบ

```
[Switch / Sensor]
       │
       ▼
[Write Board (ESP32)]  ──── HTTP GET ────▶  [Google Apps Script]
                                                     │
[Read Board (ESP32)]   ◀─── HTTP GET ────           │
       │                                      [Google Sheets]
       ▼                                             │
  [Relay / ไฟ]                                       ▼
                                           [Web Dashboard]
                                          index.html / app.js
```

เมื่อมีการกดสวิตช์ที่ Write Board → ข้อมูลถูกส่งไปบันทึกใน Google Sheets → Read Board ดึงข้อมูลมาและสั่งเปิด Relay ตามเงื่อนไขที่ตั้งไว้ → Web Dashboard แสดงสถานะและ log ทั้งหมดแบบ real-time

---

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงสร้างหน้าเว็บ (HTML) |
| `style.css` | การออกแบบและธีมสี |
| `app.js` | การทำงานทั้งหมดของ dashboard |
| `Write_Board_v9_2.ino` | Firmware สำหรับบอร์ดตรวจจับ |
| `Read_Board_v10_2.ino` | Firmware สำหรับบอร์ดควบคุม Relay |
| `Google_Apps_Script.gs` | Backend และฐานข้อมูล (Google Sheets) |

---

## อุปกรณ์

- **Write Board** — ESP32 ต่อกับสวิตช์หรือเซ็นเซอร์ (Input pins: 5, 18, 19, 15)
- **Read Board** — ESP32 ต่อกับ Relay (Output pin: 33)
- WiFi: BGRIMM-GUEST (ไม่มีรหัสผ่าน) พร้อม WiFi สำรองตั้งได้ผ่าน Web UI

---

## การทำงานของแต่ละส่วน

### 1. Write Board (`Write_Board_v9_2.ino`)

บอร์ดนี้ทำหน้าที่ **ตรวจจับและรายงาน** เมื่อมีการกดสวิตช์หรือเซ็นเซอร์ทำงาน

**ลำดับการทำงาน:**

```
เปิดเครื่อง
    │
    ├─ โหลด WiFi สำรองจาก flash memory
    ├─ ลอง WiFi หลัก (BGRIMM-GUEST) 3 ครั้ง
    │       ล้มเหลว → ลอง WiFi สำรอง 3 ครั้ง
    │       ล้มเหลวทั้งหมด → reboot
    │
    ├─ Sync เวลาจาก NTP (UTC+7)
    ├─ Register กับ GAS (แจ้ง MAC Address)
    │
    └─ Loop หลัก:
           ├─ ตรวจสอบสวิตช์ทุก 50ms (debounce 1 วิ)
           │
           ├─ ถ้ากดสวิตช์:
           │       ส่ง detect ทันที
           │       ส่งซ้ำทุก 35 วิ ตลอดที่กดค้าง
           │       ส่ง detect อีกครั้งเมื่อปล่อย
           │
           ├─ ถ้าไม่มีการกด:
           │       ส่ง heartbeat ทุก 5 นาที (แจ้งว่ายังออนไลน์อยู่)
           │
           └─ ทุก 10 นาที: เช็ค WiFi สำรองใหม่จาก GAS
```

**พฤติกรรมพิเศษ:**
- LED บนบอร์ดกะพริบเมื่อส่งข้อมูล
- Watchdog timer 60 วิ ป้องกันบอร์ดค้าง
- ถ้า WiFi หลักหลุด → reconnect อัตโนมัติ ลอง Primary ก่อน ถ้าไม่ได้จึงไป Backup

---

### 2. Read Board (`Read_Board_v10_2.ino`)

บอร์ดนี้ทำหน้าที่ **รับคำสั่งและควบคุม Relay** (เปิด/ปิดไฟหรืออุปกรณ์)

**ลำดับการทำงาน:**

```
เปิดเครื่อง
    │
    ├─ เชื่อมต่อ WiFi (Primary → Backup)
    ├─ Sync เวลาจาก NTP
    ├─ Register กับ GAS
    ├─ โหลด Settings และ Schedule จาก GAS
    │
    └─ Loop หลัก (ทุก 35 วิ):
           ├─ ถามค่า GAS ว่ามี detect ใน 5 นาทีที่ผ่านมามั้ย
           │
           ├─ ถ้ามี detect + อยู่ในช่วงเวลาที่อนุญาต:
           │       เปิด Relay → ดับอัตโนมัติหลัง 15 วิ
           │       ถ้ามี detect ใหม่ก่อน 15 วิหมด → รีเซ็ต timer
           │
           ├─ ทุก 5 นาที: ดึง Mode และ Settings ใหม่จาก GAS
           ├─ ทุก 10 นาที: ดึง Schedule รายวัน + เช็ค WiFi สำรอง
           │
           └─ Heartbeat ทุก 5 นาที: แจ้งว่ายังออนไลน์
```

**การตัดสินใจเปิด Relay ตาม Mode:**

| Mode | พฤติกรรม |
|---|---|
| 1 — 24 ชม. | เปิดได้ตลอด ทุกวัน |
| 2 — ตารางสัปดาห์ | ใช้ตารางรายวันที่ตั้งไว้ |
| 3 — กลางคืน | ใช้ตารางรายวันที่ตั้งไว้ |
| 4 — ปิด | ไม่เปิด Relay ไม่ว่ากรณีใด |
| Force ON | เปิดตลอด ข้าม Mode และ Schedule ทั้งหมด |

---

### 3. Google Apps Script (`Google_Apps_Script.gs`)

ทำหน้าที่เป็น **Backend และฐานข้อมูล** รับ HTTP request จากบอร์ดและ Web UI แล้วอ่าน/เขียนข้อมูลใน Google Sheets

**Endpoints ที่รองรับ:**

| Endpoint | ส่งมาจาก | หน้าที่ |
|---|---|---|
| `sts=register` | Write/Read Board | แจ้งว่าบอร์ดออนไลน์ อัปเดตเวลาล่าสุด |
| `sts=log` | Write Board | บันทึก detect หรือ heartbeat ลง SwitchLog |
| `sts=latest` | Read Board | ถามว่ามี detect ใน 5 นาทีที่ผ่านมามั้ย |
| `sts=devices` | Web UI | ดึงรายชื่อบอร์ดทั้งหมดจาก DeviceMap |
| `sts=history` | Web UI | ดึง log ย้อนหลังทั้งหมด |
| `sts=login` | Web UI | ตรวจสอบ username/password และคืน role |
| `sts=getmode` / `setmode` | Read Board / Web UI | อ่าน/เปลี่ยน Mode การทำงาน |
| `sts=getsettings` / `savesettings` | Read Board / Web UI | อ่าน/บันทึก timeout, poll interval |
| `sts=getschedule` / `saveschedule` | Read Board / Web UI | อ่าน/บันทึกตารางเวลา 7 วัน |
| `sts=getbackupwifi` / `setbackupwifi` | Read/Write Board / Web UI | อ่าน/บันทึก WiFi สำรอง |
| `sts=getsettingslog` | Web UI | ดึงประวัติการเปลี่ยน settings |

**Google Sheets ที่ใช้:**

| Sheet | เก็บอะไร |
|---|---|
| `SwitchLog` | บันทึก detect/heartbeat ทุกครั้ง |
| `DeviceMap` | จับคู่ Read ↔ Write Board (MAC Address) |
| `DailySummary` | สรุปจำนวน detect รายวัน |
| `Settings` | Mode, timeout, poll interval, force relay |
| `ScheduleConfig` | ตารางเวลา 7 วัน (เปิด/ปิด, เวลาเริ่ม-สิ้นสุด) |
| `SettingsLog` | ประวัติการเปลี่ยน settings ทุกครั้ง |
| `Users` | username, password, role (admin/viewer) |
| `BackupWiFi` | WiFi สำรองแต่ละบอร์ด |

---

### 4. Web Dashboard (`index.html` + `style.css` + `app.js`)

หน้าเว็บสำหรับ **ดูและควบคุมระบบ** ผ่านเบราว์เซอร์ ไม่ต้องติดตั้งอะไรเพิ่ม

**หน้าที่มีทั้งหมด:**

| หน้า | เนื้อหา |
|---|---|
| ภาพรวมระบบ | สถานะบอร์ดทั้งหมด, จำนวน detect วันนี้, บอร์ดที่ออนไลน์ |
| Floorplan | แผนผังอาคารแสดง zone ที่ตรวจพบ real-time |
| สถิติ Detect | กราฟจำนวน detect แยกบอร์ด แยกวัน |
| รายวัน | สรุป detect รายวันแยก Board |
| Log ย้อนหลัง | ตารางบันทึกทุกรายการ กรองตามวันได้ |
| โหมดการทำงาน | เลือก Mode 1-4 + Force Relay ON/OFF |
| WiFi สำรอง | ตั้ง WiFi สำรองแยกแต่ละบอร์ด |
| ตั้งค่าขั้นสูง | ปรับเวลา, timeout, ตารางรายวัน, ประวัติ settings |

**ระบบ Login และสิทธิ์:**

| Role | สิทธิ์ |
|---|---|
| `admin` | ดูและแก้ไขได้ทุกอย่าง |
| `viewer` | ดูได้อย่างเดียว ไม่เห็นหัวข้อ System |

session จำสถานะ login ไว้ตลอดจนกว่าจะกดออกจากระบบหรือปิดเบราว์เซอร์

---

## WiFi สำรอง

บอร์ดทุกตัวรองรับ WiFi สำรอง 1 ชื่อ ทำงานแบบนี้:

```
Boot → ลอง WiFi หลัก (BGRIMM-GUEST) 3 ครั้ง
         สำเร็จ → ทำงานปกติ
         ล้มเหลว → ลอง WiFi สำรอง 3 ครั้ง
                     สำเร็จ → ทำงานปกติ
                     ล้มเหลว → reboot แล้วลองใหม่
```

เปลี่ยน WiFi สำรองได้จาก Web UI หน้า "WiFi สำรอง" โดยไม่ต้องแตะบอร์ด บอร์ดจะรับค่าใหม่ภายใน 10 นาที

---

## การ Pair Read ↔ Write Board

ต้องกรอก MAC Address ด้วยมือใน Google Sheets → Sheet `DeviceMap`

```
A (mac_read)   | B (mac_write)   | C (label)
704BCA9958D0   | 1CC3ABD11080    | Zone 1
704BCA9958D0   | 1CC3ABD10C24    | Zone 2
```

Read Board 1 ตัวรับ Write Board ได้หลายตัว — ถ้า Write ตัวใดตัวหนึ่ง detect → Relay ติด

---

## การ Deploy

**Google Apps Script:**
1. เปิด [script.google.com](https://script.google.com) → สร้างโปรเจกต์ใหม่
2. วางโค้ดจาก `Google_Apps_Script.gs`
3. Deploy → Web App → Execute as: Me → Who has access: Anyone
4. คัดลอก URL มาใส่ใน firmware และ `app.js` (ตัวแปร `DEFAULT_URL`)

**Firmware:**
1. เปิด Arduino IDE → ติดตั้ง board ESP32
2. เปิดไฟล์ `.ino` → แก้ `Web_App_URL` ให้ตรงกับ GAS URL
3. Upload ไปที่บอร์ด

**Web Dashboard:**
1. อัปโหลด `index.html`, `style.css`, `app.js` ไปใน GitHub repo เดียวกัน
2. เปิด GitHub Pages → Deploy from main branch
3. เปิดหน้าเว็บ → กรอก username/password → ใช้งานได้เลย

---

## ข้อมูลเพิ่มเติม

- Firmware เขียนด้วย Arduino (C++) สำหรับ ESP32
- Backend เขียนด้วย Google Apps Script (JavaScript)
- Web Dashboard เขียนด้วย HTML/CSS/JavaScript ล้วน ไม่มี framework
- ไม่มี server ของตัวเอง ทุกอย่างรันบน Google และ GitHub Pages ฟรี
