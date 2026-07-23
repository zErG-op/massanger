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
import argon2 from 'argon2';

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegStatic);

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
app.use('/avatars', express.static('avatars'));

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

    if (!decoded) return res.status(401).json({ authorized: false });

    const user = await collection_users.findOne({ email: decoded.email })

    return res.status(200).json({
        authorized: true,
        email: decoded.email,
        user: user.name,
        avatar: user.avatar
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
    socket.on("room_change", async (user) => {
        io.emit("room_change_confirm", user);
    })

    socket.on("new_massage", async (new_message) => {

        let massage

        if (new_message.type === "text") {
            massage = {
                text: new_message.text,
                user: new_message.user,
                room: new_message.room,
                type: new_message.type,
                key: new_message.key
            };
        } else {
            massage = {
                text: new_message.text,
                user: new_message.user,
                room: new_message.room,
                type: new_message.type,
                key: new_message.key,
                path: new_message.path
            }

        }

        await collection_massages.insertOne(massage);
        io.emit("new_massage", new_message);
    })

    socket.on("delete_message", async (message) => {

        const messageToDEl = await collection_massages.findOne({ key: message.key });
        await collection_massages.deleteOne(messageToDEl);
        socket.broadcast.emit("delete_massage_confirm", message);

        if (message.type !== "text") {
            const rawPath = new URL(message.path).pathname;
            const relativePath = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;
            fs.unlink(relativePath, (err) => { console.log(err) });
            console.log(relativePath)
        }

    });

    socket.on("delete_user", async (key) => {
        const user = await collection_users.findOne({ name: key[1] })
        const result = await collection_rooms.updateOne(
            { name: key[0].name },
            { $pull: { user: { name: key[1] } } }
        );
        console.log(key)
        socket.broadcast.emit("delete_user_confirm", key);
    });

    socket.on("new_room", async (room_name) => {
        console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", room_name[1])
        const room = await collection_rooms.findOne({ name: room_name[0] })
        const user = await collection_users.findOne({ name: room_name[0] })

        const newUserName = await collection_users.findOne({ name: room_name[1] });
        const newUserName1 = await collection_users.findOne({ name: room_name[0] });
        if (user) {

            const nameOfRoom = room_name[0] + "-" + room_name[1]
            const otherNameOfRoom = room_name[1] + "-" + room_name[0]
            const existingRoom = await collection_rooms.findOne({ $or: [{ name: nameOfRoom }, { name: otherNameOfRoom }] });

            if (existingRoom) {
                console.log("already exict")
            } else {
                const data = {
                    name: nameOfRoom,
                    user: [newUserName, newUserName1],
                    type: "private"
                }

                await collection_rooms.insertOne(data)
                socket.join(nameOfRoom);
                socket.emit("newRoom_added", data);
            }
        } else if (room) {
            console.log("1", room_name[0])
            const doc = await collection_rooms.findOne({
                name: room_name[0],
                user: newUserName
            });

            if (doc) {
                console.log("already e")
            } else {
                const result = await collection_rooms.updateOne(
                    { name: room_name[0] },
                    { $push: { user: newUserName } }
                );
                socket.join(room_name[0]);
                socket.emit("newRoom_added", room);

            }
        }
    });

    socket.on("create_room", async (room) => {
        try {
            const user = await collection_users.findOne({ name: room.user[0] })
            const data = {
                name: room.text,
                user: [user],
                admin: [user],
                type: room.type,
                avatar: room.avatar
            }
            const existingRoom = await collection_rooms.findOne({
                name: room.text,
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
            "user": { $ne: user }
        })
        if (user && users !== null) {
            await collection_rooms.updateOne(
                { name: data[0].name },
                { $push: { user: user } }
            );
            socket.emit("user_added", data[1]);
        }
    });

    socket.on("leave", async (data) => {
        const user = await collection_users.findOne({ name: data[1] })
        collection_rooms.updateOne(
            { "name": data[0].name },
            { $pull: { "user": user } }
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

app.post("/api/registration", async (req, res) => {
    try {
        const emailRepeated = await collection_users.findOne({ email: req.body.email })
        const nameRepeated = await collection_users.findOne({ name: req.body.name })

        const hashedPassword = await argon2.hash(req.body.password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1
        });

        const user = {
            id: uuidv4(),
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword
        };

        if (!user.name || !user.password) { return res.status(400).json("Missing something") }
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

        const user = await collection_users.findOne({ email: req.body.email })

        const isPasswordValid = await argon2.verify(user.password, req.body.password);

        if (!isPasswordValid) {
            return res.status(400).json({ message: 'invalid password' });
        }


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
    const { user, name } = req.query;
    const roomMatch = await collection_rooms.findOne({ name: name });
    console.log(req.query)
    try {
        if (roomMatch) {
            console.log("user")
            const room = await collection_rooms.aggregate([
                { $match: { "name": name } },
                {
                    $project: {
                        name: 1,
                        type: 1,
                        user: 1,
                        admin: 1,
                        avatar: 1
                    }
                }
            ]).toArray();

            res.status(200).json(room);
        } else {
            console.log("user")
            const userS = await collection_rooms.aggregate([
                { $match: { "user.name": user } },
                {
                    $project: {
                        name: 1,
                        type: 1,
                        user: 1,
                        admin: 1,
                        avatar: 1
                    }
                }
            ]).toArray();

            res.status(200).json(userS);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});



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
    upload.single('messInput')(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: `Ошибка Multer: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: `Ошибка сервера: ${err.message}` });
        }
        let finalPath = req.file.path;

        /* 
              if (req.file.mimetype.startsWith('image')) {
                  const buffer = await sharp(finalPath).resize({ width: 800 }).toBuffer();
                  fs.writeFileSync(finalPath, buffer);
              }
      
              if (req.file.mimetype.startsWith('video')) {
                  finalPath = req.file.path + '_res.mp4';
                  ffmpeg(req.file.path).size('1280x720').save(finalPath);
              }
      */
        const webPath = finalPath.replace(/\\/g, '/');
        return res.json({
            success: true,
            filename: req.file.filename,
            path: `http://localhost:5173/${webPath}`
        });
    });
});


const avatarsDir = 'avatars/';

const storageAvatars = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, avatarsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadAvatars = multer({
    storage: storageAvatars,
    fileFilter: (req, file, cb) => { cb(null, true) },
    limits: { fileSize: 5 * 1024 * 1024 }
});


app.post('/change-avatar', uploadAvatars.single('avatar'), async (req, res) => {
    try {
        console.log(req.body);
        const { name, newName, type } = req.body;

        const filename = req.file ? req.file.filename : null;
        let avatarPath;


        if (type === 'user') {
            const user = await collection_users.findOne({ name });

            if (user.avatar) {

                const brokenPath = user.avatar;
                const parts = brokenPath.split(/avatars[\\/]/);
                const filename = parts[parts.length - 1];
                const absolutePath = path.join(__dirname, 'avatars', filename);

                fs.unlink(absolutePath, (err) => { console.log(err) });
            }


            if (!user) return res.status(444).json({ success: false, message: 'User not found' });

            avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : user.avatar;

            await collection_users.updateOne(
                { name },
                { $set: { name: newName, avatar: avatarPath } }
            );

            await collection_rooms.updateMany(
                { "user.name": name },
                { $set: { "user.$[elem].name": newName } },
                { arrayFilters: [{ "elem.name": name }] }
            );

        } else if (type === 'room') {
            const room = await collection_rooms.findOne({ name });




            if (!room) {
                return res.status(444).json({ success: false, message: 'Room not found' });
            }

            avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : room.avatar;

            await collection_rooms.updateOne(
                { name },
                { $set: { name: newName, avatar: avatarPath } }
            );

        } else {
            return res.status(400).json({ success: false, message: 'Invalid type. Use "user" or "room"' });
        }

        return res.json({
            success: true,
            avatar: avatarPath,
            filename: filename
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/upload-room', uploadAvatars.single('avatar'), async (req, res) => {
    try {
        const filename = req.file ? req.file.filename : null;
        const avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : req.avatar;

        return res.json({
            success: true,
            avatar: avatarPath,
            filename: filename
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
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