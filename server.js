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

/* تخزين أكواد التحقق */
let codes = {};

/* حماية كلمة السر */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!])[A-Za-z\d@$!]{8,}$/;

function isStrongPassword(password) {
  return passwordRegex.test(password);
}

/* التحقق من كلمة مرور السحب */
function isValidWithdrawPassword(password) {
  return /^\d{6}$/.test(password || "");
}

/* إعداد إرسال الإيميل */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "twbmyny803@gmail.com",
    pass: "oyiivkrudpiejjbd"
  }
});

/* إنشاء رمز إحالة من 6 حروف كبيرة فقط */
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

async function ensureReferralColumns() {
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
    console.log("Referral and account columns ready");
  } catch (error) {
    console.log("ALTER TABLE ERROR:", error);
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

/* إنشاء جدول المستخدمين */
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

    await ensureReferralColumns();
    await backfillReferralCodes();
  } catch (error) {
    console.log("INIT DATABASE ERROR:", error);
  }
}

initDatabase();

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

/* بيانات الحساب الأساسية */
app.get("/my-account-info", async (req, res) => {
  const cleanEmail = ((req.query.email || "") + "").trim().toLowerCase();

  if (!cleanEmail) {
    return res.json({ message: "أدخل البريد الإلكتروني" });
  }

  try {
    const result = await pool.query(
      "SELECT name, email, verified, has_deposited, withdraw_password, vip_level, verification_status, balance FROM users WHERE email = $1",
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
      verification_status: user.verification_status || (user.verified ? "مفعل" : "غير موثق"),
      balance: Number(user.balance || 0),
      has_withdraw_password: !!user.withdraw_password
    });

  } catch (error) {
    console.log("MY ACCOUNT INFO ERROR:", error);
    res.json({ message: "فشل جلب بيانات الحساب" });
  }
});

/* تسجيل حساب */
app.post("/register", async (req, res) => {
  const { name, email, password, referralCode } = req.body;

  if (!name || !email || !password) {
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
    codes[cleanEmail] = code;

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      if (user.verified) {
        delete codes[cleanEmail];
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
          name,
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
        name,
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

/* التحقق من كود التسجيل */
app.post("/verify", async (req, res) => {
  const { email, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (codes[cleanEmail] != code) {
    return res.json({ message: "الكود غير صحيح" });
  }

  try {
    await pool.query(
      "UPDATE users SET verified = true WHERE email = $1",
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

    if (codes[cleanEmail] != code) {
      return res.json({ message: "كود التحقق غير صحيح" });
    }

    delete codes[cleanEmail];

    res.json({ message: "تم تسجيل الدخول بنجاح", name: user.name || "" });

  } catch (error) {
    console.log("LOGIN ERROR:", error);
    res.json({ message: "فشل تسجيل الدخول" });
  }
});

/* إرسال كود إعادة تعيين كلمة المرور */
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
    codes[cleanEmail] = code;

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

/* إعادة تعيين كلمة المرور */
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

  if (codes[cleanEmail] != code) {
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

    delete codes[cleanEmail];

    res.json({ message: "تم تغيير كلمة المرور بنجاح" });

  } catch (error) {
    console.log("RESET PASSWORD ERROR:", error);
    res.json({ message: "فشل تغيير كلمة المرور" });
  }
});

/* إرسال كود إنشاء/تغيير كلمة مرور السحب */
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
    codes[cleanEmail] = code;

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

/* إنشاء كلمة مرور السحب */
app.post("/create-withdraw-password", async (req, res) => {
  const { email, withdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !withdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isValidWithdrawPassword(withdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب يجب أن تكون 6 أرقام فقط" });
  }

  if (codes[cleanEmail] != code) {
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

    delete codes[cleanEmail];

    res.json({ message: "تم إنشاء كلمة مرور السحب بنجاح" });

  } catch (error) {
    console.log("CREATE WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل إنشاء كلمة مرور السحب" });
  }
});

/* تغيير كلمة مرور السحب */
app.post("/change-withdraw-password", async (req, res) => {
  const { email, oldWithdrawPassword, newWithdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !oldWithdrawPassword || !newWithdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isValidWithdrawPassword(newWithdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب الجديدة يجب أن تكون 6 أرقام فقط" });
  }

  if (codes[cleanEmail] != code) {
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

    delete codes[cleanEmail];

    res.json({ message: "تم تغيير كلمة مرور السحب بنجاح" });

  } catch (error) {
    console.log("CHANGE WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل تغيير كلمة مرور السحب" });
  }
});

/* نسيت كلمة مرور السحب */
app.post("/forgot-withdraw-password", async (req, res) => {
  const { email, newWithdrawPassword, code } = req.body;
  const cleanEmail = (email || "").trim().toLowerCase();

  if (!cleanEmail || !newWithdrawPassword || !code) {
    return res.json({ message: "املأ كل البيانات المطلوبة" });
  }

  if (!isValidWithdrawPassword(newWithdrawPassword)) {
    return res.json({ message: "كلمة مرور السحب يجب أن تكون 6 أرقام فقط" });
  }

  if (codes[cleanEmail] != code) {
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

    delete codes[cleanEmail];

    res.json({ message: "تم إعادة تعيين كلمة مرور السحب بنجاح" });

  } catch (error) {
    console.log("FORGOT WITHDRAW PASSWORD ERROR:", error);
    res.json({ message: "فشل إعادة تعيين كلمة مرور السحب" });
  }
});

/* تعليم المستخدم كمودع لأول مرة + توزيع مكافآت الإحالة */
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

    res.json({ message: "تم تسجيل أول إيداع وتوزيع مكافآت الإحالة بنجاح" });

  } catch (error) {
    console.log("MARK DEPOSIT ERROR:", error);
    res.json({ message: "فشل تسجيل الإيداع" });
  }
});

/* بيانات نظام الإحالة للمستخدم */
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

/* تشغيل السيرفر */
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
