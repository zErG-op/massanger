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
import multer from 'multer';
import path from 'path';

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
const JWT_SECRET = "svvafkjvsakjvakjadfbjoifaoda"



function verifyTokenFromCookies(cookieHeader) {
    if (!cookieHeader) return null;

    const tokenRow = cookieHeader.split('; ').find(row => row.startsWith('token='));
    if (!tokenRow) return null;

    const token = tokenRow.split('=')[1];

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

async function start() {
    await client.connect();
    console.log("MongoDB connected");

    io.use((socket, next) => {

        const decoded = verifyTokenFromCookies(socket.handshake.headers.cookie);

        if (!decoded) {
            return next(new Error("Authentication error: Token is missing or invalid"));
        }

        socket.userEmail = decoded.email;
        next();
    });
}
start();

app.get("/api/auth/me", (req, res) => {
    const decoded = verifyTokenFromCookies(req.headers.cookie);

    if (!decoded) {
        return res.status(401).json({ authorized: false });
    }

    return res.status(200).json({
        authorized: true,
        email: decoded.email
    });
});

io.on("connection", async (socket) => {

    //const user = await collection_users.findOne({ email: socket.user }) //!!!!!!!!!!!!!!!!
    const rooms = await collection_rooms.find({ user: socket.user }).project({ name: 1, _id: 0 }).toArray();
    const names = rooms.map(r => r.name);
    socket.join("general")

    socket.on("join_room", async (room) => {
        const previousRoom = Array.from(socket.rooms).at(1);
        socket.leave(previousRoom);
        socket.join(room)
    })

    socket.on("new_massage", async (new_message) => {

        const massage = {
            text: new_message.text,
            key: new_message.key,
            user: new_message.user,
            room: new_message.room
        };

        await collection_massages.insertOne(massage);

        //  io.to("general").emit("new_message", new_message);      //!!!!!!!!!!!!!!!
    })

    socket.on("delete_message", async (delete_message) => {

        const massageToDel = {
            text: delete_message.text,
            key: delete_message.key,
            user: delete_message.user,
            room: delete_message.room
        };

        await collection_massages.deleteOne(massageToDel);

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
            surname: req.body.surname,
            email: req.body.email,
            password: req.body.password
        };

        if (!user.name || !user.surname || !user.surname || !user.password) {
            return res.status(400).json("Missing something");
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
        const user = await collection_users.findOne({ email: req.body.email, password: req.body.password })    //!!!
        const options = { expiresIn: '1h' };
        const payload = { email: user.email };
        if (!user) return res.status(404).json("no such user");

        const token = jwt.sign(payload, JWT_SECRET, options);

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,                       //!!!!!!!!!!!!!!!!!
            sameSite: "lax",
            maxAge: 60 * 60 * 1000
        })
        return res.status(200).json({ message: token });
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
            maxAge: 0
        })

    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
});

app.get("/api/rooms", async (req, res) => {
    try {
        const { user } = req.query;
        const { name } = req.query;
        if (user) {
            const userS = await collection_rooms.find({ user: user }).toArray();
            const roomNames = userS.map(room => room.name);
            res.status(200).json(roomNames);
        }

        if (name) {
            const roomS = await collection_rooms.find({ name: name }).toArray();
            const userNames = roomS.map(room => room.user);
            res.status(200).json(roomS);
        }
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









const uploadDir = 'uploads/';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });


app.post('/upload', (req, res, next) => {
    upload.single('messInput')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Ошибка Multer: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: `Ошибка сервера: ${err.message}` });
        }
        return res.json({
            success: true,
            filename: req.file.filename,
            path: path.join("http://localhost:5173", req.file.path)
        });
    });
});



app.get("/api/massages", async (req, res) => {
    try {
        const messages = await collection_massages.find({ room: req.query.room }).toArray();
        res.status(200).json(messages);
    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})










// http://localhost:3000/ node server.mjs