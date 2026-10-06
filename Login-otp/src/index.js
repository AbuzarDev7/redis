import express from "express";
import Redis from "ioredis";
import mongoose from "mongoose";
import crypto from "crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Redis connection
const redis = new Redis(
    process.env.REDIS_URL || "redis://localhost:6379"
);

redis.on("error", (err) => {
    console.error("Redis error:", err.message);
});


app.get("/redis", async (req, res) => {
    try {
        const reply = await redis.ping();

        res.json({
            message: reply
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// MongoDB test
app.get("/mongo", async (req, res) => {
    try {
        const mongoUrl =
            process.env.MONGO_URL ||
            "mongodb://localhost:27017/test";

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUrl);
        }

        res.json({
            message: "Connected to MongoDB"
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Create OTP
const createOtp = () => {
    const otp = crypto
        .randomInt(100000, 1000000)
        .toString();

    return otp;
};

// Generate OTP
app.post("/generate-otp", async (req, res) => {
    try {
        const otp = createOtp();

        const otpSchema = z.string().length(6);

        const parsedOtp = otpSchema.parse(otp);

        await redis.set(
            "otp",
            parsedOtp,
            "EX",
            300
        );
        
        const receiverEmail = req.query.email || req.body?.email || process.env.GMAIL_USER;

        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: receiverEmail,
            subject: "Your OTP",
            text: `Your OTP is ${parsedOtp}. It will expire in 5 minutes.`
        });
        res.json({
            message: "OTP generated successfully",
            otp: parsedOtp
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Verify OTP
app.post("/verify-otp", async (req, res) => {
    try {
        const otpSchema = z.string().length(6);

        const parsedOtp = otpSchema.parse(req.body.otp);

        const storedOtp = await redis.get("otp");

        if (!storedOtp) {
            return res.status(400).json({
                message: "OTP expired or not found"
            });
        }

        if (storedOtp === parsedOtp) {
            await redis.del("otp");

            return res.json({
                message: "OTP verified successfully"
            });
        }

        return res.status(400).json({
            message: "Invalid OTP"
        });

    } catch (error) {
        return res.status(400).json({
            error: error.message
        });
    }
});

// Start server
app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
