import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { io } from "socket.io-client";
import './style.css';

const socket = io("http://localhost:3000", {
    transports: ["websocket"],
    withCredentials: true,
});

function App() {

    const [user, setUser] = useState(null);
    const [userChange, setUserChange] = useState('');
    const [avatar, setAvatar] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);

    const avatarInputRef = useRef(null);

    useEffect(() => {
        fetch("http://localhost:3000/api/auth/me", { method: 'GET', credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setUser(data.user);
                setUserChange(data.user);
                setAvatar(data.avatar);
            })
            .catch(err => console.error(err));
    }, []);

    const upload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAvatarFile(file);
            setAvatar(URL.createObjectURL(file));
        }
    };

    const saveProfileChanges = async () => {
        const formData = new FormData();

        if (avatarFile) { formData.append('avatar', avatarFile) };

        formData.append('name', user);
        formData.append('newName', userChange);
        formData.append('type', "user");
        console.log(avatarFile)
        try {
            const response = await fetch('http://localhost:3000/change-avatar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            console.log(data);

            if (data.success) {
                setUser(userChange);
            }

        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card profile-card">
                <h2>Profile Settings</h2>

                <div className="avatar-wrapper">
                    <div className="avatar-circle">
                        {avatar ? (
                            <img src={avatar} alt="Avatar Preview" />
                        ) : (
                            <div className="avatar-placeholder">👤</div>
                        )}
                    </div>

                    <label htmlFor="profile-avatar" className="btn-change-avatar">
                        📸 Change Photo
                    </label>
                    <input
                        id="profile-avatar"
                        type="file"
                        accept="image/*"
                        ref={avatarInputRef}
                        style={{ display: 'none' }}
                        onChange={upload}
                    />
                </div>

                <div className="input-group">
                    <label htmlFor="profile-username">Username</label>
                    <input
                        id="profile-username"
                        type="text"
                        value={userChange || ''}
                        onChange={(e) => setUserChange(e.target.value)}
                        placeholder="Enter your name..."
                        className="room-input"
                    />
                </div>

                <div className="profile-actions">
                    <button className="btn btn-primary" onClick={saveProfileChanges}>
                        Save Changes
                    </button>
                    <button className="btn btn-secondary" onClick={() => {
                        setAvatar(null);
                        setAvatarFile(null);
                    }}>
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);