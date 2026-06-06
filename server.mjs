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
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
        //credentials: true
    }
});

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(__dirname + "/public"));
app.use(express.json());

const client = new MongoClient("mongodb://127.0.0.1:27017");
const db = client.db("myAppDB");
const collection_users = db.collection("users");
const collection_rooms = db.collection("rooms");
const collection_massages = db.collection("massages");

//async function start() {
//await client.connect();

//io.use((socket, next) => {
//const token = socket.handshake.auth.token                                  //!!!
//if (!token) {
//    return next(new Error("Token missing"))
//  }
//    jwt.verify(token, "uuidv4()", (err, decoded) => {
//          if (err) { return next(new Error("Token is invalid")) }
//
//   socket.user = decoded
//     next()
//   })
// })

io.on("connection", async (socket) => {
    console.log("massages")
    const user = await collection_users.findOne({ email: socket.user })
    const rooms = await collection_rooms.find({ user: socket.user }).project({ name: 1, _id: 0 }).toArray();
    const names = rooms.map(r => r.name);
    socket.join("general")

    io.on("join_room", async (room) => {                                     //!!!
        const previousRoom = Array.from(socket.rooms).at(1);
        socket.leave(previousRoom);
        socket.join(room)

        console.log(`Socket ${socket.id} joined room: ${room}`);

    })

    socket.on("new_massage", async (new_message) => {

        const massage = {
            text: new_message.text,
            key: new_message.key,
            user: new_message.user,
            room: new_message.room
        };

        await collection_massages.insertOne(massage);

        io.to("general").emit("new_message", new_message);      //!!!!!!!!!!!!!!!
    })

    socket.on("delete_message", async (delete_message) => {

        const massageToDel = {
            text: delete_message.text,
            key: delete_message.key,
            user: delete_message.user,
            room: delete_message.room
        };

        await collection_massages.deleteOne(massageToDel);

        // io.to("general").emit("message_deleted", messageId);   //!!!!!!!!!!!!!!!
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000/");
});

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
        const user = await collection_users.findOne({ email: req.body.email })    //!!!
        const secretKey = "uuidv4()";
        const options = { expiresIn: '1h' };

        if (!user) return res.status(404).json("no such user");

        // const token = jwt.sign(user.id, secretKey, options);

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

app.get("/api/rooms", async (req, res) => {
    try {
        const { user } = req.query;
        const info = await collection_rooms.find({ user: user }).toArray();
        const roomNames = info.map(room => room.name);
        res.status(200).json(roomNames);
    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})

app.post("/api/rooms", async (req, res) => {
    try {

        const data = {
            name: req.body.name,
            user: req.body.user
        }
        const existingRoom = await collection_rooms.findOne({
            name: req.body.name,
            user: req.body.user
        });
        if (existingRoom) {
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