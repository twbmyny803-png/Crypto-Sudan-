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
  const allowedTypes = ["image/jpeg","image/jpg","image/png","image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("ارفع صورة فقط"));
  }
  cb(null, true);
}

const verificationUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, verificationDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, "verify-" + Date.now() + ext);
    }
  }),
  fileFilter: commonFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const depositUpload = multer({
  storage: multer.diskStorage({
    destination:
      const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let codes = {};

function saveCode(email, code, type){
  codes[email] = {
    code: code,
    type: type,
    time: Date.now()
  };
}

function checkCode(email, code, type){
  if(!codes[email]) return false;
  if(codes[email].code !== code) return false;
  if(codes[email].type !== type) return false;
  return true;
    }
    const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "twbmyny803@gmail.com",
    pass: "oyiivkrudpiejjbd"
  }
});

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!])[A-Za-z\d@$!]{8,}$/;

function isStrongPassword(password){
  return passwordRegex.test(password);
}

function isValidWithdrawPassword(password){
  return /^\d{6}$/.test(password || "");
    }
      app.post("/register", async (req, res) => {

const { name, email, password } = req.body;

if(!name || !email || !password){
return res.json({message:"املأ كل البيانات"});
}

if(!isStrongPassword(password)){
return res.json({message:"كلمة المرور ضعيفة"});
}

const cleanEmail = email.trim().toLowerCase();

try{

const existing = await pool.query(
"SELECT * FROM users WHERE email=$1",
[cleanEmail]
);

if(existing.rows.length > 0){
return res.json({message:"هذا البريد مسجل بالفعل"});
}

const code = Math.floor(100000 + Math.random()*900000).toString();

saveCode(cleanEmail,code,"register");

await transporter.sendMail({
from:"Sudan Crypto <twbmyny803@gmail.com>",
to:cleanEmail,
subject:"Sudan Crypto Verification Code",
html:`<h2>Sudan Crypto</h2><h1>${code}</h1>`
});

await pool.query(
"INSERT INTO users (name,email,password,verified) VALUES ($1,$2,$3,false)",
[name,cleanEmail,password]
);

res.json({message:"تم إرسال كود التحقق"});

}catch(e){

console.log(e);
res.json({message:"فشل التسجيل"});

}

});
    app.post("/verify", async (req,res)=>{

const {email,code} = req.body;
const cleanEmail = (email || "").trim().toLowerCase();

if(!checkCode(cleanEmail,code,"register")){
return res.json({message:"الكود غير صحيح"});
}

try{

await pool.query(
"UPDATE users SET verified=true WHERE email=$1",
[cleanEmail]
);

delete codes[cleanEmail];

res.json({message:"تم التحقق بنجاح"});

}catch(e){

console.log(e);
res.json({message:"فشل التحقق"});

}

});
    app.post("/send-login-code", async (req,res)=>{

const {email} = req.body;
const cleanEmail = (email || "").trim().toLowerCase();

try{

const result = await pool.query(
"SELECT * FROM users WHERE email=$1",
[cleanEmail]
);

const user = result.rows[0];

if(!user) return res.json({message:"الحساب غير موجود"});
if(!user.verified) return res.json({message:"الحساب غير مفعل"});

const code = Math.floor(100000 + Math.random()*900000).toString();

saveCode(cleanEmail,code,"login");

await transporter.sendMail({
from:"Sudan Crypto <twbmyny803@gmail.com>",
to:cleanEmail,
subject:"Login Code",
html:`<h2>Sudan Crypto</h2><h1>${code}</h1>`
});

res.json({message:"تم إرسال كود تسجيل الدخول"});

}catch(e){

console.log(e);
res.json({message:"فشل إرسال الكود"});

}

});
    app.post("/login", async (req,res)=>{

const {email,password,code} = req.body;
const cleanEmail = (email || "").trim().toLowerCase();

try{

const result = await pool.query(
"SELECT * FROM users WHERE email=$1",
[cleanEmail]
);

const user = result.rows[0];

if(!user) return res.json({message:"الحساب غير موجود"});
if(!user.verified) return res.json({message:"الحساب غير مفعل"});
if(user.password !== password) return res.json({message:"كلمة المرور خطأ"});

if(!checkCode(cleanEmail,code,"login")){
return res.json({message:"كود التحقق غير صحيح"});
}

delete codes[cleanEmail];

res.json({
message:"تم تسجيل الدخول بنجاح",
name:user.name || ""
});

}catch(e){

console.log(e);
res.json({message:"فشل تسجيل الدخول"});

}

});
    app.listen(PORT,()=>{
console.log("Server started on port "+PORT);
});
