import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
    transports: ["websocket"]
});

socket.on('connect', () => {
    console.log(`Connected! My ID: ${socket.id}`);
});

socket.on('connect_error', (error) => {
    console.error('Error:', error.message);
    console.log('Details', error);
});

function App() {
    const [room, setRoom] = useState(null);
    const [joined, accept] = useState(false);

    const joiningRoom = (room) => {
        socket.emit("join_room", room);
        setRoom(room)
        accept(true)
    }

    const [arr, setArr] = useState([]);

    async function fetching() {
        const fff = await fetch("http://localhost:3000/api/rooms?user=user.id")
        const jsonchik = await fff.json()
        return jsonchik
    }
    fetching()
    useEffect(() => {
        async function hui() {
            const data = await fetching()
            setArr(data)
        }
        hui()
    }, [])

    const inputRef = useRef();


    const [message, createMessage] = useState('');

    function sendMessage() {
        createMessage(inputRef.current.value);
        inputRef.current.value = ""
        return <span>{message}</span>;
    }
    return (
        <>
            <ul>
                {arr.map((room, index) => (
                    <li onClick={() => joiningRoom(room)} key={index}>{JSON.stringify(room)}</li>
                ))}
            </ul>
            <div>
                {joined ? (
                    <div>
                        <input name="messInput" ref={inputRef} />
                        <button onClick={() => sendMessage()}>Подтвердить</button>
                    </div>
                ) : (
                    <h1>васап</h1>
                )}
            </div>
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