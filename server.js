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
  }
});
const depositStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, depositReceiptsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeName = "deposit-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  }
});

const verificationUpload = multer({
  storage: verificationStorage,
  fileFilter: commonFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const depositUpload = multer({
  storage: depositStorage,
  fileFilter: commonFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "register.html"));
});

app.get("/forgot", (req, res) => {
  res.sendFile(path.join(__dirname, "forgot.html"));
});

app.get("/verify-identity", (req, res) => {
  res.sendFile(path.join(__dirname, "verify.html"));
});

app.get("/deposit", (req, res) => {
  res.sendFile(path.join(__dirname, "deposit.html"));
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
let registerCodes = {};
let loginCodes = {};
let resetCodes = {};
let withdrawCodes = {};

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!])[A-Za-z\d@$!]{8,}$/;

function isStrongPassword(password) {
  return passwordRegex.test(password);
}

function isValidWithdrawPassword(password) {
  return /^\d{6}$/.test(password || "");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "twbmyny803@gmail.com",
    pass: "oyiivkrudpiejjbd"
  }
});

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
    const result = await pool.query(
      "SELECT id FROM users WHERE referral_code = $1",
      [code]
    );

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
    const result = await pool.query(
      "SELECT id FROM deposit_requests WHERE request_id = $1",
      [requestId]
    );

    if (result.rows.length === 0) {
      return requestId;
    }

    requestId = generateDepositRequestId();
  }
}

async function ensureUserColumns() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level_1_referrer TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level_2_referrer TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level_3_referrer TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level_4_referrer TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS level_5_referrer TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_deposited BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_deposit_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_level TEXT DEFAULT 'VIP0'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'غير موثق'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_type TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_full_name TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_document_number TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_birth_date TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expiry_date TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_country TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_front_image TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_back_image TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_passport_image TEXT`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TEXT`);
    console.log("User columns ready");
  } catch (error) {
    console.log("ALTER USERS TABLE ERROR:", error);
  }
}

