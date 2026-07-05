const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    win.webContents.openDevTools();

    if (process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(__dirname, 'dist/index.html'));
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: 800,
                height: 600,
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    contextIsolation: true,
                    nodeIntegration: false,
                }
            }
        };
    });

    win.on('page-title-updated', (event, title) => {
        if (title.startsWith('OPEN_FILE:')) {
            event.preventDefault();
            const filePath = title.replace('OPEN_FILE:', '');
            console.log('===> Main.js получил реальный путь:', filePath);

            if (filePath && shell) {
                shell.openPath(filePath).catch(err => console.log('Ошибка открытия:', err));
            }
        }
    });
}

app.on('browser-window-created', (event, newWindow) => {
    newWindow.webContents.openDevTools();
});

app.whenReady().then(() => {
    createWindow();

    ipcMain.on('close-current-window', (event) => {
        const currentWin = BrowserWindow.fromWebContents(event.sender);
        if (currentWin) {
            currentWin.close();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
