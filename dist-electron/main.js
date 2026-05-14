//#region main.js
var { app, BrowserWindow } = require("electron");
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
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
//#endregion
