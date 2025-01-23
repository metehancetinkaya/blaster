const { ipcRenderer, ipcMain } = require('electron');

// DOM Elements
const urlInput = document.getElementById('urlInput');
const iosDevicesSelect = document.getElementById('iosDevices');
const iosVersionsSelect = document.getElementById('iosVersions');
const androidDevicesSelect = document.getElementById('androidDevices');
const androidVersionsSelect = document.getElementById('androidVersions');
const launchIOSButton = document.getElementById('launchIOS');
const launchAndroidButton = document.getElementById('launchAndroid');
const launchBothButton = document.getElementById('launchBoth');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notificationText');
const closeNotification = document.getElementById('closeNotification');
const iosStatus = document.getElementById('iosStatus');
const androidStatus = document.getElementById('androidStatus');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Functions
async function loadDevices() {
    try {
        // Load iOS devices and versions
        const iosData = await ipcRenderer.invoke('get-ios-devices');
        
        // Populate iOS devices
        if (iosData.devices.length > 0) {
            // Group devices by type (iPhone/iPad)
            const iphones = iosData.devices
                .filter(device => device.name.includes('iPhone'))
                .map(device => ({
                    value: device.name,
                    display: device.name
                }));

            const ipads = iosData.devices
                .filter(device => device.name.includes('iPad'))
                .map(device => ({
                    value: device.name,
                    display: device.name
                }));

            // Create option groups
            const html = [];
            
            if (iphones.length > 0) {
                html.push('<optgroup label="iPhones">');
                html.push(iphones
                    .map(device => `<option value="${device.value}">${device.display}</option>`)
                    .join(''));
                html.push('</optgroup>');
            }
            
            if (ipads.length > 0) {
                html.push('<optgroup label="iPads">');
                html.push(ipads
                    .map(device => `<option value="${device.value}">${device.display}</option>`)
                    .join(''));
                html.push('</optgroup>');
            }

            iosDevicesSelect.innerHTML = html.join('');
        } else {
            iosDevicesSelect.innerHTML = '<option value="">No iOS devices available</option>';
            launchIOSButton.disabled = true;
            launchBothButton.disabled = true;
        }
        
        // Populate iOS versions
        if (iosData.runtimes.length > 0) {
            iosVersionsSelect.innerHTML = iosData.runtimes
                .map(runtime => {
                    const version = runtime.name.replace('iOS ', '');
                    return `<option value="${version}">${version}</option>`;
                })
                .reverse() // Show newest versions first
                .join('');
        } else {
            iosVersionsSelect.innerHTML = '<option value="">No iOS versions available</option>';
            launchIOSButton.disabled = true;
            launchBothButton.disabled = true;
        }

        // Check Android setup
        const androidSetup = await ipcRenderer.invoke('check-android-setup');
        
        if (!androidSetup.isSetup) {
            androidDevicesSelect.innerHTML = '<option value="">Android SDK not set up</option>';
            androidVersionsSelect.innerHTML = '<option value="">Android SDK not set up</option>';
            showNotification('Android SDK not found. Please install Android Studio and set ANDROID_HOME.', true);
            launchAndroidButton.disabled = true;
            launchBothButton.disabled = true;
            return;
        }

        // Load Android devices and versions
        const androidData = await ipcRenderer.invoke('get-android-devices');
        
        // Populate Android devices
        if (androidData.devices.length > 0) {
            androidDevicesSelect.innerHTML = androidData.devices
                .map(device => `<option value="${device.name}">${device.name}</option>`)
                .join('');
        } else {
            androidDevicesSelect.innerHTML = '<option value="">No Android devices available</option>';
            launchAndroidButton.disabled = true;
            launchBothButton.disabled = true;
        }

        // Populate Android versions
        if (androidData.versions.length > 0) {
            androidVersionsSelect.innerHTML = androidData.versions
                .sort((a, b) => parseInt(b.version) - parseInt(a.version)) // Show newest versions first
                .map(version => `<option value="${version.version}">Android ${version.version} (${version.type})</option>`)
                .join('');
        } else {
            androidVersionsSelect.innerHTML = '<option value="">No Android versions available</option>';
            launchAndroidButton.disabled = true;
            launchBothButton.disabled = true;
        }

    } catch (error) {
        showNotification('Error loading devices: ' + error.message, true);
    }
}

