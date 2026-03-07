const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

const USERS_FILE = path.join(__dirname, "users.json");

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

function loadUsers() {
  try {
    ensureUsersFile();
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.log("LOAD USERS ERROR:", error);
    return {};
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    return true;
  } catch (error) {
    console.log("SAVE USERS ERROR:", error);
    return false;
  }
}

ensureUsersFile();

let users = loadUsers();
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

  const cleanEmail = String(email).trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  users = loadUsers();

  // لو الحساب موجود من قبل، نحدّث بياناته ونرجع نطلب التحقق
  users[cleanEmail] = {
    name,
    password,
    verified: false
  };

  const saved = saveUsers(users);
  if (!saved) {
    return res.status(500).json({ message: "فشل حفظ الحساب" });
  }

  codes[cleanEmail] = code;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: cleanEmail,
      subject: "Sudan Crypto Verification Code",
      html: `<h2>Sudan Crypto</h2><p>كود التحقق هو:</p><h1>${code}</h1>`
    });

    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
  } catch (error) {
    console.log("MAIL ERROR:", error);
    res.status(500).json({ message: "فشل إرسال الكود" });
  }
});

// تحقق من كود التسجيل
app.post("/verify", (req, res) => {
  const { email, code } = req.body;
  const cleanEmail = String(email || "").trim().toLowerCase();

  users = loadUsers();

  if (!users[cleanEmail]) {
    return res.json({ message: "الحساب غير موجود" });
  }

  if (codes[cleanEmail] == code) {
    users[cleanEmail].verified = true;

    const saved = saveUsers(users);
    if (!saved) {
      return res.status(500).json({ message: "فشل تحديث حالة التحقق" });
    }

    res.json({ message: "تم التحقق من البريد بنجاح" });
  } else {
    res.json({ message: "الكود غير صحيح" });
  }
});

// إرسال كود تسجيل الدخول
app.post("/send-login-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.status(400).json({ message: "أدخل البريد الإلكتروني" });
  }

  users = loadUsers();
  const user = users[cleanEmail];

  if (!user) {
    return res.status(404).json({ message: "الحساب غير موجود" });
  }

  if (!user.verified) {
    return res.status(403).json({ message: "يجب التحقق من البريد أولاً" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  codes[cleanEmail] = code;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: cleanEmail,
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
  const cleanEmail = String(email || "").trim().toLowerCase();

  users = loadUsers();
  const user = users[cleanEmail];

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

  if (codes[cleanEmail] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  res.json({ message: "تم تسجيل الدخول بنجاح" });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