async function ensureDepositTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deposit_requests (
        id SERIAL PRIMARY KEY,
        request_id TEXT UNIQUE,
        email TEXT NOT NULL,
        plan_name TEXT,
        network_code TEXT NOT NULL,
        network_name TEXT NOT NULL,
        deposit_address TEXT NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0,
        txid TEXT,
        receipt_image TEXT,
        status TEXT DEFAULT 'قيد الدفع',
        review_note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        submitted_at TIMESTAMP,
        reviewed_at TIMESTAMP
      )
    `);

    console.log("Deposit requests table ready");
  } catch (error) {
    console.log("CREATE DEPOSIT REQUESTS TABLE ERROR:", error);
  }
}
async function backfillReferralCodes() {
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''"
    );

    for (const row of result.rows) {
      const newCode = await createUniqueReferralCode();
      await pool.query(
        "UPDATE users SET referral_code = $1 WHERE id = $2",
        [newCode, row.id]
      );
    }

    console.log("Referral codes backfilled");
  } catch (error) {
    console.log("BACKFILL REFERRAL CODE ERROR:", error);
  }
}

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

    await ensureUserColumns();
    await ensureDepositTable();
    await backfillReferralCodes();
  } catch (error) {
    console.log("INIT DATABASE ERROR:", error);
  }
}

initDatabase();

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
async function applyFirstDepositBenefits(cleanEmail, depositAmount) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1 AND verified = true",
    [cleanEmail]
  );

  const user = result.rows[0];

  if (!user) {
    return;
  }

  if (user.has_deposited) {
    return;
  }

  await pool.query(
    "UPDATE users SET has_deposited = true, first_deposit_amount = $1 WHERE email = $2",
    [depositAmount, cleanEmail]
  );

  const rewardPlan = [
    { code: user.level_1_referrer, percent: 15 },
    { code: user.level_2_referrer, percent: 7 },
    { code: user.level_3_referrer, percent: 4 },
    { code: user.level_4_referrer, percent: 2 },
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

app.get("/users-count", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM users");
    res.json({ count: Number(result.rows[0].count) });
  } catch (error) {
    console.log("USERS COUNT ERROR:", error);
    res.json({ count: 0 });
  }
});
app.get("/my-account-info", async (req, res) => {
  const cleanEmail = ((req.query.email || "") + "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        name,
        email,
        verified,
        has_deposited,
        withdraw_password,
        vip_level,
        verification_status,
        verification_type,
        balance
      FROM users
      WHERE email = $1
      `,
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    res.json({
      name: user.name || "",
      email: user.email || "",
      verified: !!user.verified,
      vip_status: user.vip_level || (user.has_deposited ? "VIP1" : "VIP0"),
      verification_status: user.verification_status || "غير موثق",
      verification_type: user.verification_type || "",
      balance: Number(user.balance || 0),
      has_withdraw_password: !!user.withdraw_password
    });
  } catch (error) {
    console.log("MY ACCOUNT INFO ERROR:", error);
    res.json({ message: "فشل جلب بيانات الحساب" });
  }
});
app.get("/my-verification-status", async (req, res) => {
  const cleanEmail = ((req.query.email || "") + "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        verification_status,
        verification_type,
        verification_full_name,
        verification_document_number,
        verification_birth_date,
        verification_expiry_date,
        verification_country,
        verification_front_image,
        verification_back_image,
        verification_passport_image,
        verification_submitted_at
      FROM users
      WHERE email = $1
      `,
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    res.json({
      verification_status: user.verification_status || "غير موثق",
      verification_type: user.verification_type || "",
      verification_full_name: user.verification_full_name || "",
      verification_document_number: user.verification_document_number || "",
      verification_birth_date: user.verification_birth_date || "",
      verification_expiry_date: user.verification_expiry_date || "",
      verification_country: user.verification_country || "",
      verification_front_image: user.verification_front_image || "",
      verification_back_image: user.verification_back_image || "",
      verification_passport_image: user.verification_passport_image || "",
      verification_submitted_at: user.verification_submitted_at || ""
    });
  } catch (error) {
    console.log("MY VERIFICATION STATUS ERROR:", error);
    res.json({ message: "فشل جلب حالة التوثيق" });
  }
});
app.post("/register", async (req, res) => {
  const { name, fullname, email, password, referralCode } = req.body;

  const finalName = (fullname || name || "").trim();

  if (!finalName || !email || !password) {
    return res.json({ message: "املأ كل البيانات" });
  }

  if (!isStrongPassword(password)) {
    return res.json({
      message: "كلمة المرور يجب أن تكون 8 خانات على الأقل وتحتوي على حرف كبير وحرف صغير ورقم ورمز واحد مثل @ أو $ أو !"
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanReferralCode = (referralCode || "").trim().toUpperCase();

  try {
    const existing = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [cleanEmail]
    );

    let referredBy = null;
    let level1 = null;
    let level2 = null;
    let level3 = null;
    let level4 = null;
    let level5 = null;
    if (cleanReferralCode) {
      if (!/^[A-Z]{6}$/.test(cleanReferralCode)) {
        return res.json({ message: "كود الإحالة غير صحيح" });
      }

      const referrerResult = await pool.query(
        "SELECT * FROM users WHERE referral_code = $1 AND verified = true",
        [cleanReferralCode]
      );

      if (referrerResult.rows.length === 0) {
        return res.json({ message: "كود الإحالة غير صحيح" });
      }

      const referrer = referrerResult.rows[0];

      referredBy = referrer.referral_code;
      level1 = referrer.referral_code;
      level2 = referrer.level_1_referrer || null;
      level3 = referrer.level_2_referrer || null;
      level4 = referrer.level_3_referrer || null;
      level5 = referrer.level_4_referrer || null;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    registerCodes[cleanEmail] = code;

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      if (user.verified) {
        delete registerCodes[cleanEmail];
        return res.json({ message: "هذا البريد الإلكتروني مسجل بالفعل" });
      }

      const myReferralCode = user.referral_code || await createUniqueReferralCode();
      await transporter.sendMail({
        from: "Sudan Crypto <twbmyny803@gmail.com>",
        to: cleanEmail,
        subject: "Sudan Crypto Verification Code",
        html: `<h2>Sudan Crypto</h2><p>كود التحقق:</p><h1>${code}</h1>`
      });

      await pool.query(
        `
        UPDATE users SET
          name = $1,
          password = $2,
          referral_code = $3,
          referred_by = $4,
          level_1_referrer = $5,
          level_2_referrer = $6,
          level_3_referrer = $7,
          level_4_referrer = $8,
          level_5_referrer = $9,
          verified = false
        WHERE email = $10
        `,
        [
          finalName,
          password,
          myReferralCode,
          referredBy,
          level1,
          level2,
          level3,
          level4,
          level5,
          cleanEmail
        ]
      );

      return res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
    }

    const myReferralCode = await createUniqueReferralCode();
    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Verification Code",
      html: `<h2>Sudan Crypto</h2><p>كود التحقق:</p><h1>${code}</h1>`
    });

    await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        password,
        verified,
        referral_code,
        referred_by,
        level_1_referrer,
        level_2_referrer,
        level_3_referrer,
        level_4_referrer,
        level_5_referrer
      )
      VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        finalName,
        cleanEmail,
        password,
        myReferralCode,
        referredBy,
        level1,
        level2,
        level3,
        level4,
        level5
      ]
    );

    res.json({ message: "تم إرسال كود التحقق إلى بريدك الإلكتروني" });
  } catch (error) {
    console.log("REGISTER ERROR:", error);
    res.json({ message: "فشل إنشاء الحساب" });
  }
});
app.post("/verify", async (req, res) => {
  const { email, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (registerCodes[cleanEmail] != code) {
    return res.json({ message: "الكود غير صحيح" });
  }

  try {
    await pool.query(
      "UPDATE users SET verified = true WHERE email = $1",
      [cleanEmail]
    );

    delete registerCodes[cleanEmail];

    res.json({ message: "تم التحقق من البريد بنجاح" });
  } catch (error) {
    console.log("VERIFY ERROR:", error);
    res.json({ message: "فشل التحقق من البريد" });
  }
});

app.post("/send-login-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
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
    loginCodes[cleanEmail] = code;

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

app.post("/login", async (req, res) => {
  const { email, password, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
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

    if (loginCodes[cleanEmail] != code) {
      return res.json({ message: "كود التحقق غير صحيح" });
    }

    delete loginCodes[cleanEmail];

    res.json({ message: "تم تسجيل الدخول بنجاح", name: user.name || "" });
  } catch (error) {
    console.log("LOGIN ERROR:", error);
    res.json({ message: "فشل تسجيل الدخول" });
  }
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );
    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "هذا البريد الإلكتروني غير مسجل" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[cleanEmail] = code;

    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Password Reset Code",
      html: `
        <h2>Sudan Crypto</h2>
        <p>كود إعادة تعيين كلمة المرور:</p>
        <h1>${code}</h1>
        <p>إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة.</p>
      `
    });

    res.json({ message: "تم إرسال كود إعادة تعيين كلمة المرور إلى بريدك الإلكتروني" });
  } catch (error) {
    console.log("FORGOT PASSWORD ERROR:", error);
    res.json({ message: "فشل إرسال كود إعادة التعيين" });
  }
});

app.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !code || !newPassword) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.json({
      message: "كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل وتحتوي على حرف كبير وحرف صغير ورقم ورمز واحد مثل @ أو $ أو !"
    });
  }

  if (resetCodes[cleanEmail] != code) {
    return res.json({ message: "كود إعادة التعيين غير صحيح" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "هذا البريد الإلكتروني غير مسجل" });
    }

    if (user.password === newPassword) {
      return res.json({ message: "يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة" });
    }

    await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [newPassword, cleanEmail]
    );

    delete resetCodes[cleanEmail];

    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error) {
    console.log("RESET PASSWORD ERROR:", error);
    res.json({ message: "فشل تغيير كلمة المرور" });
  }
});
app.post("/send-reset-password-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[cleanEmail] = code;

    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Change Password Code",
      html: `
        <h2>Sudan Crypto</h2>
        <p>كود تغيير كلمة المرور:</p>
        <h1>${code}</h1>
      `
    });

    res.json({ message: "تم إرسال كود التحقق إلى بريدك" });
  } catch (error) {
    console.log("SEND RESET PASSWORD CODE ERROR:", error);
    res.json({ message: "فشل إرسال الكود" });
  }
});
app.post("/change-account-password", async (req, res) => {
  const { email, oldPassword, newPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !oldPassword || !newPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isStrongPassword(newPassword)) {
    return res.json({
      message: "كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل وتحتوي على حرف كبير وحرف صغير ورقم ورمز واحد مثل @ أو $ أو !"
    });
  }

  if (resetCodes[cleanEmail] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    if (user.password !== oldPassword) {
      return res.json({ message: "كلمة المرور الحالية غير صحيحة" });
    }
    if (oldPassword === newPassword) {
      return res.json({ message: "يجب أن تكون كلمة المرور الجديدة مختلفة عن القديمة" });
    }

    await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2",
      [newPassword, cleanEmail]
    );

    delete resetCodes[cleanEmail];

    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error) {
    console.log("CHANGE ACCOUNT PASSWORD ERROR:", error);
    res.json({ message: "فشل تغيير كلمة المرور" });
  }
});

app.post("/send-withdraw-password-code", async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    withdrawCodes[cleanEmail] = code;
    await transporter.sendMail({
      from: "Sudan Crypto <twbmyny803@gmail.com>",
      to: cleanEmail,
      subject: "Sudan Crypto Withdraw Password Code",
      html: `
        <h2>Sudan Crypto</h2>
        <p>كود التحقق الخاص بكلمة مرور السحب:</p>
        <h1>${code}</h1>
        <p>إذا لم تطلب هذا الإجراء، تجاهل هذه الرسالة.</p>
      `
    });

    res.json({ message: "تم إرسال كود التحقق إلى بريدك" });
  } catch (error) {
    console.log("SEND WITHDRAW PASSWORD CODE ERROR:", error);
    res.json({ message: "فشل إرسال الكود" });
  }
});

app.post("/create-withdraw-password", async (req, res) => {
  const { email, withdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !withdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isValidWithdrawPassword(withdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب يجب أن تكون 6 أرقام فقط" });
  }

  if (withdrawCodes[cleanEmail] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    if (user.withdraw_password) {
      return res.json({ message: "كلمة مرور السحب موجودة بالفعل" });
    }

    await pool.query(
      "UPDATE users SET withdraw_password = $1 WHERE email = $2",
      [withdrawPassword, cleanEmail]
    );

    delete withdrawCodes[cleanEmail];

    res.json({ message: "تم إنشاء كلمة مرور السحب بنجاح" });
  } catch (error) {
    console.log("CREATE WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل إنشاء كلمة مرور السحب" });
  }
});

app.post("/change-withdraw-password", async (req, res) => {
  const { email, oldWithdrawPassword, newWithdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !oldWithdrawPassword || !newWithdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }
  if (!isValidWithdrawPassword(newWithdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب الجديدة يجب أن تكون 6 أرقام فقط" });
  }

  if (withdrawCodes[cleanEmail] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    if (!user.withdraw_password) {
      return res.json({ message: "لم يتم إنشاء كلمة مرور السحب بعد" });
    }

    if (user.withdraw_password !== oldWithdrawPassword) {
      return res.json({ message: "كلمة مرور السحب القديمة غير صحيحة" });
    }

    if (oldWithdrawPassword === newWithdrawPassword) {
      return res.json({ message: "يجب أن تكون كلمة مرور السحب الجديدة مختلفة عن القديمة" });
    }

    await pool.query(
      "UPDATE users SET withdraw_password = $1 WHERE email = $2",
      [newWithdrawPassword, cleanEmail]
    );
    delete withdrawCodes[cleanEmail];

    res.json({ message: "تم تغيير كلمة مرور السحب بنجاح" });
  } catch (error) {
    console.log("CHANGE WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل تغيير كلمة مرور السحب" });
  }
});

app.post("/forgot-withdraw-password", async (req, res) => {
  const { email, newWithdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !newWithdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isValidWithdrawPassword(newWithdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب يجب أن تكون 6 أرقام فقط" });
  }

  if (withdrawCodes[cleanEmail] != code) {
    return res.json({ message: "كود التحقق غير صحيح" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];
    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    await pool.query(
      "UPDATE users SET withdraw_password = $1 WHERE email = $2",
      [newWithdrawPassword, cleanEmail]
    );

    delete withdrawCodes[cleanEmail];

    res.json({ message: "تم إعادة تعيين كلمة مرور السحب بنجاح" });
  } catch (error) {
    console.log("FORGOT WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل إعادة تعيين كلمة مرور السحب" });
  }
});

app.post(
  "/submit-verification",
  verificationUpload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
    { name: "passportImage", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        email,
        documentType,
        fullName,
        documentNumber,
        birthDate,
        expiryDate,
        country
      } = req.body;
      const cleanEmail = (email || "").trim().toLowerCase();
      const cleanType = (documentType || "").trim();

      if (!cleanEmail || !cleanType || !fullName || !documentNumber || !birthDate || !country) {
        return res.json({ message: "املأ كل البيانات المطلوبة" });
      }

      if (cleanType !== "national_id" && cleanType !== "passport") {
        return res.json({ message: "نوع الوثيقة غير صحيح" });
      }

      const result = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND verified = true",
        [cleanEmail]
      );

      const user = result.rows[0];

      if (!user) {
        return res.json({ message: "الحساب غير موجود أو غير مفعل" });
      }

      if (user.verification_status === "قيد المراجعة") {
        return res.json({ message: "لديك طلب توثيق قيد المراجعة بالفعل" });
      }

      if (user.verification_status === "موثق") {
        return res.json({ message: "الحساب موثق بالفعل" });
      }

      let frontImage = "";
      let backImage = "";
      let passportImage = "";
      if (cleanType === "national_id") {
        if (!req.files || !req.files.frontImage || !req.files.backImage) {
          return res.json({ message: "ارفع صورة الوجه الأمامي والخلفي للبطاقة القومية" });
        }

        frontImage = "uploads/verification/" + req.files.frontImage[0].filename;
        backImage = "uploads/verification/" + req.files.backImage[0].filename;
      }

      if (cleanType === "passport") {
        if (!req.files || !req.files.passportImage) {
          return res.json({ message: "ارفع صورة صفحة الجواز" });
        }

        if (!expiryDate) {
          return res.json({ message: "أدخل تاريخ انتهاء الجواز" });
        }

        passportImage = "uploads/verification/" + req.files.passportImage[0].filename;
      }

      await pool.query(
        `
        UPDATE users SET
          verification_type = $1,
          verification_full_name = $2,
          verification_document_number = $3,
          verification_birth_date = $4,
          verification_expiry_date = $5,
          verification_country = $6,
          verification_front_image = $7,
          verification_back_image = $8,
          verification_passport_image = $9,
          verification_status = $10,
          verification_submitted_at = $11
        WHERE email = $12
        `,
        [
          cleanType,
          fullName.trim(),
          documentNumber.trim(),
          birthDate.trim(),
          (expiryDate || "").trim(),
          country.trim(),
          frontImage,
          backImage,
          passportImage,
          "قيد المراجعة",
          new Date().toISOString(),
          cleanEmail
        ]
      );

      res.json({ message: "تم إرسال طلب التوثيق بنجاح وهو الآن قيد المراجعة" });
    } catch (error) {
      console.log("SUBMIT VERIFICATION ERROR:", error);
      res.json({ message: "فشل إرسال طلب التوثيق" });
    }
  }
);

app.post("/admin/update-verification-status", async (req, res) => {
  const { email, status } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanStatus = (status || "").trim();

  if (!cleanEmail || !cleanStatus) {
    return res.json({ message: "أدخل البريد والحالة" });
  }
  if (!["موثق", "مرفوض", "قيد المراجعة", "غير موثق"].includes(cleanStatus)) {
    return res.json({ message: "حالة غير صحيحة" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    await pool.query(
      "UPDATE users SET verification_status = $1 WHERE email = $2",
      [cleanStatus, cleanEmail]
    );

    res.json({ message: "تم تحديث حالة التوثيق بنجاح" });
  } catch (error) {
    console.log("ADMIN UPDATE VERIFICATION STATUS ERROR:", error);
    res.json({ message: "فشل تحديث حالة التوثيق" });
  }
});

app.post("/create-deposit-request", async (req, res) => {
  const {
    email,
    planName,
    networkKey,
    networkCode,
    networkName,
    depositAddress,
    amount
  } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPlanName = (planName || "").trim();
  const finalNetworkCode = (networkCode || networkKey || "").trim();
  const depositAmount = Number(amount);

  const NETWORKS = {
    USDT_TRC20: {
      network_name: "USDT - TRC20",
      deposit_address: "TLPZEoW71BNe6mHPK8XRJ5PkN5Agqqpa5n"
    },
    USDT_BEP20: {
      network_name: "USDT - BEP20",
      deposit_address: "0x990635c24b47a3ebbc14efadf0355e26ec706385"
    },
    USDT_ERC20: {
      network_name: "USDT - ERC20",
      deposit_address: "0x990635c24b47a3ebbc14efadf0355e26ec706385"
    },
    USDC_BEP20: {
      network_name: "USDC - BEP20",
      deposit_address: "0x990635c24b47a3ebbc14efadf0355e26ec706385"
    },
    USDC_ERC20: {
      network_name: "USDC - ERC20",
      deposit_address: "0x990635c24b47a3ebbc14efadf0355e26ec706385"
    },
    BTC: {
      network_name: "Bitcoin - BTC",
      deposit_address: "1J4rcHG7afaEEFQL9o7GDcNc9noAZE6DVf"
    },
    ETH: {
      network_name: "Ethereum - ETH",
      deposit_address: "0x990635c24b47a3ebbc14efadf0355e26ec706385"
    }
  };

  const selectedNetwork = NETWORKS[finalNetworkCode] || null;
  const finalNetworkName = (networkName || (selectedNetwork ? selectedNetwork.network_name : "") || "").trim();
  const finalDepositAddress = (depositAddress || (selectedNetwork ? selectedNetwork.deposit_address : "") || "").trim();

  if (!cleanEmail || !finalNetworkCode || !finalNetworkName || !finalDepositAddress || !depositAmount || depositAmount <= 0) {
    return res.json({ message: "املأ بيانات طلب الإيداع بشكل صحيح" });
  }

  try {
    await expireOldDepositRequests();

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود أو غير مفعل" });
    }

    const activeRequestResult = await pool.query(
      `
      SELECT * FROM deposit_requests
      WHERE email = $1 AND status = 'قيد الدفع' AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (activeRequestResult.rows.length > 0) {
      const activeRequest = activeRequestResult.rows[0];
      return res.json({
        message: "لديك طلب إيداع مفتوح بالفعل",
        request: {
          request_id: activeRequest.request_id,
          email: activeRequest.email,
          plan_name: activeRequest.plan_name,
          network_code: activeRequest.network_code,
          network_name: activeRequest.network_name,
          deposit_address: activeRequest.deposit_address,
          amount: Number(activeRequest.amount || 0),
          status: activeRequest.status,
          expires_at: activeRequest.expires_at,
          created_at: activeRequest.created_at
        }
      });
    }

    const requestId = await createUniqueDepositRequestId();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const insertResult = await pool.query(
      `
      INSERT INTO deposit_requests (
        request_id,
        email,
        plan_name,
        network_code,
        network_name,
        deposit_address,
        amount,
        status,
        created_at,
        expires_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'قيد الدفع',NOW(),$8)
      RETURNING *
      `,
      [
        requestId,
        cleanEmail,
        cleanPlanName,
        finalNetworkCode,
        finalNetworkName,
        finalDepositAddress,
        depositAmount,
        expiresAt
      ]
    );

    const newRequest = insertResult.rows[0];

    res.json({
      message: "تم فتح طلب الإيداع بنجاح",
      request: {
        request_id: newRequest.request_id,
        email: newRequest.email,
        plan_name: newRequest.plan_name,
        network_code: newRequest.network_code,
        network_name: newRequest.network_name,
        deposit_address: newRequest.deposit_address,
        amount: Number(newRequest.amount || 0),
        status: newRequest.status,
        expires_at: newRequest.expires_at,
        created_at: newRequest.created_at
      }
    });
  } catch (error) {
    console.log("CREATE DEPOSIT REQUEST ERROR:", error);
    res.json({ message: "فشل فتح طلب الإيداع" });
  }
});

