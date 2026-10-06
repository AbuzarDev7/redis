import express from 'express';
import Redis from 'ioredis';
import mongoose from 'mongoose';
const app = express();  


const redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    
);



redis.on('error', (err) => {
    console.error('Redis error:', err.message);
});

app.get('/redis', async (req, res) => {
    try {
        const reply = await redis.ping();
        res.json({ message: reply });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/mongo', async (req, res) => {
    try {
        const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/test';
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUrl);
        }
        res.json({ message: 'Connected to MongoDB' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});