import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useEffect, useRef } from 'react';
import { io } from "socket.io-client";
import { v1 } from "uuid";
import ReactPlayer from 'react-player';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import './style.css';

const socket = io("http://localhost:3000", {
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: true,
    reconnection: true
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
    const [selectedMessage, selectMessage] = useState(null);
    const [selectedUser, selectUser] = useState(null);
    const [logStat, logStatChange] = useState(false);
    const [codeCheck, setCodeCheck] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [addInput, addUserInput] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const [user, setCurrentUser] = useState(null);

    async function checkAuthenticated() {
        fetch("http://localhost:3000/api/auth/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.authorized) {
                    setIsAuthenticated(true);
                    setCurrentUser(data.user);
                    fetchRooms(data.user);
                    socket.emit("set_online", data.user);
                } else {
                    setIsAuthenticated(false);
                }
            })
            .catch(() => setIsAuthenticated(false));
    }

    useEffect(() => {
        checkAuthenticated()
    }, []);

    const userRef = useRef(null);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const [findError, setFindError] = useState({})

    useEffect(() => {
        socket.on("room_updated", ({ oldName, newName, avatar }) => {

            setArr(prev => prev.map(room => {
                if (room.name === oldName) {
                    return {
                        ...room,
                        name: newName,
                        avatar: avatar
                    };
                }
                return room;
            }));

            setRoom(prev => {
                if (prev?.name === oldName) {
                    return {
                        ...prev,
                        name: newName,
                        avatar: avatar
                    };
                }
                return prev;
            });
        });
        socket.on("room_adding", ({ message }) => {
            setFindError({
                nameToAdd: message
            })
        })

        socket.on("room_error", ({ message }) => {
            setFindError({
                nameToSearch: message
            })
        })

        socket.on("user_blocked", ({ roomName, user }) => {
            setRoom(prev => {
                if (!prev || prev.name !== roomName) return prev;
                const currentBlocked = prev.blocked || [];
                if (currentBlocked.includes(user)) return prev;
                return { ...prev, blocked: [...currentBlocked, user] };
            });
        });

        socket.on("user_unblocked", ({ roomName, user }) => {
            setRoom(prev => {
                if (!prev || prev.name !== roomName) return prev;
                return { ...prev, blocked: (prev.blocked || []).filter(u => u !== user) };
            });
        });

        socket.on("room_change_confirm", (user) => {
            fetchRooms(user);
        });

        socket.on("newRoom_added", (newRoom) => {
            setArr((arr) => [...arr, newRoom]);
        });

        socket.on("user_leaved", ({ roomName, userName }) => {

            if (userName === userRef.current) {

                setArr(prev => prev.filter(r => r.name !== roomName));

                setRoom(prevRoom => {
                    if (prevRoom?.name === roomName) {
                        accept(false);
                        createMessage([]);
                        view(false);
                        return null;
                    }
                    return prevRoom;
                });
                setRoom(prevRoom => {
                    if (prevRoom?.name === roomName) {
                        setUser(prevUsers => (prevUsers || []).filter(u => {
                            const nameToCheck = typeof u === 'object' ? u.name : u;
                            return nameToCheck !== userName;
                        }));
                    }
                    return prevRoom;
                });
            }
        });

        socket.on("user_added", ({ roomName, user }) => {
            setUser(prev => [...(prev || []), user.name]);
            addUserInput(false)
        });

        socket.on("added_to_room", ({ room }) => {
            setArr(prev => [...prev, room]);
        });

        socket.on("room_created", (newRoom) => {
            setArr((arr) => [...arr, newRoom]);
        });

        socket.on("delete_massage_confirm", (deletedMessage) => {
            createMessage((prevMessages) => prevMessages.filter(msg => msg.key !== deletedMessage.key));
        });

        socket.on("removed_from_room", ({ roomName }) => {
            setArr(prev => prev.filter(room => room.name !== roomName));

            setRoom(prev => {
                if (prev?.name === roomName) {
                    accept(false);
                    createMessage([]);
                    view(false);
                    return null;
                }
                return prev;
            });
        });

        socket.on("new_massage", (newMessage) => {
            createMessage((message) => [...message, newMessage]);
        });

        socket.on("user_updated", ({ oldName, newName, avatar }) => {
            if (user === oldName) setCurrentUser(newName);

            setArr(prev => prev.map(r => {
                const updatedUsers = r.user?.map(u => {
                    if (u.name === oldName) { return { ...u, name: newName, avatar } };
                    return u;
                });
                return { ...r, user: updatedUsers };
            }));
        });

        socket.on("delete_user_confirm", (key) => {

            const roomName = key[0].name;
            const userNameToDelete = key[1];


            setRoom(prevRoom => {
                if (prevRoom?.name === roomName) {
                    setUser(prevUsers => (prevUsers || []).filter(u => {
                        const nameToCheck = typeof u === 'object' ? u.name : u;
                        return nameToCheck !== userNameToDelete;
                    }));
                }
                return prevRoom;
            });
        });

        return () => {
            socket.off("room_updated");
            socket.off("room_adding");
            socket.off("room_error");
            socket.off("user_blocked");
            socket.off("user_unblocked");
            socket.off("user_updated");
            socket.off("room_change_confirm");
            socket.off("newRoom_added");
            socket.off("user_leaved");
            socket.off("user_added");
            socket.off("room_created");
            socket.off("new_massage");
            socket.off("delete_massage_confirm");
            socket.off("removed_from_room");
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
                    setOnlineUsers(users)
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

    async function fetchRooms(currentUser) {
        console.log("currentUser:", currentUser)
        try {
            const response = await fetch(`http://localhost:3000/api/rooms?user=${encodeURIComponent(currentUser)}`);
            const roomS = await response.json();

            setArr(roomS);

        } catch (error) {
            console.error(error);
        }
    }

    const isBlocked = room?.blocked?.includes(user);

    const joiningRoom = async (room) => {
        view(false)
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
    }

    const [privateRooms, setPrivateRooms] = useState([])

    const inputRef = useRef();
    const inputFind = useRef();
    const inputAdd = useRef();
    const fileInputRef = useRef(null);

    function optionsHendler(option, selectedUser) {

        if (option === "DeleteMessage") {
            socket.emit("delete_message", selectedMessage);
            createMessage((prevMessages) => prevMessages.filter(msg => msg.key !== selectedMessage.key));
            selectMessage(null)
        } else if ("disable") {
            selectMessage(null)
        }

        if (option === "Delete") {
            socket.emit("delete_user", [room, selectedUser]);
            setUser((prevUsers) => prevUsers.filter(user => user !== selectedUser));
            selectUser(null)
        } else if (option === "Block") {
            socket.emit("block_user", {
                roomName: room.name,
                userToBlock: selectedUser,
                adminName: user
            });
            selectUser(null)
        } else if (option === "Unblock") {
            socket.emit("unblock_user", {
                roomName: room.name,
                userToBlock: selectedUser,
                adminName: user
            });
            selectUser(null)
        } else if (option === "DisableUserOption") {
            selectUser(null)
        }
    }

    function blockPrivate() {
        if (!room || room.type !== "private") return;

        const otherUser = room.user?.find(u => {
            const name = typeof u === "object" ? u.name : u;
            return name !== user;
        });

        const userToBlock = typeof otherUser === "object" ? otherUser.name : otherUser;

        if (!userToBlock) return;

        socket.emit("block_user", {
            roomName: room.name,
            userToBlock,
            adminName: user
        });
    }

    async function viewMembers() {
        if (viewed) {
            view(false)
        } else {
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

    const handleSend = (e) => {
        if (add === 'file') {
            uploader(e);
        } else {
            sendMessage();
        }
    };

    function fileAdder() {
        fileAdded("file");

        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
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
            }
        }

        let fileType = "file";

        if (e.type.startsWith("image/")) {
            fileType = "jpeg";
        } else if (e.type.startsWith("video/")) {
            fileType = "mp4";
        } else {
            fileType = "file";
        }

        let roomName

        if (room.mainName) { roomName = room.mainName; } else { roomName = room.name; }

        const file = {
            path: serverUrl,
            key: v1(),
            user: user,
            room: roomName,
            type: fileType,
            text: e.name
        };

        socket.emit("new_massage", file);
    };

    const uploader = (e) => {
        e.preventDefault();
        const selectedFiles = e.dataTransfer?.files || e.target?.files;

        if (!selectedFiles || selectedFiles.length === 0) return

        const targetFile = selectedFiles[0];

        setFiles(targetFile);
        sendFiles(targetFile);

        e.target.value = "";
        fileAdded("text");
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };


    function sendMessage() {
        if (inputRef.current.value.trim().length > 1) {
            let roomName
            if (room.mainName) { roomName = room.mainName; } else { roomName = room.name; }
            const mes = {
                text: inputRef.current.value.trim(),
                user: user,
                room: roomName,
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

    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value })
    };

    const [formLog, setFormLog] = useState({ email: '', password: '' });
    const handleLog = (e) => {
        const { name, value } = e.target;
        setFormLog({ ...formLog, [name]: value })
    };


    const [errors, setErrors] = useState({});

    const registration = async (e) => {
        if (e) e.preventDefault();

        let localErrors = {};

        if (!formData.name.trim()) localErrors.name = "Please, enter your name";
        if (!formData.email.trim()) localErrors.email = "Email required to complete";
        if (!formData.password.trim()) localErrors.password = "Password cannot consist of spaces only";

        if (Object.keys(localErrors).length > 0) {
            setErrors(localErrors);
            return;
        }

        const response = await fetch('http://localhost:3000/api/verification/code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });
        const info = await response.json();

        if (response.ok) {
            setCodeCheck(true);
        } else {
            info.field === "email" ? setErrors(prev => ({ ...prev, email: info.message })) : setErrors(prev => ({ ...prev, name: info.message }))
        }

    };


    const handleVerifyCode = async () => {

        if (!verificationCode.trim()) {
            setErrors({ code: "Enter the code" });
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/verification/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    name: formData.name,
                    code: verificationCode.trim()
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setCodeCheck(false);
                checkAuthenticated()
            } else {
                setErrors({ code: data.message });
            }
        } catch (error) {
            console.error("error");
        }
    };

    const logIn = async (e) => {
        if (e) e.preventDefault();

        let localErrors = {};

        if (!formLog.email.trim()) localErrors.logEmail = "Enter your email";
        if (!formLog.password.trim()) localErrors.logPassword = "Enter your password";

        if (Object.keys(localErrors).length > 0) {
            setErrors(localErrors);
            return;
        }

        setErrors({});

        const req = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formLog),
            credentials: 'include'
        });
        const response = await req.json()

        if (response.message) {
            window.location.reload();
        } else {
            setErrors(prev => ({ ...prev, logPassword: response.message }) || "Something went wrong");
        }
    };

    async function findUser() {
        const userToFind = inputFind.current.value.trim()
        if (userToFind !== user) { socket.emit("new_room", [userToFind, user]) };
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
            console.warn("err");
        }
    };

    async function viewMyProfile() {
        if (window.require) {
            window.open(
                'http://localhost:5173/myProfile.html',
                '_blank',
                'width=800,height=600,frame=true'
            );
        } else {
            console.warn("err");
        }
    };

    async function viewTheRoom() {
        if (window.require) {

            const childWindow = window.open(
                `http://localhost:5173/changingRoomSettings.html?room=${room.name}`,
                '_blank',
                'width=800,height=600,frame=true,nodeIntegration=no,contextIsolation=yes'
            );
        } else {
            console.warn("err");
        }
    };

    function addUserField() { (addInput) ? addUserInput(false) : addUserInput(true) }

    function addUser() {

        const userNameToAdd = inputAdd.current?.value.trim();

        if (!userNameToAdd || userNameToAdd.length < 1) return;

        if (userNameToAdd === user) return;

        socket.emit("new_user", [room, userNameToAdd, user]);

    }

    function leave(user) {
        socket.emit("leave", [room, user])
    }

    function roomName(room) {
        return room[1] === "private" ? room[0].map(item => item.name).filter((nameStr) => nameStr !== userRef.current)[0] : room[2];
    }

    function roomAvatar(room) {
        return room.user.filter(item => item.name !== user)[0]?.avatar
    }

    function roomMessageAvatar(room, user) {
        return room.user.filter(item => item.name === user)[0]?.avatar
    }

    function roomAdmin(room) {
        return room[0].admin.map(el => el.name).includes(room[1])
    }

    function isInclude(room) {
        return room.user.filter((el) => el.name !== user)[0]?.name
    }




    const [timer, setTimer] = useState(60);

    useEffect(() => {

        if (!codeCheck || timer <= 0) return;

        const intervalId = setInterval(() => {
            setTimer(prev => prev - 1);
        }, 1000);

        return () => clearInterval(intervalId);
    }, [timer, codeCheck]);

    const handleResendCode = () => {
        registration();
        setTimer(60);
    };

    if (isAuthenticated === false && logStat === false && codeCheck) {
        return (
            <div className="auth-container">
                <form className="auth-card" onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
                    <h2>Verification</h2>
                    <p style={{ fontSize: '13px', opacity: 0.8, textAlign: 'center', marginBottom: '20px' }}>
                        The code is sent on your email
                    </p>

                    <div className="input-group">
                        <label>The code from letter</label>
                        <input
                            type="text"
                            maxLength={6}
                            value={verificationCode}
                            placeholder="Enter the 6-digit code"
                            style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: 'bold' }}
                            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                            onChange={(e) => {
                                setVerificationCode(e.target.value);
                                setErrors(prev => ({ ...prev, code: "" }));
                            }}
                        />
                        {errors.code && <span className="input-error-message">{errors.code}</span>}
                    </div>

                    <div className="auth-actions">
                        <button className="btn btn-primary" type="submit" >
                            Confirm
                        </button>
                    </div>

                    <div className="auth-switch" style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px' }}>
                        Have not received the code?{' '}
                        {timer > 0 ? (
                            <span style={{ opacity: 0.6, fontFamily: 'monospace' }}>
                                Resend in {timer}s
                            </span>
                        ) : (
                            <span
                                onClick={handleResendCode}
                                style={{ cursor: 'pointer', color: '#4f46e5', fontWeight: '500', textDecoration: 'underline' }}
                            >
                                Send again
                            </span>
                        )}
                    </div>
                </form >
            </div>
        );

    }

    else if (isAuthenticated === false && logStat === false) {
        return (
            <div className="auth-container">

                <form className="auth-card" onSubmit={registration}>
                    <h2>Create Account</h2>

                    <div className="input-group">
                        <label>Name</label>
                        <input
                            name="name"
                            ref={inputName}
                            type="text"
                            placeholder="Enter your name..."
                            className={errors.name ? "error-border" : ""}
                            onChange={(e) => {
                                setFormData({ ...formData, name: e.target.value });
                                setErrors(prev => ({ ...prev, name: "" }));
                            }}
                        />
                        {errors.name && <span className="input-error-message">{errors.name}</span>}
                    </div>

                    <div className="input-group">
                        <label>Email</label>
                        <input
                            name="email"
                            ref={inputEmail}
                            type="email"
                            placeholder="Enter your email..."
                            className={errors.email ? "error-border" : ""}
                            onChange={(e) => {
                                setFormData({ ...formData, email: e.target.value });
                                setErrors(prev => ({ ...prev, email: "" }));
                            }}
                        />
                        {errors.email && <span className="input-error-message">{errors.email}</span>}
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <input
                            name="password"
                            ref={inputPassword}
                            type="password"
                            placeholder="••••••••"
                            className={errors.password ? "error-border" : ""}
                            onChange={(e) => {
                                setFormData({ ...formData, password: e.target.value });
                                setErrors(prev => ({ ...prev, password: "" }));
                            }}
                        />
                        {errors.password && <span className="input-error-message">{errors.password}</span>}
                    </div>

                    <button type="submit" className="btn btn-primary">
                        Create account
                    </button>

                    <p className="auth-switch">
                        Already have account? <span onClick={() => { setErrors({}); logStatChange(true); }}>Login</span>
                    </p>
                </form>
            </div>
        );
    }
    else if (isAuthenticated === false && logStat) {
        return (
            <div className="auth-container">
                <form className="auth-card" onSubmit={logIn}>
                    <h2>Login</h2>

                    <div className="input-group">
                        <label>Email</label>
                        <input
                            name="email"
                            ref={inputEmail}
                            type="email"
                            placeholder="Enter your email..."
                            className={errors.logEmail ? "error-border" : ""}
                            onChange={(e) => {
                                handleLog(e);
                                setErrors(prev => ({ ...prev, logEmail: "" }));
                            }}
                        />
                        {errors.logEmail && <span className="input-error-message">{errors.logEmail}</span>}
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <input
                            name="password"
                            ref={inputPassword}
                            type="password"
                            placeholder="••••••••"
                            className={errors.logPassword ? "error-border" : ""}
                            onChange={(e) => {
                                handleLog(e);
                                setErrors(prev => ({ ...prev, logPassword: "" }));
                            }}
                        />
                        {errors.logPassword && <span className="input-error-message">{errors.logPassword}</span>}
                    </div>

                    <div className="auth-actions">
                        <button type="submit" className="btn btn-primary">
                            Login
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => { setErrors({}); logStatFalse(); }}>
                            Registration
                        </button>
                    </div>
                </form>
            </div>
        );

    } else if (isAuthenticated) {
        return (
            <div className="app-layout" onDragOver={(e) => e.preventDefault()} onDrop={uploader}>

                <div className="sidebar-actions">
                    <button onClick={createRoom} className="action-btn" title="Create room">+</button>
                    <button onClick={viewMyProfile} className="action-btn" title="Viewe profile">:</button>
                </div>

                <div className="sidebar-chats">
                    <div className="search-box">
                        <div className="search-input-wrapper">
                            <input
                                ref={inputFind}
                                placeholder="Find chat..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        findUser(e);
                                    }
                                }}
                                onChange={(e) => {
                                    setFindError(prev => ({ ...prev, nameToSearch: "" }));
                                }}

                            />
                            <button onClick={findUser} className="btn-search">🔍</button>
                        </div>
                        {findError.nameToSearch && <span className="input-error-message">{findError.nameToSearch}</span>}
                    </div>
                    <ul className="chat-list">
                        {arr.map((item, index) => (
                            <li key={index} onClick={() => joiningRoom(item)} className={`chat-item ${room?.name === item.name ? 'active' : 'offline'}`}>

                                {item.type === 'private' && (
                                    <>
                                        <span className={`status-dot ${onlineUsers.includes(isInclude(item)) ? 'online' : 'offline'}`} />

                                        <div className="avatar-wrapper" style={{ marginBottom: 0 }}>
                                            <div className="avatar-circle sidebar-avatar">
                                                {roomAvatar(item) ? (
                                                    <img src={roomAvatar(item)} className="room-avatar" alt="uploaded" />
                                                ) : (
                                                    <div className="avatar-placeholder">👤</div>
                                                )}
                                            </div>
                                        </div>

                                    </>

                                )}

                                {item.type === 'main' && (
                                    <>
                                        <span className={`status-dot.main`} />

                                        <div className="avatar-wrapper" style={{ marginBottom: 0 }} >
                                            <div className="avatar-circle sidebar-avatar">
                                                {item.avatar ? (
                                                    <img src={item.avatar} className="room-avatar" alt="uploaded" />
                                                ) : (
                                                    <div className="avatar-placeholder">👤</div>
                                                )}
                                            </div>
                                        </div>

                                    </>

                                )}
                                <span className="chat-name">{roomName([item.user, item.type, item.name])}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="chat-area">
                    {joined ? (
                        <>
                            {room.type === "main" ? (
                                <div className="chat-header">
                                    <h3>{room.name}</h3>
                                    {roomAdmin([room, user]) && <button className="btn-icon" onClick={viewTheRoom}>Room settings</button>}
                                    <button onClick={viewMembers} className="btn-icon">👥 Members</button>
                                </div>
                            ) : (
                                <div className="chat-header">
                                    <h3>{roomName([room.user, room.type, room.name])}</h3>
                                    <button onClick={blockPrivate} className="btn-icon">BLOCK</button>
                                </div>
                            )}

                            <div className="messages-container">
                                {message.map((msg) => (
                                    <div key={msg.key} className={`message-wrapper ${msg.user === user ? 'own' : ''}`} onContextMenu={(e) => { e.preventDefault(); selectMessage(msg); }}>
                                        <div className="message-box">

                                            {
                                                (room.type === "main" ?
                                                    <div className="message-meta">
                                                        {(roomMessageAvatar(room, msg.user) ? (roomMessageAvatar(room, msg.user) && <img src={roomMessageAvatar(room, msg.user)} className="message-avatar" alt="uploaded" />) : "👤")}
                                                        <span className="message-username">{msg.user}</span>
                                                    </div>
                                                    :
                                                    <span className="message-username">{msg.user}</span>)
                                            }

                                            {msg.type === 'text' && <p className="message-text">{msg.text}</p>}
                                            {msg.type === 'jpeg' &&
                                                <PhotoProvider>
                                                    <div className="message-image-container">
                                                        <PhotoView src={msg.path}>
                                                            <img src={msg.path} className="message-media" alt="uploaded" />
                                                        </PhotoView>
                                                    </div>
                                                </PhotoProvider>}
                                            {msg.type === 'mp4' && <ReactPlayer src={msg.path} controls width="100%" height="auto" />}

                                            {selectedMessage === msg && (room.admin?.some(a => a.name === user) || msg.user === user) && (
                                                <select className="message-actions" onChange={(e) => optionsHendler(e.target.value, e.target)} >
                                                    <option value="" disabled>{null}</option>
                                                    <option value="Disable">...</option>
                                                    <option value="DeleteMessage">Delete</option>
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="chat-footer">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={uploader}
                                    disabled={isBlocked}
                                />

                                <button onClick={fileAdder} className="btn-icon">📎</button>

                                <input
                                    ref={inputRef}
                                    type="text"
                                    disabled={isBlocked}
                                    placeholder={isBlocked ? "You are blocked in this room" : "Write a message..."}

                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSend(e);
                                        }
                                    }}
                                />

                                <button onClick={handleSend} className="btn-send">Send</button>
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
                            {users.map((member, index) => {
                                const currentMemberName = member?.name || member;

                                return (
                                    <li
                                        key={`member-item-${currentMemberName}`}
                                        className={`member-item ${selectedMessage === currentMemberName ? 'selected' : ''}`}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            selectUser(currentMemberName);
                                        }}
                                    >
                                        <div className="member-info">

                                            {(roomMessageAvatar(room, currentMemberName) ? (roomMessageAvatar(room, currentMemberName) && <img src={roomMessageAvatar(room, currentMemberName)} className="message-avatar" alt="uploaded" />) : "👤")}
                                            <span className="member-name">@{currentMemberName}</span>

                                            {roomAdmin([room, currentMemberName]) && (
                                                <span className="badge-admin">admin</span>
                                            )}

                                            {room.blocked.includes(currentMemberName) && (
                                                <span className="badge-blocked">blocked</span>
                                            )}

                                        </div>

                                        {selectedUser === currentMemberName && roomAdmin([room, user]) && (selectedUser !== user) && (
                                            <div className="member-actions-wrapper">
                                                <select
                                                    className="select-minimal"
                                                    defaultValue=""
                                                    onChange={(e) => {
                                                        optionsHendler(e.target.value, currentMemberName, e.target);
                                                        e.target.value = "";
                                                    }}
                                                >
                                                    <option value="" disabled>{null}</option>
                                                    <option value="DisableUserOption">...</option>
                                                    <option value="Delete">Delete</option>

                                                    {room.blocked.includes(currentMemberName) ? (
                                                        <option value="Unblock">Unblock</option>
                                                    ) : (
                                                        <option value="Block">Block</option>
                                                    )}
                                                </select>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="members-controls">
                            <button className="btn btn-primary" onClick={() => addUserField()}>addUser</button>
                            <button className="btn btn-danger" onClick={() => leave(user)}>leave</button>
                        </div>

                        {addInput ? (
                            <div className="search-box">
                                <input
                                    placeholder="Write a user..."
                                    onKeyDown={(e) => e.key === 'Enter' && addUser()}
                                    ref={inputAdd}
                                    type="text"
                                    onChange={(e) => setFindError(prev => ({ ...prev, nameToAdd: "" }))}
                                />
                                {findError.nameToAdd && <span className="input-error-message">{findError.nameToAdd}</span>}
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