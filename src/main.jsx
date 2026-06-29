import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { io } from "socket.io-client";
import { v1 } from "uuid";
import { shell } from 'electron';
import ReactPlayer from 'react-player';
import './style.css';
const socket = io("http://localhost:3000", {
    transports: ["websocket"]
});

function App() {

    const [room, setRoom] = useState(null);
    const [joined, accept] = useState(false);
    const [arr, setArr] = useState([]);
    const [users, addUser] = useState(null);
    const [viewed, view] = useState(false);
    const [files, setFiles] = useState(null);
    const [add, fileAdded] = useState("text");
    const [message, createMessage] = useState([]);
    const [selectedMessage, selectMessage] = useState(null)
    const [option, optionChanger] = useState(null)

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


    const joiningRoom = async (room) => {
        socket.emit("join_room", room);
        setRoom(room)
        accept(true)
        console.log(room)
        const params = decodeURIComponent(room);
        const url = `http://localhost:3000/api/massages?room=${params}`;
        const fff = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        })
        createMessage([])
        console.log(message)
        const messagesList = await fff.json()
        const currunt_messages = messagesList.filter((mes) => mes.room === room)
        createMessage(currunt_messages);
    }


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


    async function viewMembers() {
        if (viewed) {
            view(false)
        } else {
            addUser(null)
            const url = `http://localhost:3000/api/rooms?name=${room}`;
            const fff = await fetch(url)
            const usersList = await fff.json()
            addUser(usersList)
            view(true)
            console.log(usersList)
        }
    }
    function fileAdder() {
        fileAdded("file")
    }

    const sendFiles = async (e) => {

        const formData = new FormData();
        formData.append('messInput', e);

        const response = await fetch('http://localhost:3000/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        console.log(data.path.slice(2).split(/[\\/]/).pop());
        const url = data.path.slice(2).split(/[\\/]/).pop();
        const serverUrl = `http://localhost:5173/uploads/${url}`;




        let fullName = String(e.type).split("")
        let type

        for (let i = 0; i < fullName.length; i++) {
            if (fullName[i] === "/") {
                type = fullName.slice(i - fullName.length + 1).join("")
                console.log(type)
                console.log("гойда")

            }
        }

        const file = {
            //text: "aaa",
            path: serverUrl,
            key: v1(),
            user: "user",//!!!!!!!!!!!!! user needed
            room: room,
            type: type
        }
        createMessage([...message, file]);
        console.log("file: ", file)
    };

    const uploader = (e) => {
        e.preventDefault();
        const selectedFiles = e.dataTransfer.files;

        if (!selectedFiles || selectedFiles.length === 0) {
            console.log("Файл не выбран в проводнике");
            return;
        }

        const targetFile = selectedFiles[0];
        console.log("Файл подготовлен к отправке:", targetFile.name);
        setFiles(targetFile);
        sendFiles(targetFile);

        e.target.value = "";
        fileAdded("text")

    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };


    function sendMessage() {
        if (inputRef.current.value.trim().length > 1) {
            const mes = {
                text: inputRef.current.value.trim(),
                key: v1(),
                user: "user",//!!!!!!!!!!!!! user needed
                room: room,
                type: "messages"
            }

            createMessage([...message, mes]);
            socket.emit("new_massage", mes);
            inputRef.current.value = ""
        }
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            const mes = {
                text: inputRef.current.value.trim(),
                key: v1(),
                user: "user",//!!!!!!!!!!!!! user needed
                room: room,
                type: "messages"
            }

            createMessage([...message, mes]);
            socket.emit("new_massage", mes);
            inputRef.current.value = ""
        }
    };

    const fileOpen = (filePath) => {
        if (!filePath) return;
        document.title = `OPEN_FILE:${filePath}`;
        console.log("React: Отправили путь через заголовок:", filePath);
    };

    const ulStyle = { height: "100%", padding: 0 }
    const messageStyle = { backgroundColor: '#f5600a', listStyleType: 'none', padding: '10px', width: 'max-content', display: 'inline-block', borderRadius: '10px' };

    return (
        <>
            <div style={{ display: 'flex', gap: '20px' }}>
                <ul style={{ marginLeft: '10px', listStyleType: 'none', margin: 0, padding: 0 }}>
                    {arr.map((item, index) => (
                        <li
                            onClick={() => joiningRoom(item)}
                            key={index}
                            className="hover-li"
                        >
                            {JSON.stringify(item)}
                        </li>
                    ))}
                </ul>

                <span>
                    {joined ? (
                        <span style={{ marginLeft: 10, position: 'fixed', top: 0, right: 100, width: '81.4vw', height: '100vh', zIndex: 9999 }} onDrop={uploader} onDragOver={uploader}>
                            {message.map((number) => (
                                <span
                                    style={{ ...messageStyle, display: 'block', marginBottom: '10px' }}
                                    key={number.key}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectMessage(number);
                                    }}
                                >

                                    {number.text && (
                                        <span style={{ ...messageStyle }}>{number.user}: {number.text}; </span>
                                    )}

                                    {number.type === 'jpeg' && (
                                        <img src={number.path} width="300" height="200" alt="uploaded" />
                                    )}

                                    {number.type === 'mp4' && (
                                        <ReactPlayer url={number.path} controls={true} width="300" height="200" />
                                    )}
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
                            <input name="messInput" ref={inputRef} type={add} onChange={uploader} className="input" onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                            <>
                                <button onClick={() => sendMessage()} className="img-btn">
                                    <img src="/img/images.png" alt="" className="img-for-btn" />
                                </button>

                                <button onClick={() => viewMembers()} className="img-btn">
                                    <img src="/img/users.png" alt="" className="img-for-btn" />
                                </button>

                                <button onClick={() => fileAdder()} className="img-btn">
                                    <img src="/img/file.png" alt="" className="img-for-btn" />
                                </button>
                            </>

                        </span>
                    ) : (
                        <span>васап</span>
                    )}
                </span>                     {viewed ? (
                    <span style={{ marginLeft: 'auto' }}>
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
                    <span></span>
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