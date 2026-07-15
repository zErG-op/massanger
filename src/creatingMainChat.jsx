import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { io } from "socket.io-client";
import './style.css';

const socket = io("http://localhost:3000", {
    transports: ["websocket"],
    withCredentials: true,
});

function App() {
    const [user, setUser] = useState(null)
    useEffect(() => {
        fetch("http://localhost:3000/api/auth/me", { method: 'GET', credentials: 'include' }).then(res => res.json())
            .then(data => {
                setUser(data.user)
            })
    })

    const inputRef = useRef();

    async function send() {
        if (inputRef.current && inputRef.current.value.trim().length > 1) {
            const name = {
                text: inputRef.current.value.trim(),
                user: [user],
                admin: [user],
                type: "main"
            };
            socket.emit("create_room", name);
            window.electron.closeWindow();
        }
    }

    return (
        <>
            <div className="auth-container">
                <div className="auth-card">
                    <h2>Create room</h2>

                    <div className="input-group">
                        <label htmlFor="room-name">Name of room</label>
                        <input
                            id="room-name"
                            name="name"
                            ref={inputRef}
                            type="text"
                            placeholder="Enter the room..."
                            onKeyDown={(e) => e.key === 'Enter' && send()}
                        />
                    </div>

                    <button className="btn btn-primary" onClick={send}>
                        Create
                    </button>
                </div>
            </div>
        </>
    );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