app.post("/submit-deposit-proof", depositUpload.single("receiptImage"), async (req, res) => {
  const { email, requestId, txid } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanRequestId = (requestId || "").trim();
  const cleanTxid = (txid || "").trim();

  if (!cleanEmail || !cleanRequestId || !cleanTxid) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!req.file) {
    return res.json({ message: "ارفع صورة الإيصال" });
  }

  try {
    await expireOldDepositRequests();

    const result = await pool.query(
      `
      SELECT * FROM deposit_requests
      WHERE request_id = $1 AND email = $2
      `,
      [cleanRequestId, cleanEmail]
    );

    const request = result.rows[0];

    if (!request) {
      return res.json({ message: "طلب الإيداع غير موجود" });
    }
    if (request.status === "ملغي") {
      return res.json({ message: "انتهت مدة الطلب وتم إلغاؤه" });
    }

    if (request.status !== "قيد الدفع") {
      return res.json({ message: "لا يمكن تعديل هذا الطلب الآن" });
    }

    const now = new Date();
    if (request.expires_at && new Date(request.expires_at) < now) {
      await pool.query(
        `
        UPDATE deposit_requests
        SET status = 'ملغي', review_note = 'انتهت مدة الطلب', reviewed_at = NOW()
        WHERE request_id = $1
        `,
        [cleanRequestId]
      );

      return res.json({ message: "انتهت مدة الطلب وتم إلغاؤه" });
    }

    const receiptImagePath = "uploads/deposit-receipts/" + req.file.filename;

    await pool.query(
      `
      UPDATE deposit_requests
      SET
        txid = $1,
        receipt_image = $2,
        status = 'قيد المراجعة',
        submitted_at = NOW()
      WHERE request_id = $3
      `,
      [cleanTxid, receiptImagePath, cleanRequestId]
    );

    res.json({ message: "تم إرسال إثبات الإيداع بنجاح وهو الآن قيد المراجعة" });
  } catch (error) {
    console.log("SUBMIT DEPOSIT PROOF ERROR:", error);
    res.json({ message: "فشل إرسال إثبات الإيداع" });
  }
});

