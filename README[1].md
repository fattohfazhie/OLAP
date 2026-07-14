# Pul harakati — iiko proksi serveri

Bu kichik server brauzerdagi "Pul harakati" dasturi bilan iiko Cloud API
o'rtasida vositachi bo'ladi. Kerak, chunki brauzer to'g'ridan-to'g'ri
iiko serveriga so'rov yubora olmaydi (CORS cheklovi).

## Nima qiladi
`POST /api/connect` — `apiLogin` (iiko API kaliti) qabul qiladi, iiko bilan
server-server gaplashadi va tashkilot + filiallar (terminal guruhlari)
ro'yxatini qaytaradi. Kalit serverda saqlanmaydi.

## Talablar
- Node.js 18 yoki undan yuqori versiya

## Mahalliy ishga tushirish
```bash
npm install
npm start
```
Server `http://localhost:3000` manzilida ishga tushadi.
Tekshirish: brauzerda `http://localhost:3000/health` oching — `{"ok":true}` chiqishi kerak.

## Internetga joylashtirish (deploy)

Eng oson yo'l — **Render.com** (bepul tarif bor):

1. https://render.com da ro'yxatdan o'ting
2. Bu papkani GitHub'ga yuklang (yangi repo yarating, fayllarni push qiling)
3. Render'da **New → Web Service** tanlang, o'sha repo'ni ulang
4. Sozlamalar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. "Create Web Service" bosing — bir necha daqiqada tayyor bo'ladi
6. Sizga `https://sizning-nom.onrender.com` kabi manzil beriladi

Muqobil variantlar: **Railway.app**, **Fly.io**, yoki o'zingizning VPS
serveringiz (pm2 bilan `pm2 start server.js`).

## Endpointlar

### `POST /api/connect`
`apiLogin` qabul qiladi, tashkilot va filiallar (terminal guruhlari) ro'yxatini qaytaradi.

### `POST /api/payment-types`
`apiLogin` qabul qiladi, iikoda sozlangan to'lov turlari ro'yxatini qaytaradi.

### `POST /api/orders`
`apiLogin`, `dateFrom` (`YYYY-MM-DD`), `dateTo` (`YYYY-MM-DD`) qabul qiladi.
Berilgan davrdagi buyurtmalarni, ularning manbasi (call-center, sayt va h.k.),
to'lov turlari va filial bo'yicha taqsimotini qaytaradi.

**Muhim eslatma:** iiko API'ning buyurtma obyekti tuzilishi hisob versiyasiga
qarab bir oz farq qilishi mumkin. Agar `/api/orders` bo'sh natija yoki
kutilmagan xatolik qaytarsa — Render'dagi **Logs** bo'limida aniq xatolik matnini
ko'ring va menga yuboring, maydon nomlarini (masalan `sourceKey`, `whenCreated`)
sizning aniq hisobingizga moslab tuzataman.

## Keyingi qadam
Backend tayyor bo'lgach, uning manzilini (masalan
`https://sizning-nom.onrender.com`) "Pul harakati" dasturidagi
"Backend URL" maydoniga kiriting va "Ulanish" tugmasini bosing.