function showNotification(message, isError = false) {
    notificationText.textContent = message;
    notification.classList.remove('hidden', 'error', 'success');
    notification.classList.add(isError ? 'error' : 'success');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

function validateUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

async function updateSimulatorStatus() {
    const isIosRunning = await ipcRenderer.invoke('check-simulator');
    iosStatus.classList.toggle('active', isIosRunning);
}

// Event Listeners
closeNotification.addEventListener('click', () => {
    notification.classList.add('hidden');
});

iosDevicesSelect.addEventListener('change', async (e) => {
    const selectedDevice = e.target.value;
    const selectedVersion = iosVersionsSelect.value;
    await ipcRenderer.invoke('set-ios-device', selectedDevice, selectedVersion);
});

iosVersionsSelect.addEventListener('change', async (e) => {
    const selectedDevice = iosDevicesSelect.value;
    const selectedVersion = e.target.value;
    await ipcRenderer.invoke('set-ios-device', selectedDevice, selectedVersion);
});

androidDevicesSelect.addEventListener('change', async (e) => {
    const selectedDevice = e.target.value;
    const selectedVersion = androidVersionsSelect.value;
    await ipcRenderer.invoke('set-android-device', selectedDevice, selectedVersion);
});

androidVersionsSelect.addEventListener('change', async (e) => {
    const selectedDevice = androidDevicesSelect.value;
    const selectedVersion = e.target.value;
    await ipcRenderer.invoke('set-android-device', selectedDevice, selectedVersion);
});

async function handleLaunch(type) {
    const url = urlInput.value.trim();
    
    if (!validateUrl(url)) {
        showNotification('Please enter a valid URL', true);
        return;
    }

    try {
        switch (type) {
            case 'ios':
                const iosResult = await ipcRenderer.invoke('launch-ios', url);
                if (iosResult.success) {
                    showNotification('iOS Simulator launched successfully');
                } else {
                    showNotification(iosResult.error, true);
                }
                break;
            case 'android':
                const androidResult = await ipcRenderer.invoke('launch-android', url);
                if (androidResult.success) {
                    showNotification('Android Emulator launched successfully');
                } else {
                    showNotification(androidResult.error, true);
                }
                break;
            case 'both':
                const [iosBothResult, androidBothResult] = await Promise.all([
                    ipcRenderer.invoke('launch-ios', url),
                    ipcRenderer.invoke('launch-android', url)
                ]);
                
                if (iosBothResult.success && androidBothResult.success) {
                    showNotification('Both simulators launched successfully');
                } else {
                    const errors = [];
                    if (!iosBothResult.success) errors.push(`iOS: ${iosBothResult.error}`);
                    if (!androidBothResult.success) errors.push(`Android: ${androidBothResult.error}`);
                    showNotification(errors.join('; '), true);
                }
                break;
        }
        updateSimulatorStatus();
    } catch (error) {
        showNotification(error.message, true);
    }
}

// Setup button click handler
document.getElementById('setup-btn').addEventListener('click', () => {
    ipcRenderer.send('navigate', 'setup');
});

// Event Listeners
themeToggleBtn.addEventListener('click', toggleTheme);
launchIOSButton.addEventListener('click', () => handleLaunch('ios'));
launchAndroidButton.addEventListener('click', () => handleLaunch('android'));
launchBothButton.addEventListener('click', () => handleLaunch('both'));

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDevices();
    updateSimulatorStatus();
    setInterval(updateSimulatorStatus, 5000); // Check status every 5 seconds
});
