import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { io } from "socket.io-client";

function App() {
    const socket = io("https://your-server-url.com");
    const [arr, setArr] = useState([]);

    async function fetching() {
        const fff = await fetch("http://localhost:3000/api/rooms?user=user.id")
        const jsonchik = await fff.json()
        return jsonchik
    }

    useEffect(() => {
        async function hui() {
            const data = await fetching()
            setArr(data)
        }
        hui()
    }, [])


    function joining(room) {
        socket.emit("join-room", room);
        socket.rooms.forEach((room) => {
            if (room !== socket.id) {
                console.log(`Пользователь находится в комнате: ${room}`);
            }
        });
    }

    return (
        <>
            <ul>
                {arr.map((room, index) => (
                    <li onClick={() => joining(room)} key={index}>{JSON.stringify(room)}</li>
                ))}
            </ul>
        </>
    )
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

//npm run dev