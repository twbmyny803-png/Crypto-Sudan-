const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

/* تجهيز مجلدات رفع الملفات */
const uploadBaseDir = path.join(__dirname, "uploads");
const verificationDir = path.join(uploadBaseDir, "verification");
const depositReceiptsDir = path.join(uploadBaseDir, "deposit-receipts");

if (!fs.existsSync(uploadBaseDir)) {
  fs.mkdirSync(uploadBaseDir, { recursive: true });
}
if (!fs.existsSync(verificationDir)) {
  fs.mkdirSync(verificationDir, { recursive: true });
}
if (!fs.existsSync(depositReceiptsDir)) {
  fs.mkdirSync(depositReceiptsDir, { recursive: true });
}

app.use("/uploads", express.static(uploadBaseDir));

/* إعدادات مشتركة لرفع الملفات */
function commonFileFilter(req, file, cb) {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("نوع الملف غير مدعوم، ارفع صورة فقط"));
  }
  cb(null, true);
}

const verificationStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, verificationDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeName = "verify-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  },
});

const depositStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, depositReceiptsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeName = "deposit-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  },
});

const verificationUpload = multer({
  storage: verificationStorage,
  fileFilter: commonFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const depositUpload = multer({
  storage: depositStorage,
  fileFilter: commonFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* الصفحات */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "register.html")));
app.get("/forgot", (req, res) => res.sendFile(path.join(__dirname, "forgot.html")));
app.get("/verify-identity", (req, res) => res.sendFile(path.join(__dirname, "verify.html")));
app.get("/deposit", (req, res) => res.sendFile(path.join(__dirname, "deposit.html")));

/* الاتصال بقاعدة البيانات */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* تخزين أكواد التحقق */
let codes = {};

/* تعابير النمط للتحقق */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function isStrongPassword(password) {
  return passwordRegex.test(password);
}

function isValidWithdrawPassword(password) {
  return /^\d{6}$/.test(password || "");
}

/* إعداد إرسال الإيميل */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "twbmyny803@gmail.com",
    pass: "oyiivkrudpiejjbd", // تنبيه: من الأفضل تخزين هذا في متغيرات البيئة
  },
});

/* دوال مساعدة */
function generateReferralCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

async function createUniqueReferralCode() {
  let code = generateReferralCode();
  while (true) {
    const result = await pool.query("SELECT id FROM users WHERE referral_code = $1", [code]);
    if (result.rows.length === 0) {
      return code;
    }
    code = generateReferralCode();
  }
}

function generateDepositRequestId() {
  return "DEP-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
}

async function createUniqueDepositRequestId() {
  let requestId = generateDepositRequestId();
  while (true) {
    const result = await pool.query("SELECT id FROM deposit_requests WHERE request_id = $1", [requestId]);
    if (result.rows.length === 0) {
      return requestId;
    }
    requestId = generateDepositRequestId();
  }
}

/* تهيئة قاعدة البيانات */
async function initDatabase() {
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

    const columns = [
      "referral_code TEXT UNIQUE", "referred_by TEXT",
      "level_1_referrer TEXT", "level_2_referrer TEXT", "level_3_referrer TEXT",
      "level_4_referrer TEXT", "level_5_referrer TEXT",
      "has_deposited BOOLEAN DEFAULT false", "first_deposit_amount NUMERIC DEFAULT 0",
      "referral_earnings NUMERIC DEFAULT 0", "withdraw_password TEXT",
      "vip_level TEXT DEFAULT 'VIP0'", "verification_status TEXT DEFAULT 'غير موثق'",
      "balance NUMERIC DEFAULT 0", "verification_type TEXT",
      "verification_full_name TEXT", "verification_document_number TEXT",
      "verification_birth_date TEXT", "verification_expiry_date TEXT",
      "verification_country TEXT", "verification_front_image TEXT",
      "verification_back_image TEXT", "verification_passport_image TEXT",
      "verification_submitted_at TEXT"
    ];

    for (const column of columns) {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column}`);
    }
    console.log("User columns ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id SERIAL PRIMARY KEY, request_id TEXT UNIQUE, email TEXT NOT NULL,
        plan_name TEXT, network_code TEXT NOT NULL, network_name TEXT NOT NULL,
        deposit_address TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0,
        txid TEXT, receipt_image TEXT, status TEXT DEFAULT 'قيد الدفع',
        review_note TEXT DEFAULT '', created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP, submitted_at TIMESTAMP, reviewed_at TIMESTAMP
      )
    `);
    console.log("Deposit requests table ready");

    const nullReferralUsers = await pool.query("SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''");
    for (const row of nullReferralUsers.rows) {
      const newCode = await createUniqueReferralCode();
      await pool.query("UPDATE users SET referral_code = $1 WHERE id = $2", [newCode, row.id]);
    }
    console.log("Referral codes backfilled");

  } catch (error) {
    console.log("INIT DATABASE ERROR:", error);
  }
}

initDatabase();

/* وظائف دورية */
async function expireOldDepositRequests() {
  try {
    await pool.query(`
      UPDATE deposit_requests
      SET status = 'ملغي', review_note = 'انتهت مدة الطلب', reviewed_at = NOW()
      WHERE status = 'قيد الدفع' AND expires_at IS NOT NULL AND expires_at < NOW()
    `);
  } catch (error) {
    console.log("EXPIRE DEPOSIT REQUESTS ERROR:", error);
  }
}

setInterval(expireOldDepositRequests, 30000);

/* توزيع أرباح الإحالة */
async function applyFirstDepositBenefits(cleanEmail, depositAmount) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1 AND verified = true", [cleanEmail]);
  const user = result.rows[0];
  if (!user || user.has_deposited) return;

  await pool.query("UPDATE users SET has_deposited = true, first_deposit_amount = $1 WHERE email = $2", [depositAmount, cleanEmail]);

  const rewardPlan = [
    { code: user.level_1_referrer, percent: 15 }, { code: user.level_2_referrer, percent: 7 },
    { code: user.level_3_referrer, percent: 4 }, { code: user.level_4_referrer, percent: 2 },
    { code: user.level_5_referrer, percent: 1 }
  ];

  for (const item of rewardPlan) {
    if (!item.code) continue;
    const reward = (depositAmount * item.percent) / 100;
    await pool.query(
      "UPDATE users SET referral_earnings = COALESCE(referral_earnings, 0) + $1 WHERE referral_code = $2",
      [reward, item.code]
    );
  }
}

/* عدد المستخدمين */
app.get("/users-count", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM users");
    res.json({ count: Number(result.rows[0].count) });
  } catch (error) {
    console.log("USERS COUNT ERROR:", error);
    res.json({ count: 0 });
  }
});
