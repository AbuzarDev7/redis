import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import Redis from "ioredis";
import mongoose from "mongoose";
import crypto from "crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey123";

// 1. Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER?.trim(),
    pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "")
  }
});

// 2. Redis Connection
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
redis.on("error", (err) => console.error("Redis error:", err.message));

// 3. MongoDB User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// MongoDB Connect
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/auth_db";
mongoose.connect(mongoUrl)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB Error:", err.message));

// Helper: 6-digit OTP
const createOtp = () => crypto.randomInt(100000, 1000000).toString();


app.post("/register", async (req, res) => {
  try {
    const registerSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6)
    });

    const { email, password } = registerSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    // Check karo user pehle se exist toh nahi karta
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ error: "User already registered and verified. Please login." });
    }

    // Password ko encrypt (hash) karo
    const hashedPassword = await bcrypt.hash(password, 10);

    if (existingUser && !existingUser.isVerified) {
      // Agar pehle register kiya tha lekin verify nahi kiya, password update kardo
      existingUser.password = hashedPassword;
      await existingUser.save();
    } else {
      // Naya unverified user banao
      await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        isVerified: false
      });
    }

    // OTP generate karo
    const otp = createOtp();

    
    await redis.set(`otp:${normalizedEmail}`, otp, "EX", 300);

    // User ki di hui email par OTP bhejo
    await transporter.sendMail({
      from: `"Auth Support" <${process.env.GMAIL_USER}>`,
      to: normalizedEmail,
      subject: "Verification OTP Code",
      text: `Your account verification OTP is: ${otp}. It will expire in 5 minutes.`
    });

    res.status(201).json({
      message: "Registration initiated! OTP sent to your email. Please verify to activate account."
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


app.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Redis se OTP check karo
    const storedOtp = await redis.get(`otp:${normalizedEmail}`);

    if (!storedOtp) {
      return res.status(400).json({ error: "OTP expired or not found. Please register again." });
    }

    if (storedOtp !== otp.toString().trim()) {
      return res.status(400).json({ error: "Invalid OTP code" });
    }

    // MongoDB mein user ko verified mark karo
    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Redis se OTP delete kardo taake dubara use na ho
    await redis.del(`otp:${normalizedEmail}`);

    // JWT Token generate karo
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("refreshToken", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Email verified successfully! You are now logged in.",
      accessToken: token,
      token
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // MongoDB mein user dhoondo
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check karo kya user ne OTP verify kiya tha?
    if (!user.isVerified) {
      return res.status(403).json({
        error: "Account not verified. Please verify your email first."
      });
    }

    // Password match karo
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // JWT Token banao
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("refreshToken", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: "Login successful!",
      accessToken: token,
      token
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Refresh Token route (Silent login on page reload)
app.post("/refresh-token", (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: "No active session" });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired session" });
  }
});

// Logout route (Clear cookie)
app.post("/logout", (req, res) => {
  res.clearCookie("refreshToken");
  res.json({ message: "Logged out successfully" });
});

// Start Server (Hamesha saare routes ke baad aayega)
app.listen(3000, () => {
  console.log("Server is running on port 3000");
});