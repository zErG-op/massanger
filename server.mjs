import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = dotenv.config({ path: path.join(__dirname, 'secret.env') });

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { MongoClient } from "mongodb";
import { dirname } from "path";
import { v4 as uuidv4 } from "uuid";
import { create } from "domain";
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import cors from 'cors';
import multer from 'multer';
import argon2 from 'argon2';
import { Resend } from 'resend';

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

app.use(express.static(__dirname + "/public"));
app.use(express.json());
app.use('/avatars', express.static('avatars'));

const client = new MongoClient("mongodb://127.0.0.1:27017");
const db = client.db("myAppDB");
const collection_users = db.collection("users");
const collection_rooms = db.collection("rooms");
const collection_massages = db.collection("massages");
const collection_verification_codes = db.collection("verification_codes");
const JWT_SECRET = process.env.JWT_SECRET;



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

    io.use(async (socket, next) => {
        const decoded = verifyTokenFromCookies(socket.handshake.headers.cookie);
        if (!decoded) return next(new Error("Authentication error"));

        const user = await collection_users.findOne({ email: decoded.email });
        if (!user) return next(new Error("User not found"));

        socket.user = user.name;
        socket.userEmail = decoded.email;
        socket.join(`user:${user.name}`);

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

    socket.on("set_online", async (user) => {
        socket.user = user;
        await collection_users.updateOne(
            { name: user },
            { $set: { online: true } }
        );
        socket.broadcast.emit("user_status_changed", user);
    });

    socket.on("join_room", async (room) => {
        try {
            if (!room?.name) return;

            if (socket.currentRoom) {
                socket.leave(socket.currentRoom);
            }

            socket.join(room.name);
            socket.currentRoom = room.name;

        } catch (err) {
            console.error("join_room error:", err);
        }
    });

    socket.on("room_change", async (user) => {
        io.emit("room_change_confirm", user);
    })

    socket.on("new_massage", async (new_message) => {
        const room = await collection_rooms.findOne({ name: new_message.room });

        if (room?.blocked?.includes(new_message.user)) {
            return socket.emit("error", {
                message: "You are blocked here"
            });
        }

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
        io.to(new_message.room).emit("new_massage", new_message);
    })

    socket.on("delete_message", async (message) => {

        const messageToDEl = await collection_massages.findOne({ key: message.key });
        await collection_massages.deleteOne(messageToDEl);

        if (message.type !== "text") {
            const rawPath = new URL(message.path).pathname;
            const relativePath = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;
            fs.unlink(relativePath, (err) => { console.log(err) });
        }
        io.to(message.room).emit("delete_massage_confirm", message);
    });

    socket.on("delete_user", async (key) => {
        try {
            const roomName = key?.[0]?.name || key?.[0];
            const userNameToDelete = key?.[1];
            const adminName = socket.user;

            if (!roomName || !userNameToDelete || !adminName) return;

            const room = await collection_rooms.findOne({ name: roomName });
            if (!room) return;

            if (!isRoomAdmin(room, adminName)) {
                socket.emit("error", { message: "Only admin can delete users" });
                return;
            }

            if (userNameToDelete === adminName) return;

            await collection_rooms.updateOne(
                { name: roomName },
                { $pull: { user: { name: userNameToDelete } } }
            );

            const roomSockets = io.sockets.adapter.rooms.get(roomName);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s && s.user === userNameToDelete) {
                        s.leave(roomName);
                        s.emit("removed_from_room", {
                            roomName,
                            reason: "deleted_by_admin"
                        });
                    }
                }
            }

            io.to(roomName).emit("delete_user_confirm", key);

        } catch (err) {
            console.error(err);
        }
    });


    socket.on("new_room", async (room_name) => {
        try {
            const targetName = room_name[0];
            const joiningUserName = room_name[1];

            const room = await collection_rooms.findOne({ name: targetName });
            const user = await collection_users.findOne({ name: targetName });

            const newUserName = await collection_users.findOne({ name: joiningUserName });
            const newUserName1 = await collection_users.findOne({ name: targetName });

            if (user) {
                const nameOfRoom = targetName + "-" + joiningUserName;
                const otherNameOfRoom = joiningUserName + "-" + targetName;
                const existingRoom = await collection_rooms.findOne({ $or: [{ name: nameOfRoom }, { name: otherNameOfRoom }] });

                if (existingRoom) {
                    console.log("already exist");
                } else {
                    const data = {
                        name: nameOfRoom,
                        user: [newUserName, newUserName1],
                        type: "private",
                        blocked: []
                    };

                    await collection_rooms.insertOne(data);
                    socket.join(nameOfRoom);
                    socket.emit("newRoom_added", data);

                    for (const [id, s] of io.sockets.sockets) {
                        if (s.user === targetName) {
                            s.join(nameOfRoom);
                            s.emit("added_to_room", { room: data });
                        }
                    }

                }
            } else if (room) {
                const alreadyIn = await collection_rooms.findOne({
                    name: targetName,
                    "user.name": joiningUserName
                });

                const blockedIn = await collection_rooms.findOne({
                    name: targetName,
                    blocked: joiningUserName
                });

                if (alreadyIn) {
                    socket.emit("room_error", { message: "You are already in this room" });
                } else if (blockedIn) {
                    socket.emit("room_error", { message: "You are blocked in this room and cannot join" });
                } else {

                    await collection_rooms.updateOne(
                        { name: targetName },
                        { $push: { user: newUserName } }
                    );

                    socket.join(targetName);

                    const updatedRoom = await collection_rooms.findOne({ name: targetName });
                    socket.emit("newRoom_added", updatedRoom);

                    socket.to(targetName).emit("user_added", { roomName: targetName, user: newUserName });
                }
            } else {
                socket.emit("room_error", { message: "Such room or user do not exist" });
            }
        } catch (err) {
            console.error(err);
        }
    });


    socket.on("create_room", uploadAvatars.single('avatar'), async (room) => {
        try {

            const { name, user, admin, type } = req.body
            const userObj = await collection_users.findOne({ name: user })

            const existingRoom = await collection_rooms.findOne({
                name: name,
                type: type
            });
            if (existingRoom) {
                res.status(404).json({ message: "Room with this name already exist" });
                return
            }
            const filename = req.file ? req.file.filename : null;
            const avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : req.avatar;
            const data = {
                name: name,
                user: [userObj],
                admin: [userObj],
                type: type,
                avatar: avatarPath,
                blocked: []
            }
            const result = await collection_rooms.insertOne(data);

            return res.json({ success: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ success: false, message: error.message });
        }

    })

    socket.on("disconnect", async () => {
        if (socket.currentRoom) {
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }

        if (!socket.user) return;

        await collection_users.updateOne(
            { name: socket.user },
            { $set: { online: false } }
        );

        socket.broadcast.emit("user_status_changed", {
            user: socket.user,
            online: false
        });
    });

    socket.on("new_user", async (data) => {
        try {
            const roomName = data[0].name;
            const userNameToAdd = data[1];

            const userToAdd = await collection_users.findOne({ name: userNameToAdd });
            if (!userToAdd) {
                socket.emit("room_adding", { message: "Such user do not exist" });
                return;
            }

            const room = await collection_rooms.findOne({
                name: roomName,
                "user.name": userNameToAdd
            });

            if (room) {
                socket.emit("room_adding", { message: "User is already in this room" });
                return;
            }

            await collection_rooms.updateOne(
                { name: roomName },
                { $push: { user: userToAdd } }
            );

            io.to(roomName).emit("user_added", {
                roomName,
                user: userToAdd
            });

            const updatedRoom = await collection_rooms.findOne({ name: roomName });

            for (const [id, s] of io.sockets.sockets) {
                if (s.user === userNameToAdd) {
                    s.emit("added_to_room", {
                        roomName,
                        room: updatedRoom
                    });
                }
            }

        } catch (err) {
            console.error(err);
        }
    });


    socket.on("leave", async (data) => {
        const user = await collection_users.findOne({ name: data[1] })
        collection_rooms.updateOne(
            { "name": data[0].name },
            {
                $pull: {
                    user: { name: data[1] }
                }
            }
        )
        const roomName = data?.[0]?.name || data?.[0];
        const userNameToDelete = data?.[1];
        io.to(roomName).emit("user_leaved", {
            roomName: roomName,
            userName: userNameToDelete
        });

    });

    socket.on("block_user", async ({ roomName, userToBlock, adminName }) => {
        try {
            const room = await collection_rooms.findOne({ name: roomName });
            if (!room) return;

            const realAdmin = socket.user;

            const canBlock =
                room.type === "private"
                    ? room.user?.some(u => u.name === realAdmin)
                    : isRoomAdmin(room, realAdmin);

            if (!canBlock) {
                socket.emit("error", { message: "No permission to block" });
                return;
            }

            if (userToBlock === realAdmin) return;

            await collection_rooms.updateOne(
                { name: roomName },
                { $addToSet: { blocked: userToBlock } }
            );

            io.to(roomName).emit("user_blocked", {
                roomName,
                user: userToBlock,
                blockedBy: realAdmin
            });

        } catch (err) {
            console.error(err);
        }
    });

    socket.on("unblock_user", async ({ roomName, userToBlock }) => {
        try {
            const room = await collection_rooms.findOne({ name: roomName });
            if (!room) return;

            const realAdmin = socket.user;

            const canUnblock =
                room.type === "private"
                    ? room.user?.some(u => u.name === realAdmin)
                    : isRoomAdmin(room, realAdmin);

            if (!canUnblock) {
                socket.emit("error", { message: "No permission to unblock" });
                return;
            }

            await collection_rooms.updateOne(
                { name: roomName },
                { $pull: { blocked: userToBlock } }
            );

            io.to(roomName).emit("user_unblocked", {
                roomName,
                user: userToBlock
            });

        } catch (err) {
            console.error(err);
        }
    });

});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000/");
});

