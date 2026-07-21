// Helwip Merch — сервер двоетапної перевірки (2FA)
// Приймає запит "надіслати код" -> генерує 6-значний код -> шле листом через Gmail
// Приймає запит "перевірити код" -> порівнює з тим, що зберігається в пам'яті

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors()); // дозволяємо запити з будь-якого сайту (сам сайт — публічний артефакт)
app.use(express.json());

// ---------- Налаштування пошти ----------
// GMAIL_USER та GMAIL_APP_PASSWORD задаються як змінні середовища на Render,
// НЕ пишемо їх прямо в код.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ---------- Тимчасове сховище кодів (в пам'яті процесу) ----------
// { email: { code, expiresAt } }
const pendingCodes = new Map();
const CODE_TTL_MS = 10 * 60 * 1000; // 10 хвилин

function generateCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanupExpired(){
  const now = Date.now();
  for(const [email, entry] of pendingCodes.entries()){
    if(entry.expiresAt < now) pendingCodes.delete(email);
  }
}

// ---------- Точка входу: надіслати код ----------
app.post('/send-code', async (req, res) => {
  try{
    const email = String(req.body.email || '').trim().toLowerCase();
    if(!email || !email.includes('@')){
      return res.status(400).json({ ok:false, error:'Некоректний email' });
    }

    cleanupExpired();

    const code = generateCode();
    pendingCodes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS });

    await transporter.sendMail({
      from: `"Helwip Merch" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Код підтвердження — Helwip Merch',
      text: `Ваш код підтвердження: ${code}\n\nВін дійсний 10 хвилин. Якщо ви не запитували вхід — просто проігноруйте цей лист.`,
      html: `
        <div style="font-family:sans-serif; padding:20px; background:#0e0f13; color:#f3f4f7;">
          <h2 style="color:#ff7a45;">Helwip Merch</h2>
          <p>Ваш код підтвердження:</p>
          <div style="font-size:32px; font-weight:800; letter-spacing:8px; color:#ffcb52; margin:16px 0;">${code}</div>
          <p style="color:#8b8e9b; font-size:13px;">Код дійсний 10 хвилин. Якщо ви не запитували вхід — проігноруйте цей лист.</p>
        </div>
      `
    });

    res.json({ ok:true });
  }catch(err){
    console.error('send-code failed:', err);
    res.status(500).json({ ok:false, error:'Не вдалося надіслати лист' });
  }
});

// ---------- Точка входу: перевірити код ----------
app.post('/verify-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();

  cleanupExpired();

  const entry = pendingCodes.get(email);
  if(!entry){
    return res.json({ ok:false, error:'Код не запитувався або вже застарів' });
  }
  if(entry.code !== code){
    return res.json({ ok:false, error:'Невірний код' });
  }

  pendingCodes.delete(email); // код можна використати лише раз
  res.json({ ok:true });
});

// ---------- Перевірка, що сервер живий (для Render health check) ----------
app.get('/', (req, res) => {
  res.send('Helwip auth server is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Helwip auth server listening on port ${PORT}`);
});
