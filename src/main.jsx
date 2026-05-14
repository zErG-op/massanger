import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f0f2f5', height: '100vh' }}>
            <h1>Привет из React внутри Electron! 🚀</h1>
            <p>Если вы видите этот текст, всё настроено правильно.</p>
        </div>
    );
}

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);