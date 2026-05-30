import { io } from "socket.io-client";

const socket = io("http://localhost:5173");

socket.on("connect", () => {
    console.log("CONNECTED:", socket.id);
});

socket.on("connect_error", (err) => {
    console.log("ERROR:", err.message);
});
