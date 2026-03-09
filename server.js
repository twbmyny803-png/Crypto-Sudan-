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
function commonFileFilter(req, file, cb) {
  const allowedTypes = ["image/jpeg","image/jpg","image/png","image/webp"];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("نوع الملف غير مدعوم، ارفع صورة فقط"));
  }
  cb(null, true);
}

const verificationStorage = multer.diskStorage({
  destination: (req,file,cb)=>cb(null,verificationDir),
  filename:(req,file,cb)=>{
    const ext = path.extname(file.originalname||"") || ".jpg";
    cb(null,"verify-"+Date.now()+ext);
  }
});

const depositStorage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,depositReceiptsDir),
  filename:(req,file,cb)=>{
    const ext = path.extname(file.originalname||"") || ".jpg";
    cb(null,"deposit-"+Date.now()+ext);
  }
});

const verificationUpload = multer({
  storage: verificationStorage,
  fileFilter: commonFileFilter,
  limits:{ fileSize:5*1024*1024 }
});

const depositUpload = multer({
  storage: depositStorage,
  fileFilter: commonFileFilter,
  limits:{ fileSize:5*1024*1024 }
});
app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"login.html"));
});

app.get("/login",(req,res)=>{
  res.sendFile(path.join(__dirname,"login.html"));
});

app.get("/register",(req,res)=>{
  res.sendFile(path.join(__dirname,"register.html"));
});

app.get("/forgot",(req,res)=>{
  res.sendFile(path.join(__dirname,"forgot.html"));
});

app.get("/verify-identity",(req,res)=>{
  res.sendFile(path.join(__dirname,"verify.html"));
});

app.get("/deposit",(req,res)=>{
  res.sendFile(path.join(__dirname,"deposit.html"));
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:{ rejectUnauthorized:false }
});

let codes = {};

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!])[A-Za-z\d@$!]{8,}$/;

function isStrongPassword(password){
  return passwordRegex.test(password);
}

function isValidWithdrawPassword(password){
  return /^\d{6}$/.test(password || "");
}

const transporter = nodemailer.createTransport({
  service:"gmail",
  auth:{
    user:"twbmyny803@gmail.com",
    pass:"oyiivkrudpiejjbd"
  }
});
app.post("/register", async (req,res)=>{

const { name, fullname, email, password } = req.body;
const finalName = (fullname || name || "").trim();
const cleanEmail = (email||"").trim().toLowerCase();

if(!finalName || !cleanEmail || !password){
return res.json({message:"املأ كل البيانات"});
}

if(!isStrongPassword(password)){
return res.json({message:"كلمة المرور ضعيفة"});
}

try{

const existing = await pool.query(
"SELECT * FROM users WHERE email=$1",
[cleanEmail]
);

if(existing.rows.length > 0){
return res.json({message:"هذا البريد مسجل بالفعل"});
}

const code = Math.floor(100000 + Math.random()*900000).toString();
codes[cleanEmail] = code;

await transporter.sendMail({
from:"Sudan Crypto <twbmyny803@gmail.com>",
to:cleanEmail,
subject:"Sudan Crypto Verification Code",
html:`<h2>Sudan Crypto</h2><h1>${code}</h1>`
});

await pool.query(
"INSERT INTO users (name,email,password,verified) VALUES ($1,$2,$3,false)",
[finalName,cleanEmail,password]
);

res.json({message:"تم إرسال كود التحقق"});

}catch(e){

console.log(e);
res.json({message:"فشل إنشاء الحساب"});

}

});
app.post("/login", async (req,res)=>{

const { email,password,code } = req.body;
const cleanEmail = (email||"").trim().toLowerCase();

try{

const result = await pool.query(
"SELECT * FROM users WHERE email=$1",
[cleanEmail]
);

const user = result.rows[0];

if(!user){
return res.json({message:"الحساب غير موجود"});
}

if(!user.verified){
return res.json({message:"يجب تفعيل الحساب"});
}

if(user.password !== password){
return res.json({message:"كلمة المرور غير صحيحة"});
}

if(!codes[cleanEmail] || codes[cleanEmail] != code){
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