app.get('/api/users/online', async (req, res) => {
    try {
        const onlineUsers = (await collection_users
            .find({ online: true })
            .project({ name: 1, _id: 0 })
            .toArray())
            .map(user => user.name);
        console.log(onlineUsers)
        res.json(onlineUsers);

    } catch (error) {
        res.status(500).json([]);
    }
});

app.post("/api/verification/code", async (req, res) => {
    try {
        const resend = new Resend(process.env.API_KEY);

        const { email, name } = req.body;

        const emailRepeated = await collection_users.findOne({ email: email })
        const nameRepeated = await collection_users.findOne({ name: name })

        if (emailRepeated) {
            res.status(400).json({ success: false, message: "Email already exists", field: "email" })
            return
        }

        if (nameRepeated) {
            res.status(400).json({ success: false, message: "Name already exists", field: "name" })
            return
        }

        const code = crypto.randomInt(100000, 999999).toString();

        await collection_verification_codes.deleteMany({ email });

        await collection_verification_codes.insertOne({
            email,
            code,
            createdAt: new Date(),
            expiresIn: new Date(Date.now() + 5 * 60 * 1000),
            attempts: 0,
            isActive: true
        });

        const { data, error } = await resend.emails.send({
            from: 'Acme <onboarding@resend.dev>',
            to: "kirillrubcov990@gmail.com",
            subject: 'Verification Code',
            html: `<p>Your code is <strong>${code}</strong></p>`,
        });

        if (error) {
            console.error("Resend error:", error);
            return res.status(500).json({ success: false, message: "email send error" });
        }

        return res.status(200).json({ success: true, message: "code is sent" });

    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({ success: false, message: err });
    }
});


