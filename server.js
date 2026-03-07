const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

/* =========================
   الاتصال بقاعدة البيانات
========================= */

const pool = new Pool({
  connectionString: "postgresql://sudancry:7C6UZe2r1Z5waNMYem0cKRwQYKHkAv2p@dpg-d6m79rf5r7bs73c90d60-a.oregon-postgres.render.com/sudancrypto",
  ssl: { rejectUnauthorized: false }
});

/* إنشاء جدول المستخدمين */

async function createTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      verified BOOLEAN DEFAULT false
    )
  `);
}

createTable();

/* =========================
   تخزين أكواد التحقق مؤقت
========================= */

let codes = {};

/* =========================
   إعداد إرسال الإيميل
========================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =========================
   تسجيل حساب
========================= */

app.post("/register", async (req, res) => {

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ message: "املأ كل البيانات" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = code;

  try {

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Sudan Crypto Verification Code",
      html: `<h2>Sudan Crypto</h2><p>كود التحقق:</p><h1>${code}</h1>`
    });

    await pool.query(
      "INSERT INTO users (name,email,password) VALUES ($1,$2,$3)",
      [name, email, password]
    );

    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });

  } catch (error) {
    console.log(error);
    res.json({ message: "فشل إنشاء الحساب" });
  }

});

/* =========================
   التحقق من الكود
========================= */

app.post("/verify", async (req, res) => {

  const { email, code } = req.body;

  if (codes[email] != code) {
    return res.json({ message: "الكود غير صحيح" });
  }

  await pool.query(
    "UPDATE users SET verified=true WHERE email=$1",
    [email]
  );

  res.json({ message: "تم التحقق من البريد بنجاح" });

});

/* =========================
   إرسال كود تسجيل الدخول
========================= */

app.post("/send-login-code", async (req, res) => {

  const { email } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    return res.json({ message: "الحساب غير موجود" });
  }

  if (!user.verified) {
    return res.json({ message: "يجب التحقق من البريد أولاً" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = code;

  try {

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Sudan Crypto Login Code",
      html: `<h2>Sudan Crypto</h2><p>كود تسجيل الدخول:</p><h1>${code}</h1>`
    });

    res.json({ message: "تم إرسال كود تسجيل الدخول إلى بريدك" });

  } catch (error) {
    res.json({ message: "فشل إرسال الكود" });
  }

});

/* =========================
   تسجيل الدخول
========================= */

app.post("/login", async (req, res) => {

  const { email, password, code } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    return res.json({ message: "الحساب غير موجود" });
  }

  if (!user.verified) {
    return res.json({ message: "يجب التحقق من البريد أولاً" });
  }

  if (user.password !== password) {
    return res.json({ message: "كلمة المرور غير صحيحة" });
  }

  if (codes[email] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  res.json({ message: "تم تسجيل الدخول بنجاح" });

});

/* =========================
   تشغيل السيرفر
========================= */

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
