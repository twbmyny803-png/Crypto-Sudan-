const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

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

// تسجيل حساب
app.post("/register", async (req, res) => {

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ message: "املأ كل البيانات" });
  }

  const code = Math.floor(100000 + Math.random() * 900000);

  codes[email] = code;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Sudan Crypto Verification Code",
    html: `<h2>Sudan Crypto</h2><p>كود التحقق هو:</p><h1>${code}</h1>`
  });

  users[email] = { name, password, verified: false };

  res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });

});

// تحقق من الكود
app.post("/verify", (req, res) => {

  const { email, code } = req.body;

  if (codes[email] == code) {
    users[email].verified = true;
    res.json({ message: "تم التحقق من البريد بنجاح" });
  } else {
    res.json({ message: "الكود غير صحيح" });
  }

});

// تسجيل الدخول
app.post("/login", (req, res) => {

  const { email, password } = req.body;

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

  res.json({ message: "تم تسجيل الدخول بنجاح" });

});

app.listen(3000, () => {
  console.log("Server started");
});