app.post('/api/verification/verify', async (req, res) => {
    try {

        const { email, password, name, code } = req.body;

        if (!code) return res.status(400).json({ success: false, message: 'Field must be filled' });

        const record = await collection_verification_codes.findOne({ email, code });
        const record1 = await collection_verification_codes.findOne({ email });

        if (record1.attempts > 4) return res.status(400).json({ success: false, message: 'Too much attempts' });
        if (record1.expiresIn < Date.now()) {
            await collection_verification_codes.updateOne({ email }, { $set: { isActive: false } });
            return res.status(400).json({ success: false, message: 'Code is expired' });
        }

        if (!record) {
            res.status(400).json({ success: false, message: 'invalid code' });
            await collection_verification_codes.updateOne({ email }, { $inc: { attempts: 1 } });
            return
        }

        await collection_verification_codes.deleteOne({ _id: record._id });

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
            password: hashedPassword,
            attempts: 0,
            lockedUntil: ""
        };

        const result = await collection_users.insertOne(user);

        const payload = { id: user.id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: "lax",
            maxAge: 60 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            message: "User verified and registered successfully",
            user: { id: user.id, name: user.name, email: user.email }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err });
    }
});


app.delete("/api/verification/code", async (req, res) => {
    const { email, code } = req.body
    await collection_verification_codes.deleteMany({ email });
})


