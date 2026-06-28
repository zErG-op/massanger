//#region main.js
var { app, BrowserWindow, shell, ipcMain } = require("electron");
var path = require("path");
function createWindow() {
	const win = new BrowserWindow({
		width: 900,
		height: 700,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true
		}
	});
	if (process.env.VITE_DEV_SERVER_URL) {
		win.loadURL(process.env.VITE_DEV_SERVER_URL);
		win.webContents.openDevTools();
	} else win.loadFile(path.join(__dirname, "public/index.html"));
	win.on("page-title-updated", (event, title) => {
		if (title.startsWith("OPEN_FILE:")) {
			event.preventDefault();
			const filePath = title.replace("OPEN_FILE:", "");
			console.log("===> Main.js получил реальный путь:", filePath);
			if (filePath) shell.openPath(filePath).catch((err) => console.log("Ошибка открытия:", err));
		}
	});
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
//#endregion
