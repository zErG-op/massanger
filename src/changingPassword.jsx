import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {

    const [errorOldPassword, setErrorOldPassword] = useState({});
    const [errorNewPassword, setErrorNewPassword] = useState({});

    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    const { user } = params;

    const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' });

    const changePassword = async () => {
        if (!passwordForm.oldPassword || !passwordForm.newPassword) {

            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/users/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    user: user,
                    oldPassword: passwordForm.oldPassword,
                    newPassword: passwordForm.newPassword
                })
            });

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error(`Сервер вернул не JSON (Статус: ${response.status})`);
            }

            const data = await response.json();

            if (data.success) {
                window.close();
            } else {
                data.password === "old" ?
                    setErrorOldPassword({
                        name: data.message
                    }) : setErrorNewPassword({
                        name: data.message
                    })
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Password change</h2>


                <div className="input-group">
                    <label>Old password</label>
                    <input
                        type="password"
                        value={passwordForm.oldPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                        placeholder="Enter current password"
                    />
                    {errorOldPassword.name && <span className="input-error-message">{errorOldPassword.name}</span>}
                </div>

                <div className="input-group">
                    <label>New password</label>
                    <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        placeholder="Enter new password"
                    />
                    {errorNewPassword.name && <span className="input-error-message">{errorNewPassword.name}</span>}
                </div>

                <div className="auth-actions">
                    <button className="btn btn-primary" onClick={changePassword}>
                        Save
                    </button>
                    <button className="btn btn-secondary" onClick={() => window.close()}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);