app.post("/cancel-deposit-request", async (req, res) => {
  const { email, requestId } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanRequestId = (requestId || "").trim();

  if (!cleanEmail || !cleanRequestId) {
    return res.json({ message: "أدخل البريد ورقم الطلب" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM deposit_requests WHERE request_id = $1 AND email = $2",
      [cleanRequestId, cleanEmail]
    );

    const request = result.rows[0];

    if (!request) {
      return res.json({ message: "طلب الإيداع غير موجود" });
    }

    if (request.status === "ناجح" || request.status === "مرفوض") {
      return res.json({ message: "لا يمكن إلغاء هذا الطلب" });
    }
    await pool.query(
      `
      UPDATE deposit_requests
      SET status = 'ملغي', review_note = 'تم إلغاء الطلب بواسطة المستخدم', reviewed_at = NOW()
      WHERE request_id = $1
      `,
      [cleanRequestId]
    );

    res.json({ message: "تم إلغاء طلب الإيداع" });
  } catch (error) {
    console.log("CANCEL DEPOSIT REQUEST ERROR:", error);
    res.json({ message: "فشل إلغاء طلب الإيداع" });
  }
});

app.get("/my-deposit-requests", async (req, res) => {
  const cleanEmail = ((req.query.email || "") + "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    await expireOldDepositRequests();

    const result = await pool.query(
      `
      SELECT
        request_id,
        plan_name,
        network_code,
        network_name,
        deposit_address,
        amount,
        txid,
        receipt_image,
        status,
        review_note,
        created_at,
        expires_at,
        submitted_at,
        reviewed_at
      FROM deposit_requests
      WHERE email = $1
      ORDER BY created_at DESC
      `,
      [cleanEmail]
    );

    res.json({
      deposits: result.rows.map((row) => ({
        request_id: row.request_id,
        plan_name: row.plan_name || "",
        network_code: row.network_code || "",
        network_name: row.network_name || "",
        deposit_address: row.deposit_address || "",
        amount: Number(row.amount || 0),
        txid: row.txid || "",
        receipt_image: row.receipt_image || "",
        status: row.status || "",
        review_note: row.review_note || "",
        created_at: row.created_at,
        expires_at: row.expires_at,
        submitted_at: row.submitted_at,
        reviewed_at: row.reviewed_at
      }))
    });
  } catch (error) {
    console.log("MY DEPOSIT REQUESTS ERROR:", error);
    res.json({ message: "فشل جلب طلبات الإيداع" });
  }
});
app.post("/admin/update-deposit-status", async (req, res) => {
  const { requestId, status, note } = req.body;
  const cleanRequestId = (requestId || "").trim();
  const cleanStatus = (status || "").trim();
  const cleanNote = (note || "").trim();

  if (!cleanRequestId || !cleanStatus) {
    return res.json({ message: "أدخل رقم الطلب والحالة" });
  }

  if (!["ناجح", "مرفوض", "قيد المراجعة", "ملغي"].includes(cleanStatus)) {
    return res.json({ message: "حالة غير صحيحة" });
  }

  try {
    await expireOldDepositRequests();

    const result = await pool.query(
      "SELECT * FROM deposit_requests WHERE request_id = $1",
      [cleanRequestId]
    );

    const request = result.rows[0];

    if (!request) {
      return res.json({ message: "طلب الإيداع غير موجود" });
    }

    if (cleanStatus === "ناجح") {
      if (request.status === "ناجح") {
        return res.json({ message: "هذا الطلب معتمد بالفعل" });
      }

      await pool.query("BEGIN");
      await pool.query(
        `
        UPDATE deposit_requests
        SET status = 'ناجح', review_note = $1, reviewed_at = NOW()
        WHERE request_id = $2
        `,
        [cleanNote, cleanRequestId]
      );

      await pool.query(
        "UPDATE users SET balance = COALESCE(balance, 0) + $1 WHERE email = $2",
        [Number(request.amount || 0), request.email]
      );

      await applyFirstDepositBenefits(request.email, Number(request.amount || 0));

      await pool.query("COMMIT");

      return res.json({ message: "تم اعتماد الإيداع وإضافة الرصيد بنجاح" });
    }

    await pool.query(
      `
      UPDATE deposit_requests
      SET status = $1, review_note = $2, reviewed_at = NOW()
      WHERE request_id = $3
      `,
      [cleanStatus, cleanNote, cleanRequestId]
    );

    res.json({ message: "تم تحديث حالة طلب الإيداع بنجاح" });
  } catch (error) {
    try {
      await pool.query("ROLLBACK");
    } catch (rollbackError) {
      console.log("ROLLBACK ERROR:", rollbackError);
              }
    console.log("ADMIN UPDATE DEPOSIT STATUS ERROR:", error);
    res.json({ message: "فشل تحديث حالة الإيداع" });
  }
});

app.post("/mark-deposit", async (req, res) => {
  const { email, amount } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();
  const depositAmount = Number(amount);

  if (!cleanEmail || !depositAmount || depositAmount <= 0) {
    return res.json({ message: "أدخل البريد الإلكتروني وقيمة إيداع صحيحة" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verified = true",
      [cleanEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    if (user.has_deposited) {
      return res.json({ message: "تم احتساب أول إيداع لهذا الحساب مسبقاً" });
    }

    await applyFirstDepositBenefits(cleanEmail, depositAmount);

    res.json({ message: "تم تسجيل أول إيداع وتوزيع مكافآت الإحالة بنجاح" });
  } catch (error) {
    console.log("MARK DEPOSIT ERROR:", error);
    res.json({ message: "فشل تسجيل الإيداع" });
  }
});

app.get("/my-referral-info", async (req, res) => {
  const cleanEmail = ((req.query.email || "") + "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [cleanEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.json({ message: "الحساب غير موجود" });
    }

    const levels = [
      { key: "level_1_referrer", name: "level1" },
      { key: "level_2_referrer", name: "level2" },
      { key: "level_3_referrer", name: "level3" },
      { key: "level_4_referrer", name: "level4" },
      { key: "level_5_referrer", name: "level5" }
    ];

    const stats = {};

    for (const level of levels) {
      const totalResult = await pool.query(
        `SELECT COUNT(*) FROM users WHERE ${level.key} = $1`,
        [user.referral_code]
      );

      const depositedResult = await pool.query(
        `SELECT COUNT(*) FROM users WHERE ${level.key} = $1 AND has_deposited = true`,
        [user.referral_code]
      );

      stats[level.name] = {
        total_referrals: Number(totalResult.rows[0].count),
        deposited_referrals: Number(depositedResult.rows[0].count)
      };
    }

    res.json({
      referral_code: user.referral_code,
      referral_link: `${req.protocol}://${req.get("host")}/register.html?ref=${user.referral_code}`,
      referral_earnings: Number(user.referral_earnings || 0),
      has_deposited: user.has_deposited,
      first_deposit_amount: Number(user.first_deposit_amount || 0),
      levels: stats
    });
  } catch (error) {
    console.log("MY REFERRAL INFO ERROR:", error);
    res.json({ message: "فشل جلب بيانات الإحالة" });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.json({ message: "حصل خطأ أثناء رفع الملفات أو حجم الصورة كبير" });
  }
  if (error) {
    return res.json({ message: error.message || "حصل خطأ غير متوقع" });
  }

  next();
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
