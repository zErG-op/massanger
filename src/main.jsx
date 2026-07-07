import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { io } from "socket.io-client";
import { v1 } from "uuid";
import { shell } from 'electron';
import ReactPlayer from 'react-player';
import { contextBridge, ipcRenderer } from 'electron';
import './style.css';
const socket = io("http://localhost:3000", {
    transports: ["websocket"],
    withCredentials: true,
    // autoConnect: false
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
    const [logStat, logStatChange] = useState(false)
    const socketRef = useRef(null);


    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const [user, setUser] = useState(null);
    useEffect(() => {
        fetch("http://localhost:3000/api/auth/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.authorized) {
                    setIsAuthenticated(true);
                    setUser(data.user)
                    fetching(data.user)
                } else {
                    setIsAuthenticated(false);
                }
            })
            .catch(() => setIsAuthenticated(false));
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return;

        socketRef.current = io("http://localhost:3000", {
            transports: ["websocket"],
            withCredentials: true
        });

        socketRef.current.on("connect_error", (err) => {
            console.error(err.message);
            setIsAuthenticated(false);
        });

        socketRef.current.on("connect", () => {
            socket.emit("set_online", user);
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, [isAuthenticated]);

    useEffect(() => {

        socket.on("new_massage", (newMessage) => {
            createMessage((message) => [...message, newMessage]);
        });

        socket.on("delete_massage_confirm", (deletedMessage) => {
            createMessage((prevMessages) => prevMessages.filter(msg => msg.key !== deletedMessage.key));
        });

        return () => {
            socket.off("new_massage");
            socket.off("delete_massage_confirm");
        };
    }, []);


    const [onlineUsers, setOnlineUsers] = useState([]);

    useEffect(() => {
        const loadOnlineUsers = async () => {
            try {
                const res = await fetch('http://localhost:3000/api/users/online', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (res.ok) {
                    const users = await res.json();

                    setOnlineUsers(users) //Array.isArray(users) ? users : []);

                    console.log(users);

                } else {
                    setOnlineUsers([]);
                }
            } catch (error) {
                console.error(error);
                setOnlineUsers([]);
            }
        };

        loadOnlineUsers();

        const handleStatusChange = (user) => {
            setOnlineUsers(prev => {

                if (prev.includes(user)) {
                    return prev.filter(el => el !== user);
                } else {
                    return [...prev, user];
                }
            });
        };

        socket.on('user_status_changed', handleStatusChange);

        return () => {
            socket.off('user_status_changed', handleStatusChange);
        };
    }, []);

    const onLoginSuccess = () => {
        setIsAuthenticated(true);
    };

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
        view(false)
    }

    const [privateRooms, setPrivateRooms] = useState([])
    async function fetching(currentUser) {
        const response = await fetch(`http://localhost:3000/api/rooms?user=${currentUser}`)
        const rooms = await response.json()

        const privateRooms = rooms.filter((room) => room.type === "private")

        const updatedList = rooms.map((room) => {
            if (room.type === "private" && room.name.includes(currentUser)) {
                return {
                    ...room,
                    mainName: room.name,
                    name: room.name.split(" ").filter((word) => word !== currentUser && word !== "-")[0]
                };
            }
            return room;
        });
        setPrivateRooms(privateRooms)
        setArr(updatedList)
        console.log(privateRooms)
    }

    const inputRef = useRef();
    const inputFind = useRef();

    function optionsHendler(option) {
        if (option === "delete") {
            const updatedMessage = message.filter((mes) => mes.key !== selectedMessage.key)
            createMessage(updatedMessage)
            const mesToDel = {
                text: selectedMessage.text,
                key: selectedMessage.key,
                user: user,
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
            addUser(usersList[0].user)
            view(true)
            console.log(usersList[0].user)
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
            path: serverUrl,
            key: v1(),
            user: user,
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
                user: user,
                room: room,
                type: "messages"
            }

            socket.emit("new_massage", mes);
            inputRef.current.value = ""
        }
    }

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            sendMessage()
        }
    };

    const fileOpen = (filePath) => {
        if (!filePath) return;
        document.title = `OPEN_FILE:${filePath}`;
        console.log("React: Отправили путь через заголовок:", filePath);
    };

    const inputName = useRef();
    const inputEmail = useRef();
    const inputPassword = useRef();

    const logStatTrue = () => {
        logStatChange(true)
    }

    const logStatFalse = () => {
        logStatChange(false)
    }

    const [formData, setFormData] = useState({ name: '', surname: '', email: '', password: '' });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value })
    };

    const [formLog, setFormLog] = useState({ email: '', password: '' });
    const handleLog = (e) => {
        const { name, value } = e.target;
        setFormLog({ ...formLog, [name]: value })
    };

    const registration = async () => {

        const response = await fetch('http://localhost:3000/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        inputName.current.value = ""
        inputEmail.current.value = ""
        inputPassword.current.value = ""
        logStatChange(true)
    };

    const logIn = async () => {

        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formLog),
            credentials: 'include'
        });
        const data = await response.json();
        console.log(data)
        inputEmail.current.value = ""
        inputPassword.current.value = ""

        window.location.reload();
    }

    async function findUser() {
        const userToFind = inputFind.current.value.trim()
        const fff = await fetch(`http://localhost:3000/api/users?name=${userToFind}`)
        const data = await fff.json()
        console.log(data)
        socket.emit("new_room", [data.name, user]);
    }

    async function createRoom(url) {
        if (window.require) {
            window.open(
                'http://localhost:5173/creatingMainChat.htm',
                '_blank',
                'width=800,height=600,frame=true'
            );
        } else {
            console.warn("Запущено в обычном браузере");
        }
    };

    const ulStyle = { height: "100%", padding: 0 }
    const messageStyle = { backgroundColor: '#f5600a', listStyleType: 'none', padding: '10px', width: 'max-content', display: 'inline-block', borderRadius: '10px' };
    if (isAuthenticated === false && logStat === false) {
        return (
            <>
                <h1>registration</h1>
                <h2>Name</h2>
                <input name="name" ref={inputName} type={"text"} className="input" onChange={handleChange} />
                <h2>Email</h2>
                <input name="email" ref={inputEmail} type={"text"} className="input" onChange={handleChange} />
                <h2>Password</h2>
                <input name="password" ref={inputPassword} type={"text"} className="input" onChange={handleChange} />

                <button onClick={registration}>Submit</button>
                <button onClick={logStatTrue}>login</button>
                <button onClick={() => createRoom()}>create</button>
            </>
        )
    } else if (isAuthenticated === false && logStat) {
        return (
            <>
                <h1>login</h1>

                <h2>Email</h2>
                <input name="email" ref={inputEmail} type={"text"} className="input" onChange={handleLog} />
                <h2>Password</h2>
                <input name="password" ref={inputPassword} type={"text"} className="input" onChange={handleLog} />

                <button onClick={logIn}>Submit</button>
                <button onClick={logStatFalse}>registration</button>
            </>
        )
    } else if (isAuthenticated) {
        return (
            <>
                <button onClick={() => createRoom()}>create</button>
                <input ref={inputFind}></input> <button onClick={() => findUser()}>Find</button>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <ul style={{ marginLeft: '10px', listStyleType: 'none', margin: 0, padding: 0 }}>
                        {arr.map((item, index) => (
                            <li
                                onClick={() => joiningRoom(item)}
                                key={index}
                                className="hover-li"
                            >
                                {JSON.stringify(item.name)} {item.type === 'private' && (
                                    onlineUsers.includes(item.otherUserName)
                                        ? 'online'
                                        : 'offline'
                                )}
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
                            {users.map((number, index) => (
                                <span
                                    key={index}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectMessage(number);
                                    }}
                                >
                                    <li key={index}>{number}</li>

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
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <App />
);

//npm run dev