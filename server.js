const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // Brauzerdan (Claude artifact) so'rov kelishiga ruxsat beradi
app.use(express.json());

const IIKO_BASE = "https://api-ru.iiko.services/api/1";

// Sog'lik tekshiruvi — deploy to'g'ri ishlayotganini tekshirish uchun
app.get('/health', (req, res) => res.json({ ok: true }));

// Asosiy endpoint: apiLogin qabul qiladi, iiko bilan server-server gaplashadi,
// tashkilotlar va nuqtalar (filiallar) ro'yxatini qaytaradi.
// Eslatma: apiLogin serverda saqlanmaydi, faqat shu so'rov davomida ishlatiladi.
app.post('/api/connect', async (req, res) => {
  const { apiLogin, clientSecret } = req.body || {};
  if (!apiLogin) {
    return res.status(400).json({ error: "apiLogin talab qilinadi" });
  }

  try {
    // 1) Token olish
    const tokenRes = await fetch(`https://api-ru.iiko.services/api/v2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiLogin, clientSecret })
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return res.status(tokenRes.status).json({ error: `iiko avtorizatsiya xatosi: ${t}` });
    }
    const { token } = await tokenRes.json();

    // 2) Tashkilotlar ro'yxati
    const orgRes = await fetch(`${IIKO_BASE}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({})
    });
    if (!orgRes.ok) {
      const t = await orgRes.text();
      return res.status(orgRes.status).json({ error: `Tashkilotlarni olishda xatolik: ${t}` });
    }
    const orgData = await orgRes.json();
    const organizations = orgData.organizations || [];
    const orgIds = organizations.map(o => o.id);

    // 3) Terminal guruhlari (kassa nuqtalari / filiallar)
    let points = [];
    if (orgIds.length) {
      const tgRes = await fetch(`${IIKO_BASE}/terminal_groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ organizationIds: orgIds })
      });
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        (tgData.terminalGroups || []).forEach(g => {
          (g.items || []).forEach(p => points.push({ id: p.id, name: p.name, organizationId: g.organizationId }));
        });
      }
    }

    res.json({
      organizations: organizations.map(o => ({ id: o.id, name: o.name })),
      points
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// To'lov turlari ro'yxati
app.post('/api/payment-types', async (req, res) => {
  const { apiLogin, clientSecret } = req.body || {};
  if (!apiLogin) return res.status(400).json({ error: "apiLogin talab qilinadi" });

  try {
    const token = await getToken(apiLogin, clientSecret);
    const orgIds = await getOrgIds(token);

    const ptRes = await fetch(`${IIKO_BASE}/payment_types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ organizationIds: orgIds })
    });
    if (!ptRes.ok) {
      const t = await ptRes.text();
      return res.status(ptRes.status).json({ error: `To'lov turlarini olishda xatolik: ${t}` });
    }
    const ptData = await ptRes.json();
    res.json({ paymentTypes: ptData.paymentTypes || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buyurtmalar ro'yxati (berilgan sana oralig'i uchun) + to'lov turi va manba bo'yicha yig'indilar
app.post('/api/orders', async (req, res) => {
  const { apiLogin, clientSecret, dateFrom, dateTo } = req.body || {};
  if (!apiLogin) return res.status(400).json({ error: "apiLogin talab qilinadi" });
  if (!dateFrom || !dateTo) return res.status(400).json({ error: "dateFrom va dateTo talab qilinadi" });

  try {
    const token = await getToken(apiLogin, clientSecret);

    // Tashkilotlar + filial nomlari uchun terminal guruhlari
    const orgRes = await fetch(`${IIKO_BASE}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({})
    });
    if (!orgRes.ok) {
      const t = await orgRes.text();
      return res.status(orgRes.status).json({ error: `Tashkilotlarni olishda xatolik: ${t}` });
    }
    const orgData = await orgRes.json();
    const organizations = orgData.organizations || [];
    const orgIds = organizations.map(o => o.id);

    let branchByOrgId = {};
    organizations.forEach(o => { branchByOrgId[o.id] = o.name; });

    const tgRes = await fetch(`${IIKO_BASE}/terminal_groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ organizationIds: orgIds })
    });
    if (tgRes.ok) {
      const tgData = await tgRes.json();
      (tgData.terminalGroups || []).forEach(g => {
        (g.items || []).forEach(p => { branchByOrgId[p.organizationId] = p.name; });
      });
    }

    // Buyurtmalarni olish
    const ordRes = await fetch(`${IIKO_BASE}/deliveries/by_delivery_date_and_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        organizationIds: orgIds,
        deliveryDateFrom: `${dateFrom} 00:00:00.000`,
        deliveryDateTo: `${dateTo} 23:59:59.999`
      })
    });
    if (!ordRes.ok) {
      const t = await ordRes.text();
      return res.status(ordRes.status).json({ error: `Buyurtmalarni olishda xatolik: ${t}` });
    }
    const ordData = await ordRes.json();

    // Natijani yig'ish (iiko javob strukturasi versiyaga qarab farq qilishi mumkin,
    // shuning uchun bir nechta ehtimoliy joylardan qidiramiz)
    const orders = [];
    (ordData.ordersByOrganizations || ordData.orders || []).forEach(group => {
      const orgId = group.organizationId;
      const list = group.orders || (Array.isArray(group) ? group : []);
      (Array.isArray(list) ? list : []).forEach(o => {
        const order = o.order || o;
        orders.push({
          id: order.id,
          number: order.number || order.externalNumber || '',
          date: order.whenCreated || order.deliveryDate || order.createdDate || '',
          sum: order.sum || (order.orderItems || []).reduce((a, i) => a + (i.sum || 0), 0) || 0,
          branch: branchByOrgId[orgId] || '',
          source: order.sourceKey || order.orderType?.name || order.orderServiceType || 'Noma\'lum',
          customerName: order.customer?.name || order.deliveryPoint?.address?.name || '',
          phone: order.phone || order.customer?.phone || '',
          status: order.status || '',
          payments: (order.payments || []).map(p => ({
            name: p.paymentType?.name || p.paymentTypeKind || 'Noma\'lum',
            sum: p.sum || 0
          }))
        });
      });
    });

    const sources = [...new Set(orders.map(o => o.source))];

    const paymentTotals = {};
    orders.forEach(o => {
      o.payments.forEach(p => {
        paymentTotals[p.name] = (paymentTotals[p.name] || 0) + p.sum;
      });
    });

    res.json({
      orders,
      sources,
      paymentTotals: Object.entries(paymentTotals).map(([name, sum]) => ({ name, sum }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getToken(apiLogin, clientSecret) {
  const tokenRes = await fetch(`https://api-ru.iiko.services/api/v2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiLogin, clientSecret })
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`iiko avtorizatsiya xatosi: ${t}`);
  }
  const { token } = await tokenRes.json();
  return token;
}

async function getOrgIds(token) {
  const orgRes = await fetch(`${IIKO_BASE}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({})
  });
  if (!orgRes.ok) {
    const t = await orgRes.text();
    throw new Error(`Tashkilotlarni olishda xatolik: ${t}`);
  }
  const orgData = await orgRes.json();
  return (orgData.organizations || []).map(o => o.id);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlamoqda`));
