import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { io } from "socket.io-client";
import { v1 } from "uuid";

const socket = io("http://localhost:3000", {
    transports: ["websocket"]
});

function App() {

    useEffect(() => {
        socket.on('connect', () => {
            console.log(`Connected! My ID: ${socket.id}`);
        });

        return () => socket.off('connect');
    }, []);

    useEffect(() => {
        socket.on('connect_error', (error) => {
            console.error('Error:', error.message);
            console.log('Details', error);
        });

        return () => socket.off('connect_error');
    }, []);

    const [room, setRoom] = useState(null);
    const [joined, accept] = useState(false);

    const joiningRoom = (room) => {
        socket.emit("join_room", room);
        setRoom(room)
        accept(true)
        console.log(room)
    }

    const [arr, setArr] = useState([]);

    async function fetching() {
        const fff = await fetch("http://localhost:3000/api/rooms?user=user.id") //!!!!!!!!!!!!! user needed
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

    const inputRef = useRef();

    const [message, createMessage] = useState([]);

    function sendMessage() {

        const mes = {
            text: inputRef.current.value,
            key: v1(),
            user: "user",//!!!!!!!!!!!!! user needed
            room: room
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
                user: "user",//!!!!!!!!!!!!! user needed
                room: room
            }
            socket.emit("delete_message", mesToDel);
        }
    }

    const [users, addUser] = useState(null);
    const [viewed, view] = useState(false);

    async function viewMembers() {
        addUser(null)
        const url = `http://localhost:3000/api/rooms?name=${room}`;
        const fff = await fetch(url)
        const usersList = await fff.json()
        addUser(usersList)
        view(true)
        console.log(usersList)
    }

    const inputStyle = {}
    const ulStyle = { height: "100%", padding: 0 }
    const liStyle = { backgroundColor: '#fcfcfc', fontSize: '16px', listStyleType: 'none', padding: 0, margin: 0, height: '5em', width: '15em' };
    const messageStyle = { backgroundColor: '#f5600a', listStyleType: 'none', padding: '10px', width: 'max-content', display: 'inline-block', borderRadius: '10px' };

    return (
        <>
            <div style={{ display: 'flex', gap: '20px' }}>
                <ul style={{ marginLeft: '10px', listStyleType: 'none', margin: 0, padding: 0 }}>
                    {arr.map((item, index) => (
                        <li
                            onClick={() => joiningRoom(item)}
                            key={index}
                            style={{ ...liStyle }}
                        >
                            {JSON.stringify(item)}
                        </li>
                    ))}
                </ul>

                <span>
                    {joined ? (
                        <span style={{ marginLeft: 50 }}>
                            {message.map((number) => (
                                <span
                                    style={{ ...messageStyle, display: 'block', marginBottom: '10px' }}
                                    key={number.key}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectMessage(number);
                                    }}
                                >
                                    {number.user}: {number.text}

                                    {selectedMessage === number && (
                                        <select
                                            style={{ marginLeft: '10px' }}
                                            onChange={(event) => optionsHendler(event.target.value)}
                                        >
                                            <option value="delete">Delete</option>
                                            <option value="change">Change</option>
                                        </select>
                                    )}
                                </span>
                            ))}
                            <input name="messInput" ref={inputRef} style={{ ...inputStyle }} />
                            <button onClick={() => sendMessage()}>Подтвердить</button>
                            <button onClick={() => viewMembers()}>Пользователи</button>
                        </span>
                    ) : (
                        <span>васап</span>
                    )}
                </span>                     {viewed ? (
                    <span style={{ marginLeft: 50 }}>
                        {users.map((number) => (
                            <span
                                key={number._id}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    selectMessage(number);
                                }}
                            >
                                {number.user}

                            </span>
                        ))}
                    </span>
                ) : (
                    <span>васап</span>
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