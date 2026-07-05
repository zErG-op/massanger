const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createMainWindow() {
    const mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            preload: path.join(__dirname, 'public/index.html'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadURL('http://localhost:5173');
}

mainWindow.webContents.openDevTools();

app.whenReady().then(() => {
    createMainWindow();

    ipcMain.on('open-new-window', (event, arg) => {
        const newWindow = new BrowserWindow({
            width: arg.width || 800,
            height: arg.height || 600,
        });
        newWindow.loadURL('http://localhost:5173/creatingMainChat');
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});