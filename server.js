console.log("Server file is running...");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});


const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("Chatbot"));// your frontend folder

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await pool.query(
            "SELECT * FROM users WHERE username=$1",
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "User not found" });
        }

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ message: "Invalid password" });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ message: "Login successful", token });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const existing = await pool.query(
            "SELECT * FROM users WHERE username=$1 OR email=$2",
            [username, email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
            [username, email, hashed]
        );

        res.json({ message: "User registered successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/chat", async (req, res) => {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(req.body),
            }
        );

        const data = await response.json();
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }

});

app.post("/forgot-password", async (req, res) => {
    try {
        const { username, newPassword } = req.body;

        if (!username || !newPassword) {
            return res.status(400).json({
                message: "Username and new password are required."
            });
        }

        const user = await pool.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            "UPDATE users SET password = $1 WHERE username = $2",
            [hashedPassword, username]
        );

        res.json({
            message: "Password updated successfully."
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.listen(3000, () => {
    console.log(`Server running on port 3000`);
});