app.post("/api/users/change-password", async (req, res) => {

    const user = await collection_users.findOne({ name: req.body.user })
    const isPasswordValid = await argon2.verify(user.password, req.body.oldPassword);

    if (!isPasswordValid) { return res.status(400).json({ success: false, password: "old", message: 'invalid oldPassword' }) }
    if (req.body.newPassword.trim().length === 0) { return res.status(400).json({ success: false, password: "new", message: 'Password cannot consist of spaces only' }) }

    const newPasswordHash = await argon2.hash(req.body.newPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1
    });

    if (isPasswordValid) {

        await collection_users.updateOne(
            { _id: user._id },
            { $set: { password: newPasswordHash } }
        )
        return res.status(200).json({ success: true, message: "password successfully updated" });
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
        const { email, password } = req.body
        const user = await collection_users.findOne({ email })

        if (!user) return res.status(404).json({ message: "no such user" });

        if (user.lockedUntil > new Date()) return;
        if (user.lockedUntil < new Date()) await collection_users.updateOne({ email }, { $set: { lockedUntil: "", attempts: 0 } })

        if (user.attempts > 4) {
            await collection_users.updateOne(
                { email },
                { $set: { lockedUntil: new Date(Date.now() + 30 * 60 * 1000) } }
            )
            return res.status(400).json({ message: "too much attempts" });
        }

        const isPasswordValid = await argon2.verify(user.password, password);

        if (!isPasswordValid) {
            await collection_users.updateOne({ email }, { $inc: { attempts: 1 } })
            return res.status(400).json({ message: 'invalid password' });
        }

        const options = { expiresIn: '1h' };
        const payload = { email: user.email };

        const token = jwt.sign(payload, JWT_SECRET, options);

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 60 * 60 * 1000
        })
        return res.status(200).json({ message: true });
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
            const room = await collection_rooms.aggregate([
                { $match: { "name": name } },
                {
                    $project: {
                        name: 1,
                        type: 1,
                        user: 1,
                        admin: 1,
                        avatar: 1,
                        blocked: 1
                    }
                }
            ]).toArray();

            res.status(200).json(room);
        } else {
            const userS = await collection_rooms.aggregate([
                { $match: { "user.name": user } },
                {
                    $project: {
                        name: 1,
                        type: 1,
                        user: 1,
                        admin: 1,
                        avatar: 1,
                        blocked: 1
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
            return res.status(400).json({ error: `Multer error: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ error: `Server error: ${err.message}` });
        }
        let finalPath = req.file.path;

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

app.post('/change-avatar', uploadAvatars.single('avatar'), async (req, res) => {
    try {
        const { name, newName, type } = req.body;

        const filename = req.file ? req.file.filename : null;
        let avatarPath;


        if (type === 'user') {
            const user = await collection_users.findOne({ name });
            if (newName !== name) {
                const userDuplicate = await collection_users.findOne({ name: newName });
                if (userDuplicate) {
                    return res.status(404).json({ success: false, message: 'User with this name already exists' });
                }
            }

            if (user.avatar) {

                const brokenPath = user.avatar;
                const parts = brokenPath.split(/avatars[\\/]/);
                const filename = parts[parts.length - 1];
                const absolutePath = path.join(__dirname, 'avatars', filename);

                fs.unlink(absolutePath, (err) => { console.log(err) });
            }

            avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : user.avatar;

            await collection_users.updateOne(
                { name },
                { $set: { name: newName, avatar: avatarPath } }
            );

            await collection_rooms.updateMany(
                { "user.name": name },
                { $set: { "user.$[uElem].name": newName } },
                { arrayFilters: [{ "uElem.name": name }] }
            );

            await collection_rooms.updateMany(
                { "admin.name": name },
                { $set: { "admin.$[aElem].name": newName } },
                { arrayFilters: [{ "aElem.name": name }] }
            );

            const userRooms = await collection_rooms
                .find({ "user.name": newName || name })
                .project({ name: 1 })
                .toArray();

            userRooms.forEach(room => {
                io.to(room.name).emit("user_updated", {
                    oldName: name,
                    newName: newName || name,
                    avatar: avatarPath
                });
            });


        } else if (type === 'room') {
            const room = await collection_rooms.findOne({ name });

            if (!room) {
                return res.status(404).json({ success: false, message: 'Room not found' });
            }

            const oldName = name;

            avatarPath = filename ? `http://localhost:3000/avatars/${filename}` : room.avatar;

            await collection_rooms.updateOne(
                { name: oldName },
                { $set: { name: newName, avatar: avatarPath } }
            );

            await collection_massages.updateMany(
                { room: oldName },
                { $set: { room: newName } }
            );

            const roomSockets = io.sockets.adapter.rooms.get(oldName);

            if (roomSockets) {
                for (const socketId of [...roomSockets]) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s) {
                        s.leave(oldName);
                        s.join(newName);
                    }
                }
            }

            io.to(newName).emit("room_updated", {
                oldName,
                newName,
                avatar: avatarPath
            });

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

app.post('/api/rooms', async (req, res) => {
    try {
        const { text, type, avatar } = req.body;

        const decoded = verifyTokenFromCookies(req.headers.cookie);
        if (!decoded) return res.status(401).json({ success: false });

        const user = await collection_users.findOne({ email: decoded.email });
        if (!user) return res.status(401).json({ success: false });

        const existingRoom = await collection_rooms.findOne({ name: text, type });
        if (existingRoom) {
            return res.status(400).json({ success: false, message: "Room with this name already exist" });
        }

        const data = {
            name: text,
            user: [user],
            admin: [user],
            type: type || "main",
            avatar: avatar || null,
            blocked: []
        };

        await collection_rooms.insertOne(data);

        io.to(`user:${user.name}`).emit("room_created", data);

        res.json({ success: true, room: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
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