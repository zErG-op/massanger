import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {

    async function entering() {

        let rooms = await fetch("/api/rooms", {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            },
            query: JSON.stringify({ name: name })
        })

        let data = await rooms.json()
        console.log("server response:", data)
    }
    entering()
    console.log('Компонент отрисовался');
    return (
        <>
            <ul>
                {data.map((rooms) => <li key={rooms}>{rooms}</li>)}
            </ul>
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