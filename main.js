const { app, BrowserWindow } = require("electron/main");
const path = require("node:path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
    },
  });

  // Open the DevTools by default
  win.webContents.openDevTools();

  // Set Content-Security-Policy header
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' https: wss: data: mediastream: blob:; " +
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://tfhub.dev; " +
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
            "connect-src 'self' https: wss: blob: data: mediastream:;",
        ],
      },
    });
  });

  win.loadFile("index.html");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
