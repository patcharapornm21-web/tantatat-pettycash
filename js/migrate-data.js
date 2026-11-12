// ข้อมูลย้ายระบบเดิม (พ.ย. 2569) — ใบเบิกของสาขาที่ยังไม่ได้บันทึกในระบบใหม่ (ไม่รวมสาขา 001, 002 ที่บัญชีบันทึกแล้ว และรายการเติมเงิน HQ)
// sheetName = ชื่อสาขาในไฟล์เดิม — ระบบจับคู่สาขาในระบบใหม่ด้วยชื่อก่อน (รหัสในไฟล์เดิมของลาดพร้าว/อ่อนนุชไม่ตรงกับระบบใหม่)
// จัดกลุ่ม 1 ใบเบิก = สาขา + วันที่ + สถานะ · วันที่แก้จาก Excel (d/m สลับกัน) เป็นเดือน 11 แล้ว
export const LEGACY_DOCS = [
 {
  "branchId": "006",
  "sheetName": "Ekkamai",
  "date": "2026-11-02",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-02",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าไปรษณีย์และขนส่ง",
    "supplier": "วิศรุต ปักษา",
    "desc": "ค่าส่งของจาก HQ มา Ekkamai",
    "requester": "นันทนา",
    "note": "",
    "amount": 85.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1tRgddZpBQmcQ5EB1iqLSs956xUln1gng/view"
   },
   {
    "date": "2026-11-02",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าไปรษณีย์และขนส่ง",
    "supplier": "สุนิสา ถันประเสริฐ",
    "desc": "ค่าส่งของจาก K-Village ไป Ekkamai",
    "requester": "นันทนา",
    "note": "",
    "amount": 95.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/19TdBEnXM76dHrVn5pZWiY5-vkIeBssaO/view"
   },
   {
    "date": "2026-11-02",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าพาหนะและเดินทาง",
    "supplier": "Grab Taxi",
    "desc": "ค่าเดินทางไปฝากเงินสดที่ธนาคาร (ไป-กลับ)",
    "requester": "นันทนา",
    "note": "",
    "amount": 112.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1fCNjMe-pomdi7w4ttVw8jtSp8TzHZZWV/view"
   }
  ]
 },
 {
  "branchId": "006",
  "sheetName": "Ekkamai",
  "date": "2026-11-03",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-03",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าไปรษณีย์และขนส่ง",
    "supplier": "วิวัฒน์ แสงราม",
    "desc": "ค่าส่งของจาก Bangna มา Ekkamai",
    "requester": "นันทนา",
    "note": "",
    "amount": 105.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/16Ddd8gbhxLf9B0iQGvLsyMuZEyfZTXe9/view"
   }
  ]
 },
 {
  "branchId": "003",
  "sheetName": "Rangsit",
  "date": "2026-11-03",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-03",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "ตอต๋องซักรีด",
    "desc": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "requester": "นางสาววิลาวรรณ ผ่องพิพัฒน์พงศ์",
    "note": "",
    "amount": 800.25,
    "hasReceipt": false
   }
  ]
 },
 {
  "branchId": "003",
  "sheetName": "Rangsit",
  "date": "2026-11-04",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-04",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "บริษัท เซ็นทรัล ฟู้ด โฮลเซลล์ จำกัด",
    "desc": "ค่าซองจดหมาย, กรรไกร",
    "requester": "นางสาววิลาวรรณ ผ่องพิพัฒน์พงศ์",
    "note": "",
    "amount": 201.0,
    "hasReceipt": false
   }
  ]
 },
 {
  "branchId": "004",
  "sheetName": "GMM",
  "date": "2026-11-03",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-03",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าไปรษณีย์และขนส่ง",
    "supplier": "Grab",
    "desc": "ส่ง RTN ให้ ลค vip เนื่องจากอาจารย์ออส ให้ส่ง จำเป็นต้องใส่เนื่องจากมีการเลื่อน ลค เพราะ อาจารย์ติดประชุม เลื่อนให้เลื่อนและให้ใส่RTNรอ",
    "requester": "กมลชนก",
    "note": "",
    "amount": 63.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/17q-7xEjy69wwTYEdVcD_mXo6bLASeNVs/view"
   }
  ]
 },
 {
  "branchId": "006",
  "sheetName": "Ekkamai",
  "date": "2026-11-07",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-07",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "มิสเตอรดีไอวาย",
    "desc": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "requester": "นันทนา ธนะมูล",
    "note": "",
    "amount": 352.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1uhQa7z4yreSow_a-6QUrEOgIvv3Owwow/view"
   },
   {
    "date": "2026-11-07",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "big c",
    "desc": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "requester": "นันทนา ธนะมูล",
    "note": "",
    "amount": 310.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/16G0IVBvgY03yrivEmBf1Sv2nguQecqI6/view"
   }
  ]
 },
 {
  "branchId": "010",
  "sheetName": "Central Northville",
  "date": "2026-11-07",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-07",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าใช้จ่ายเบ็ดเตล็ด",
    "supplier": "ออฟฟิศเมท (ไทย)",
    "desc": "น้ำยาถูพื้น",
    "requester": "วิลาวรรณ ผ่องพิพัฒน์พงศ์",
    "note": "",
    "amount": 248.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1_AO6NXrT4P8XZuqE8T86iMyg1MZsxHIz/view"
   }
  ]
 },
 {
  "branchId": "012",
  "sheetName": "Bangna",
  "date": "2026-11-04",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-04",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าพาหนะและเดินทาง",
    "supplier": "คุณบุณพจน์ หล้าสุด",
    "desc": "ค่าส่งเอกสารไปออฟฟิศ",
    "requester": "แสงรวีวรรณ มีพิมล",
    "note": "",
    "amount": 149.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1yufNFbanN3eKuji0dUc9BeoKss3zcttJ/view"
   }
  ]
 },
 {
  "branchId": "006",
  "sheetName": "Ekkamai",
  "date": "2026-11-09",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-09",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "บิ๊กซี ซุเปอร์เซ็นเตอร์ บมจ.",
    "desc": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "requester": "นันทนา",
    "note": "",
    "amount": 69.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1_oZOE6aKFX4Y7DumAXAvR656jehnjaM9/view"
   }
  ]
 },
 {
  "branchId": "010",
  "sheetName": "Central Northville",
  "date": "2026-11-10",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-10",
    "docType": "ใบเสร็จรับเงิน/ใบกำกับภาษี",
    "category": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "supplier": "BIG Camera",
    "desc": "ค่าวัสดุและอุปกรณ์สำนักงาน",
    "requester": "คุณวิลาวรรณ",
    "note": "",
    "amount": 200.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1smduzv0b5O0EZKFn28tw4P_XvheVsDwi/view"
   }
  ]
 },
 {
  "branchId": "014",
  "sheetName": "Onnut",
  "date": "2026-11-08",
  "status": "replenished",
  "items": [
   {
    "date": "2026-11-08",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าใช้จ่ายเบ็ดเตล็ด",
    "supplier": "นาง เมทะนี ฤกษ์นอก / นาย เสน่ห์ โตเอี่ยม",
    "desc": "ซื้อของไหว้ (ดอกไม้,ธูป,หมากพลู,ส้ม)",
    "requester": "นางสาว ณัฐวดี แสงงาม",
    "note": "",
    "amount": 125.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1CHALis5TbU81xigjrSdCFKSTskd5vqXD/view",
    "legacyNo": "ON-PC2611-001"
   }
  ]
 },
 {
  "branchId": "013",
  "sheetName": "Ladprao",
  "date": "2026-11-11",
  "status": "pending",
  "items": [
   {
    "date": "2026-11-11",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าใช้จ่ายเบ็ดเตล็ด",
    "supplier": "เขตจตุจักร",
    "desc": "ตัดต้นไม้บริเวณหน้าสาขา2ต้น",
    "requester": "อินทุกานดา",
    "note": "",
    "amount": 2200.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/17mBmN7EjwLcFP3V8DBwyRO8BuHl2sBwt/view"
   }
  ]
 },
 {
  "branchId": "006",
  "sheetName": "Ekkamai",
  "date": "2026-11-11",
  "status": "approved",
  "items": [
   {
    "date": "2026-11-11",
    "docType": "ใบรับรองแทนใบเสร็จ",
    "category": "ค่าไปรษณีย์และขนส่ง",
    "supplier": "เมธา วงแสง",
    "desc": "ค่าส่งเอกสาร",
    "requester": "นันทนา",
    "note": "",
    "amount": 82.0,
    "hasReceipt": false,
    "driveUrl": "https://drive.google.com/file/d/1N6bODP-KXHy94djLt0jFt6LC5r2-GL1Y/view"
   }
  ]
 }
];
