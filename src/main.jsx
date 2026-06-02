import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { io } from "socket.io-client";
import { v1 } from "uuid";

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

    const [message, createMessage] = useState([]);

    function sendMessage() {

        const mes = {
            text: inputRef.current.value,
            key: v1(),
            user: "user"//!!!!!!!!!!!!! user needed
        }

        createMessage([...message, mes]);
        socket.emit("new_massage", mes);
        inputRef.current.value = ""
    }

    const [selectedMessage, selectMessage] = useState(null)
    const [option, optionChanger] = useState(null)

    function optionsHendler(option) {
        if (option === "delete") {
            const updatedMessage = message.filter((mes) => mes.key !== selectedMessage.key)
            createMessage(updatedMessage)
            const mesToDel = {
                text: selectedMessage.text,
                key: selectedMessage.key,
                user: "user"//!!!!!!!!!!!!! user needed
            }
            socket.emit("delete_message", mesToDel);
        }
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
                        {message.map((number) =>
                            <div
                                key={number.key}
                                onContextMenu={(e) => {
                                    e.preventDefault;
                                    selectMessage(number);
                                }}>
                                {number.text}
                                {selectedMessage === number &&
                                    <select onChange={(event) => optionsHendler(event.target.value)}>
                                        <option value="delete">Delete</option>
                                        <option value="change">Change</option>
                                    </select>
                                }
                            </div>)}
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