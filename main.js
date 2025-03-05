const { app, BrowserWindow, systemPreferences } = require("electron/main");
const path = require("node:path");

// Check camera permission on macOS
const checkCameraPermission = async () => {
  if (process.platform === "darwin") {
    try {
      // Request camera permission on macOS
      const status = await systemPreferences.askForMediaAccess("camera");
      console.log("Camera permission status:", status);
      return status;
    } catch (error) {
      console.error("Error requesting camera permission:", error);
      return false;
    }
  }
  return true; // Not macOS, so no need to check
};

const createWindow = () => {
  // Set up macOS-specific settings
  const isMac = process.platform === "darwin";

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
    },
    // macOS specific settings
    titleBarStyle: isMac ? "hiddenInset" : "default", // Gives a more native look on macOS
    trafficLightPosition: { x: 20, y: 20 }, // Position the traffic lights properly
    vibrancy: isMac ? "under-window" : null, // Add vibrancy effect on macOS
    visualEffectState: isMac ? "active" : null, // Ensure visual effects are active
    backgroundColor: isMac ? "#00ffffff" : "#fff", // Transparent background for vibrancy
    roundedCorners: isMac, // Use native rounded corners on macOS
  });

  // Open the DevTools only in development mode
  if (!app.isPackaged) {
    win.webContents.openDevTools();
    console.log("Development mode: DevTools opened");
  }

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

app.whenReady().then(async () => {
  // Request camera permission first
  await checkCameraPermission();

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
