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

app.get("/api/auth/me", async (req, res) => {
    const decoded = verifyTokenFromCookies(req.headers.cookie);

    if (!decoded) {
        return res.status(401).json({ authorized: false });
    }
    const user = await collection_users.findOne({ email: decoded.email })

    return res.status(200).json({
        authorized: true,
        email: decoded.email,
        user: user.name
    });
});

io.on("connection", async (socket) => {

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
            user: new_message.user,
            room: new_message.room,
            type: new_message.type,
            key: new_message.key
        };

        await collection_massages.insertOne(massage);
        io.emit("new_massage", new_message);
    })

    socket.on("delete_message", async (key) => {

        const message = await collection_massages.findOne({ key: key });
        await collection_massages.deleteOne(message);
        socket.broadcast.emit("delete_massage_confirm", key);
    });

    socket.on("delete_user", async (key) => {

        const result = await collection_rooms.updateOne(
            { name: key[0] },
            { $pull: { user: key[1] } }
        );

        socket.broadcast.emit("delete_user_confirm", key);
    });

    socket.on("new_room", async (room_name) => {
        const room = await collection_rooms.findOne({ name: room_name[0] })
        const user = await collection_users.findOne({ name: room_name[0] })

        if (user) {

            const nameOfRoom = room_name[0] + "-" + room_name[1]
            const otherNameOfRoom = room_name[1] + "-" + room_name[0]
            const existingRoom = await collection_rooms.findOne({ $or: [{ name: nameOfRoom }, { name: otherNameOfRoom }] });

            if (existingRoom) {
                console.log("already exict")
            } else {
                const data = {
                    name: nameOfRoom,
                    user: room_name,
                    type: "private"
                }

                await collection_rooms.insertOne(data)
                socket.join(nameOfRoom);
                socket.emit("newRoom_added", data);
            }
        } else if (room) {

            const doc = await collection_rooms.findOne({
                name: room_name[0],
                user: room_name[1]
            });

            if (doc) {
                console.log("already e")
            } else {
                const newUserName = room_name[1];

                const result = await collection_rooms.updateOne(
                    { name: room_name[0] },
                    { $addToSet: { user: newUserName } }
                );
                socket.join(room_name[0]);
                socket.emit("newRoom_added", room);

            }
        }
    });

    socket.on("create_room", async (room) => {
        try {

            const data = {
                name: room.text,
                user: room.user,
                admin: room.admin,
                type: room.type
            }
            const existingRoom = await collection_rooms.findOne({
                name: room.text,
                user: room.user,
                admin: room.admin,
                type: room.type
            });
            if (existingRoom) {
                console.log("already exist!!!");
            } else {
                const result = await collection_rooms.insertOne(data);
                socket.broadcast.emit("room_created", data);
            }

        } catch (err) {
            console.log(err);
        }

    })

    socket.on("set_online", async (user) => {

        await collection_users.updateOne(
            { name: user },
            { $set: { online: true } }
        );

        socket.broadcast.emit("user_status_changed", user);
    });

    socket.on("set_online", async (user) => {
        socket.user = user;
        await collection_users.updateOne(
            { name: user },
            { $set: { online: true } }
        );
        socket.broadcast.emit("user_status_changed", user);
    });

    socket.on("disconnect", async () => {

        if (socket.user) {
            await collection_users.updateOne(
                { name: socket.user },
                { $set: { online: false } }
            );
            socket.broadcast.emit("user_status_changed", socket.user);
        }
    });

    socket.on("new_user", async (data) => {
        const user = await collection_users.findOne({ name: data[1] })
        const users = await collection_rooms.findOne({
            "name": data[0].name,
            "user": { $ne: data[1] }
        })
        if (user && users !== null) {
            await collection_rooms.updateOne(
                { name: data[0].name },
                { $push: { user: data[1] } }
            );
            socket.emit("user_added", data[1]);
        }
    });

    socket.on("leave", async (data) => {

        collection_rooms.updateOne(
            { "name": data[0].name },
            { $pull: { "user": data[1] } }
        )
        socket.emit("user_leaved", data);
    });

});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000/");
});

app.get('/api/users/online', async (req, res) => {
    try {
        const onlineUsers = await collection_users
            .find({ online: true })
            .project({ name: 1, _id: 0 })
            .toArray();

        const names = onlineUsers.map(u => u.name);
        res.json(names);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.post("/api/users", async (req, res) => {
    try {
        const emailRepeated = await collection_users.findOne({ email: req.body.email })
        const nameRepeated = await collection_users.findOne({ name: req.body.name })

        const user = {
            id: uuidv4(),
            name: req.body.name,
            email: req.body.email,
            password: req.body.password
        };

        if (!user.name || !user.surname || !user.surname || !user.password) { return res.status(400).json("Missing something") }
        if (emailRepeated || nameRepeated) { return res.status(400).json("Email or name already exists") }
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
        const userS = await collection_rooms.find({ user: user }).toArray();
        res.status(200).json(userS);
    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})

app.get("/api/rooms/user", async (req, res) => {
    try {
        const name = req.query.name;
        const userS = await collection_rooms.findOne({ name: name });
        res.status(200).json(userS);
    } catch (err) {
        console.log(err);
        res.status(500).json(err.message);
    }
})

app.delete("/api/rooms", async (req, res) => {
    try {

        const user = req.query.user;
        const result = await collection_rooms.deleteOne({ user: user });
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