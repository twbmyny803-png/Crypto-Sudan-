const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

let users = {};
let codes = {};

// إعداد إرسال الإيميل
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// تسجيل حساب وإرسال الكود
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
      html: `<h2>Sudan Crypto</h2><p>كود التحقق هو:</p><h1>${code}</h1>`
    });

    users[email] = { name, password, verified: false };
    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
  } catch (error) {
    console.log("MAIL ERROR:", error);
    res.status(500).json({ message: "فشل إرسال الكود" });
  }
});

// تحقق من كود التسجيل
app.post("/verify", (req, res) => {
  const { email, code } = req.body;

  if (!users[email]) {
    return res.json({ message: "الحساب غير موجود" });
  }

  if (codes[email] == code) {
    users[email].verified = true;
    res.json({ message: "تم التحقق من البريد بنجاح" });
  } else {
    res.json({ message: "الكود غير صحيح" });
  }
});

// إرسال كود تسجيل الدخول
app.post("/send-login-code", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "أدخل البريد الإلكتروني" });
  }

  const user = users[email];

  if (!user) {
    return res.status(404).json({ message: "الحساب غير موجود" });
  }

  if (!user.verified) {
    return res.status(403).json({ message: "يجب التحقق من البريد أولاً" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[email] = code;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Sudan Crypto Login Code",
      html: `<h2>Sudan Crypto</h2><p>كود تسجيل الدخول هو:</p><h1>${code}</h1>`
    });

    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
  } catch (error) {
    console.log("LOGIN MAIL ERROR:", error);
    res.status(500).json({ message: "فشل إرسال كود تسجيل الدخول" });
  }
});

// تسجيل الدخول
app.post("/login", (req, res) => {
  const { email, password, code } = req.body;

  const user = users[email];

  if (!user) {
    return res.json({ message: "الحساب غير موجود" });
  }

  if (!user.verified) {
    return res.json({ message: "يجب التحقق من البريد أولاً" });
  }

  if (user.password !== password) {
    return res.json({ message: "كلمة المرور غير صحيحة" });
  }

  if (!code) {
    return res.json({ message: "أدخل كود التحقق" });
  }

  if (codes[email] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  res.json({ message: "تم تسجيل الدخول بنجاح" });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
