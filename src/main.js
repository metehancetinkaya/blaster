const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const MobileWebTester = require('./MobileWebTester');
const SetupManager = require('./SetupManager');

let mainWindow;
let tester;
let setupManager;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    setupManager = new SetupManager(mainWindow);
    tester = new MobileWebTester();

    // Check if dependencies are installed
    checkDependencies();
}

async function checkDependencies() {
    try {
        const xcodeResult = await setupManager.checkXcode();
        const androidResult = await setupManager.checkAndroidStudio();

        if (!xcodeResult.installed || !androidResult.installed) {
            // Show setup page if dependencies are missing
            mainWindow.loadURL(url.format({
                pathname: path.join(__dirname, 'renderer', 'pages', 'setup', 'setup.html'),
                protocol: 'file:',
                slashes: true
            }));
        } else {
            // Load main app if everything is installed
            mainWindow.loadURL(url.format({
                pathname: path.join(__dirname, 'renderer', 'index.html'),
                protocol: 'file:',
                slashes: true
            }));
        }
    } catch (error) {
        console.error('Error checking dependencies:', error);
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, 'renderer', 'pages', 'setup', 'setup.html'),
            protocol: 'file:',
            slashes: true
        }));
    }
}

// Setup-related IPC handlers
ipcMain.handle('check-xcode', () => setupManager.checkXcode());
ipcMain.handle('check-android-studio', () => setupManager.checkAndroidStudio());
ipcMain.handle('fix-android-setup', () => setupManager.fixAndroidSetup());
ipcMain.handle('install-xcode', () => setupManager.installXcode());
ipcMain.handle('install-android-studio', () => setupManager.installAndroidStudio());
ipcMain.handle('continue-to-app', () => {
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'renderer', 'index.html'),
        protocol: 'file:',
        slashes: true
    }));
});

// IPC handlers
ipcMain.handle('get-ios-devices', async () => {
    return await tester.getIosDevices();
});

ipcMain.handle('get-android-devices', async () => {
    return await tester.getAndroidDevices();
});

ipcMain.handle('set-ios-device', async (event, deviceName, runtime) => {
    console.log('IPC: Setting iOS device:', { deviceName, runtime });
    tester.setIosDevice(deviceName, runtime);
    return { success: true };
});

ipcMain.handle('set-android-device', async (event, deviceName, version) => {
    console.log('IPC: Setting Android device:', { deviceName, version });
    tester.setAndroidDevice(deviceName, version);
    return { success: true };
});

ipcMain.handle('launch-ios', async (event, url) => {
    console.log('IPC: Launching iOS with URL:', url);
    try {
        await tester.launchIosSimulator(url);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('launch-android', async (event, url) => {
    console.log('IPC: Launching Android with URL:', url);
    try {
        await tester.launchAndroidEmulator(url);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('check-simulator', async () => {
    return await tester.checkSimulatorState();
});

ipcMain.handle('check-android-setup', async () => {
    return await tester.checkAndroidSetup();
});

// Handle navigation between pages
ipcMain.on('navigate', (event, page) => {
    if (page === 'setup') {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, 'renderer', 'pages', 'setup', 'setup.html'),
            protocol: 'file:',
            slashes: true
        }));
    } else if (page === 'home') {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, 'renderer', 'index.html'),
            protocol: 'file:',
            slashes: true
        }));
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
