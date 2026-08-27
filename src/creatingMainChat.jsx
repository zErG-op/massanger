import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
    const [user, setUser] = useState(null);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        fetch("http://localhost:3000/api/auth/me", { method: 'GET', credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setUser(data.user);
            });
    }, []);

    const [avatarFile, setAvatarFile] = useState(null);

    const inputRef = useRef();
    const fileInputRef = useRef();

    const uploadAvatar = async (avatarFile, username) => {
        if (!avatarFile || !username) return null;

        const formData = new FormData();
        formData.append('avatar', avatarFile);
        formData.append('name', username);

        try {
            const response = await fetch('http://localhost:3000/upload-room', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                return result.avatar;
            } else {
                return null;
            }
        } catch (error) {
            console.error(error);
            return null;
        }
    };

    async function send() {
        if (!inputRef.current || inputRef.current.value.trim().length <= 1) {
            setErrors({ name: "Room name is empty" });
            return;
        }

        let avatarPath = null;
        if (avatarFile) {
            avatarPath = await uploadAvatar(avatarFile, user);
        }

        const response = await fetch('http://localhost:3000/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                text: inputRef.current.value.trim(),
                type: "main",
                avatar: avatarPath
            })
        });

        const data = await response.json();

        if (data.success) {
            window.electron.closeWindow()
        } else {
            setErrors({ name: data.message });
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
                            placeholder="Enter the room name..."
                            onKeyDown={(e) => e.key === 'Enter' && send()}
                            className="room-input"
                        />
                        {errors.name && <span className="input-error-message">{errors.name}</span>}
                        <label>Choose the avatar</label>

                        <label htmlFor="avatar-upload" className="custom-file-upload">
                            <span>{avatarFile ? '📸 Change avatar' : '📁 Upload avatar'}</span>
                        </label>


                        <input
                            id="avatar-upload"
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={(e) => setAvatarFile(e.target.files[0])}
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
