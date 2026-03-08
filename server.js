const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

/* الصفحة الرئيسية تفتح تسجيل الدخول */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

/* صفحات مباشرة */
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/forgot", (req, res) => {
  res.sendFile(path.join(__dirname, "forgot.html"));
});

/* الاتصال بقاعدة البيانات */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* إنشاء جدول المستخدمين */

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        verified BOOLEAN DEFAULT false
      )
    `);
    console.log("Users table ready");
  } catch (error) {
    console.log("CREATE TABLE ERROR:", error);
  }
}

createTable();

/* تخزين أكواد التحقق */

let codes = {};

/* إعداد إرسال الإيميل */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "twbmyny803@gmail.com",
    pass: "oyiivkrudpiejjbd"
  }
});

/* عدد الحسابات */

app.get("/users-count", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM users");
    res.json({ count: Number(result.rows[0].count) });
  } catch (error) {
    console.log("USERS COUNT ERROR:", error);
    res.json({ count: 0 });
  }
});

/* تسجيل حساب */

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ message: "املأ كل البيانات" });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [cleanEmail]
    );

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    codes[cleanEmail] = code;

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      if (user.verified) {
        delete codes[cleanEmail];
        return res.json({ message: "هذا البريد الإلكتروني مسجل بالفعل" });
      }

      await transporter.sendMail({
        from: "Sudan Crypto <twbmyny803@gmail.com>",
        to: cleanEmail,
        subject: "Sudan Crypto Verification Code",
        html: `<h2>Sudan Crypto</h2><p>كود التحقق:</p><h1>${code}</h1>`
      });

      await pool.query(
        "UPDATE users SET name=$1, password=$2 WHERE email=$3",
        [name, password, cleanEmail]
      );

      return res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
    }

    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Verification Code",
      html: `<h2>Sudan Crypto</h2><p>كود التحقق:</p><h1>${code}</h1>`
    });

    await pool.query(
      "INSERT INTO users (name,email,password,verified) VALUES ($1,$2,$3,false)",
      [name, cleanEmail, password]
    );

    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });

  } catch (error) {
    console.log("REGISTER ERROR:", error);
    res.json({ message: "فشل إنشاء الحساب" });
  }
});

/* التحقق من الكود */

app.post("/verify", async (req, res) => {
  const { email, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (codes[cleanEmail] != code) {
    return res.json({ message: "الكود غير صحيح" });
  }

  try {
    await pool.query(
      "UPDATE users SET verified=true WHERE email=$1",
      [cleanEmail]
    );

    delete codes[cleanEmail];

    res.json({ message: "تم التحقق من البريد بنجاح" });
  } catch (error) {
    console.log("VERIFY ERROR:", error);
    res.json({ message: "فشل التحقق من البريد" });
  }
});

/* إرسال كود تسجيل الدخول */

app.post("/send-login-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    if (!user.verified) {
      return res.json({ message: "يجب التحقق من البريد أولاً" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    codes[cleanEmail] = code;

    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Login Code",
      html: `<h2>Sudan Crypto</h2><p>كود تسجيل الدخول:</p><h1>${code}</h1>`
    });

    res.json({ message: "تم إرسال كود تسجيل الدخول إلى بريدك" });

  } catch (error) {
    console.log("SEND LOGIN CODE ERROR:", error);
    res.json({ message: "فشل إرسال الكود" });
  }
});

/* تسجيل الدخول */

app.post("/login", async (req, res) => {
  const { email, password, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [cleanEmail]
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

    if (codes[cleanEmail] != code) {
      return res.json({ message: "كود التحقق غير صحيح" });
    }

    delete codes[cleanEmail];

    res.json({ message: "تم تسجيل الدخول بنجاح" });

  } catch (error) {
    console.log("LOGIN ERROR:", error);
    res.json({ message: "فشل تسجيل الدخول" });
  }
});

/* تشغيل السيرفر */

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
