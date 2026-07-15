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
    const [users, setUser] = useState(null);
    const [viewed, view] = useState(false);
    const [files, setFiles] = useState(null);
    const [add, fileAdded] = useState("text");
    const [message, createMessage] = useState([]);
    const [selectedMessage, selectMessage] = useState(null)
    const [selectedUser, selectUser] = useState(null)
    const [option, optionChanger] = useState(null)
    const [logStat, logStatChange] = useState(false)
    const socketRef = useRef(null);
    const [addInput, addUserInput] = useState(false)

    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const [user, setCurrentUser] = useState(null);
    useEffect(() => {
        fetch("http://localhost:3000/api/auth/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.authorized) {
                    setIsAuthenticated(true);
                    setCurrentUser(data.user)
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

        socket.on("newRoom_added", (newRoom) => {
            setArr((arr) => [...arr, newRoom]);
            fetching(newRoom.user[1])
        });

        socket.on("user_leaved", (leavedUser) => {
            setArr((prevMessages) => prevMessages.filter(msg => msg !== leavedUser[0].name));
            setUser((prevMessages) => prevMessages.filter(msg => msg !== leavedUser[1]));
            accept(false)
        });

        socket.on("user_added", (newUser) => {
            setUser((users) => [...users, newUser]);
        });

        socket.on("room_created", (newRoom) => {
            setArr((arr) => [...arr, newRoom]);
        });

        socket.on("delete_massage_confirm", (deletedMessage) => {
            createMessage((prevMessages) => prevMessages.filter(msg => msg.key !== deletedMessage.key));
        });

        socket.on("delete_user_confirm", (deletedUser) => {
            setUser((prevUsers) => prevUsers.filter(user => user !== deletedUser));
        });

        socket.on("new_massage", (newMessage) => {
            createMessage((message) => [...message, newMessage]);
        });

        return () => {
            socket.off("newRoom_added");
            socket.off("user_leaved");
            socket.off("user_added");
            socket.off("room_created");
            socket.off("new_massage");
            socket.off("delete_massage_confirm");
            socket.off("delete_user_confirm");
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
        const url = `http://localhost:3000/api/massages?room=${room.name}`;
        const fff = await fetch(`http://localhost:3000/api/massages?room=${room.name}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        })
        const messagesList = await fff.json()
        createMessage([])
        createMessage(messagesList);
        view(false)
    }

    const [privateRooms, setPrivateRooms] = useState([])
    async function fetching(currentUser) {
        const response = await fetch(`http://localhost:3000/api/rooms?user=${currentUser}`)
        const rooms = await response.json()

        const privateRooms = rooms.filter((room) => room.type === "private")

        const updatedList = rooms.map((room) => {
            if (room.type === "private" && room.user.includes(currentUser)) {
                return {
                    ...room,
                    mainName: room.name,
                    name: room.user.filter((el) => el !== currentUser)[0]
                };
            }
            return room;
        });
        setPrivateRooms(privateRooms)
        setArr(updatedList)
    }

    const inputRef = useRef();
    const inputFind = useRef();
    const inputAdd = useRef();

    function optionsHendler(option) {
        if (selectedMessage) {
            socket.emit("delete_message", selectedMessage.key);
            createMessage((prevMessages) => prevMessages.filter(msg => msg.key !== selectedMessage.key));
        } else if (selectedUser) {
            socket.emit("delete_user", [room, selectedUser]);
            setUser((prevUsers) => prevUsers.filter(user => user !== selectedUser));
        }
    }

    async function viewMembers() {
        if (viewed) {
            view(false)
        } else {
            // setUser(null)
            const url = `http://localhost:3000/api/rooms/user?name=${room.name}`;
            const fff = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            })
            const roomInfo = await fff.json()
            setUser(roomInfo.user)
            view(true)
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
                user: user,
                room: room.name,
                type: "text",
                key: v1()
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
        if (userToFind !== user) {
            socket.emit("new_room", [userToFind, user]);
        }
        inputFind.current.value = ""
    }

    async function createRoom() {
        if (window.require) {
            window.open(
                'http://localhost:5173/creatingMainChat.html',
                '_blank',
                'width=800,height=600,frame=true'
            );
        } else {
            console.warn("Запущено в обычном браузере");
        }
    };

    function addUser() {

        (addInput) ? addUserInput(false) : addUserInput(true)

        if (inputAdd.current.value.trim().length > 1) {
            socket.emit("new_user", [room, inputAdd.current.value, user])
            inputAdd.current.value = ""
        };

    }

    function leave(user) {
        socket.emit("leave", [room, user])
    }

    if (isAuthenticated === false && logStat === false) {
        return (
            <>
                <h2>Регистрация</h2>
                <div className="input-group">
                    <label>Имя</label>
                    <input name="name" ref={inputName} type="text" onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="input-group">
                    <label>Email</label>
                    <input name="email" ref={inputEmail} type="email" onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="input-group">
                    <label>Пароль</label>
                    <input name="password" ref={inputPassword} type="password" onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                </div>
                <button className="btn btn-primary" onClick={registration}>Создать аккаунт</button>
                <p className="auth-switch">Уже есть аккаунт? <span onClick={() => logStatChange(true)}>Войти</span></p>
            </>
        )
    } else if (isAuthenticated === false && logStat) {
        return (
            <>
                <h2>login</h2>
                <div className="input-group">
                    <label>Email</label>
                    <input name="email" ref={inputEmail} type="email" onChange={handleLog} />
                </div>
                <div className="input-group">
                    <label>Password</label>
                    <input name="password" ref={inputPassword} type="password" onChange={handleLog} />
                    <button className="btn btn-primary" onClick={logIn}>Submit</button>
                    <button className="btn btn-primary" onClick={logStatFalse}>registration</button>
                </div>
            </>
        )
    } else if (isAuthenticated) {
        return (
            <div className="app-layout" onDragOver={(e) => e.preventDefault()} onDrop={uploader}>

                <div className="sidebar-actions">
                    <button onClick={createRoom} className="action-btn" title="Create room">+</button>
                </div>

                <div className="sidebar-chats">
                    <div className="search-box">
                        <input ref={inputFind} placeholder="Find chat..." />
                        <button onClick={findUser} className="btn-search">🔍</button>
                    </div>
                    <ul className="chat-list">
                        {arr.map((item, index) => (
                            <li key={index} onClick={() => joiningRoom(item)} className={`chat-item ${room?.name === item.name ? 'active' : 'offline'}`}>
                                <span className="chat-name">{item.name}</span>
                                {item.type === 'private' && (
                                    <span className={`status-dot ${onlineUsers.includes(item.otherUserName) ? 'online' : 'offline'}`} />
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="chat-area">
                    {joined ? (
                        <>
                            {room.type === "main" ? (
                                <div className="chat-header">
                                    <h3>{room?.name}</h3>
                                    <button onClick={viewMembers} className="btn-icon">👥 Members</button>
                                </div>
                            ) : (
                                <div className="chat-header">
                                    <h3>{room?.name}</h3>
                                </div>
                            )}

                            <div className="messages-container">
                                {message.map((msg) => (
                                    <div key={msg.key} className={`message-wrapper ${msg.user === user ? 'own' : ''}`} onContextMenu={(e) => { e.preventDefault(); selectMessage(msg); }}>
                                        <div className="message-box">
                                            <div className="message-meta">{msg.user}</div>
                                            {msg.type === 'text' && <p className="message-text">{msg.text}</p>}
                                            {msg.type === 'jpeg' && <img src={msg.path} className="message-media" alt="uploaded" />}
                                            {msg.type === 'mp4' && <ReactPlayer url={msg.path} controls width="100%" height="auto" />}

                                            {selectedMessage === msg && (room.admin?.includes(user) || msg.user === user) && (
                                                <select className="message-actions" onChange={(e) => optionsHendler(e.target.value)}>
                                                    <option value="">...</option>
                                                    <option value="delete">Delete</option>
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="chat-footer">
                                <button onClick={fileAdder} className="btn-icon">📎</button>
                                <input
                                    ref={inputRef}
                                    type={add}
                                    placeholder="Write a message..."
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    onChange={add === 'file' ? uploader : undefined}
                                />
                                <button onClick={sendMessage} className="btn-send">Send</button>
                            </div>
                        </>
                    ) : (
                        <div className="chat-empty">
                            <p>Choose the room</p>
                        </div>
                    )}
                </div>

                {viewed && users ? (
                    <div className="sidebar-members">
                        <h4>Members</h4>

                        <ul className="members-list">
                            {users.map((member, index) => (
                                <li
                                    key={`member-item-${member}-${index}`}
                                    className={`member-item ${selectedMessage === member ? 'selected' : ''}`}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        selectUser(member);
                                    }}
                                >
                                    <div className="member-info">
                                        <span className="member-name">@{member}</span>
                                        {room?.admin?.includes(member) && <span className="badge-admin">admin</span>}
                                    </div>

                                    {selectedUser === member && room?.admin?.includes(user) && (
                                        <div className="member-actions-wrapper">
                                            <select
                                                className="select-minimal"
                                                onChange={(e) => optionsHendler(e.target.value)}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>...</option>
                                                <option value="delete">Удалить</option>
                                            </select>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>

                        <div className="members-controls">
                            <button className="btn btn-primary" onClick={() => addUser()}>addUser</button>
                            <button className="btn btn-danger" onClick={() => leave(user)}>leave</button>
                        </div>

                        {addInput ? (
                            <div className="search-box">
                                <input
                                    placeholder="Write a user..."
                                    onKeyDown={(e) => e.key === 'Enter' && addUser()}
                                    ref={inputAdd}
                                    type="text"
                                />
                            </div>
                        ) : (
                            <div></div>
                        )}
                    </div>
                ) : null}
            </div>
        );
    }
}
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <App />
);

//npm run dev