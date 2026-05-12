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

app.use(express.static(__dirname + "/public"));
app.use(express.json());

const client = new MongoClient("mongodb://127.0.0.1:27017");
const db = client.db("myAppDB");
const collection_users = db.collection("users");
const collection_rooms = db.collection("rooms");

async function start() {
    await client.connect();

    io.on("connection", async (socket) => {

        const user = await collection_users.findOne({ email: "user.id" })                              //  !!!
        const rooms = await collection_rooms.find({ user: "user.id" }).project({ name: 1, _id: 0 }).toArray();                  //  !!!
        const names = rooms.map(r => r.name);
        console.log(names);

        socket.join(names);

        socket.on("new_massage", async (new_message) => {

            const massage = {
                id: "user.id",                              //  !!!
                massage: new_message,
            };

            await collection_users.insertOne(massage);

            io.to("general").emit("new_message", new_message);
        })

        socket.on("delete_message", async (messageId) => {

            await collection_users.deleteOne({ id: messageId });

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

        const result = await collection_users.insertOne(user);

        return res.status(201).json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.delete("/api/users", async (req, res) => {
    try {
        const { id } = req.query
        const result = await collection_users.deleteOne({ id: id });

        res.json(result)

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const user = await collection_users.findOne({ email: req.body.email })
        const secretKey = uuidv4();
        const options = { expiresIn: '1h' };

        if (!user) return res.status(404).json("no such user");

        const token = jwt.sign(user.id, secretKey, options);

        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: options
        })

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.post("/api/logout", async (req, res) => {
    try {

        res.clearCookie("token", {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: options
        })

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.post("/api/rooms", async (req, res) => {
    try {

        const data = {
            name: req.body.name,
            user: req.body.user
        }
        if (collection_rooms.find({ tags: 'js' })) {
            return res.status(400).json("already exist!!!");
        } else {
            const result = await collection_rooms.insertOne(data);
            return res.status(201).json(result);
        }

    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
});

app.delete("/api/rooms", async (req, res) => {
    try {


        const user = req.query.user;
        const result = await collection_rooms.deleteOne({ user: user });
        console.log(result)
        return res.status(201).json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json(err);
    }
});
// http://localhost:3000/ node server.mjs