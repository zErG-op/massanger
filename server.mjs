import express from "express";
import http from "http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { create } from "domain";
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
//const crypto = require('crypto')
//const jwt = require("jsonwebtoken")

app.use(express.static(__dirname + "/public"));
app.use(express.json());

const client = new MongoClient("mongodb://localhost:27017");
const db = client.db("myAppDB");
const collection = db.collection("users");

async function start() {
    await client.connect();

    io.on("connection", (socket) => {

        socket.join("general");

        socket.on("new_massage", async (new_message) => {

            const massage = {
                id: "user.id",                              //  !!!
                massage: new_message,
            };

            await collection.insertOne(massage);

            io.to("general").emit("new_message", new_message);
        })

        socket.on("delete_message", async (messageId) => {

            await collection.deleteOne({ id: messageId });

            io.to("general").emit("message_deleted", messageId);
        });
    });

    server.listen(3000, () => {
        console.log("Server running on http://localhost:3000/");
    });
}

start();

app.get("/api/users", async (req, res) => {
    try {
        const info = req.query
        res.json(info)
    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})

app.post("/api/users", async (req, res) => {
    try {

        const user = {
            id: uuidv4(),
            name: req.body.name,
            surename: req.body.surename,
            email: req.body.email,
            password: req.body.password
        };

        if (!user.name || !user.surename) {
            return res.status(400).json("Missing name or surname");
        }

        const result = await collection.insertOne(user);

        return res.status(201).json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.delete("/api/users", async (req, res) => {
    try {
        const { id } = req.query
        const result = await collection.deleteOne({ id: id });

        res.json(result)

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const user = await collection.findOne({ email: req.body.email })
        const secretKey = uuidv4();
        const options = { expiresIn: '1h' };

        if (!user) return res.status(404).json("no such user");

        const token = jwt.sign(user.id, secretKey, options);

        console.log(token)

        res.json(token)
    } catch (err) {
        console.log(err);

        res.status(500).json(err.message);
    }
});
// http://localhost:3000/ node server.mjs