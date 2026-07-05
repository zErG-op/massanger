import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';

function App() {

    const inputRef = useRef();

    async function send() {
        if (inputRef.current && inputRef.current.value.trim().length > 1) {
            const name = {
                text: inputRef.current.value.trim(),
                user: ["user"],
                type: "main"
            };

            const response = await fetch('http://localhost:3000/api/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(name)
            });

            const data = await response.json();

            window.electron.closeWindow();

        }
    }

    return (
        <>
            <h1>Name room</h1>
            <input name="name" ref={inputRef} type="text" className="input" />
            <button onClick={send}>Submit</button>
        </>
    );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
