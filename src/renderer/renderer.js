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
const openSafariButton = document.getElementById('openSafari');
const openChromeInspectButton = document.getElementById('openChromeInspect');

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
        // Get iOS devices and versions
        const iosData = await ipcRenderer.invoke('get-ios-devices');
        console.log('Received iOS data:', iosData);

        if (iosData.devices && iosData.devices.length > 0) {
            // Populate iOS devices dropdown
            iosDevicesSelect.innerHTML = iosData.devices
                .map(device => `<option value="${device.name}">${device.name}</option>`)
                .join('');
            
            console.log('Populated iOS devices:', iosData.devices);
            
            // Set the first device as default
            if (iosDevicesSelect.options.length > 0) {
                iosDevicesSelect.selectedIndex = 0;
            }
        } else {
            console.log('No iOS devices available');
            iosDevicesSelect.innerHTML = '<option value="">No devices available</option>';
        }

        if (iosData.runtimes && iosData.runtimes.length > 0) {
            // Populate iOS versions dropdown
            iosVersionsSelect.innerHTML = iosData.runtimes
                .map(runtime => {
                    const version = runtime.name.replace('iOS ', '');
                    console.log('Adding runtime option:', { version, identifier: runtime.identifier });
                    return `<option value="${version}" data-identifier="${runtime.identifier}">${version}</option>`;
                })
                .reverse() // Show newest versions first
                .join('');

            // Set the first version as default
            if (iosVersionsSelect.options.length > 0) {
                iosVersionsSelect.selectedIndex = 0;
            }

            // Trigger change event to populate compatible devices
            const event = new Event('change');
            iosVersionsSelect.dispatchEvent(event);
        } else {
            console.log('No iOS runtimes available');
            iosVersionsSelect.innerHTML = '<option value="">No versions available</option>';
        }

        // Get Android devices and versions
        const androidData = await ipcRenderer.invoke('get-android-devices');
        console.log('Received Android data:', androidData);

        if (androidData.devices && androidData.devices.length > 0) {
            androidDevicesSelect.innerHTML = androidData.devices
                .map(device => `<option value="${device.name}">${device.name}</option>`)
                .join('');
            
            // Set the first device as default
            if (androidDevicesSelect.options.length > 0) {
                androidDevicesSelect.selectedIndex = 0;
                // Store the selected device name
                const selectedDevice = androidDevicesSelect.value;
                // Notify the main process about the selected device
                ipcRenderer.invoke('set-android-device', selectedDevice);
            }
        } else {
            androidDevicesSelect.innerHTML = '<option value="">No devices available</option>';
        }

        if (androidData.versions && androidData.versions.length > 0) {
            androidVersionsSelect.innerHTML = androidData.versions
                .map(version => `<option value="${version.version}">${version.name}</option>`)
                .join('');
            
            // Set the first version as default
            if (androidVersionsSelect.options.length > 0) {
                androidVersionsSelect.selectedIndex = 0;
                // Store the selected version
                const selectedVersion = androidVersionsSelect.value;
                // Notify the main process about the selected version
                ipcRenderer.invoke('set-android-version', selectedVersion);
            }
        } else {
            androidVersionsSelect.innerHTML = '<option value="">No versions available</option>';
        }

        // Update device selections in main process
        if (androidDevicesSelect.value && androidVersionsSelect.value) {
            await ipcRenderer.invoke('set-android-device', androidDevicesSelect.value, androidVersionsSelect.value);
        }
        
    } catch (error) {
        console.error('Error loading devices:', error);
        showNotification('Error loading devices. Please check the console for details.', true);
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

iosVersionsSelect.addEventListener('change', async () => {
    const selectedRuntime = iosVersionsSelect.value;
    const selectedRuntimeIdentifier = iosVersionsSelect.options[iosVersionsSelect.selectedIndex].dataset.identifier;
    
    console.log('iOS version changed:', { selectedRuntime, selectedRuntimeIdentifier });
  
    // Get compatible devices for this runtime
    const compatibleDevices = await ipcRenderer.invoke('get-compatible-devices', selectedRuntimeIdentifier);
    console.log('Got compatible devices:', compatibleDevices);
  
    // Update device dropdown with compatible devices
    if (compatibleDevices && compatibleDevices.length > 0) {
        iosDevicesSelect.innerHTML = compatibleDevices
            .map(device => `<option value="${device.name}">${device.name}</option>`)
            .join('');
        
        // Select first device by default if available
        iosDevicesSelect.value = compatibleDevices[0].name;
    } else {
        iosDevicesSelect.innerHTML = '<option value="">No compatible devices available</option>';
    }
    
    // Update the selected device
    const selectedDevice = iosDevicesSelect.value;
    if (selectedDevice) {
        await ipcRenderer.invoke('set-ios-device', selectedDevice, selectedRuntime);
    }
});

iosDevicesSelect.addEventListener('change', async (e) => {
    const selectedDevice = e.target.value;
    const selectedVersion = iosVersionsSelect.value;
    await ipcRenderer.invoke('set-ios-device', selectedDevice, selectedVersion);
});

androidDevicesSelect.addEventListener('change', async () => {
    if (androidDevicesSelect.value && androidVersionsSelect.value) {
        await ipcRenderer.invoke('set-android-device', androidDevicesSelect.value, androidVersionsSelect.value);
    }
});

androidVersionsSelect.addEventListener('change', async () => {
    if (androidDevicesSelect.value && androidVersionsSelect.value) {
        await ipcRenderer.invoke('set-android-device', androidDevicesSelect.value, androidVersionsSelect.value);
    }
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

// Safari and Chrome Inspector handlers
openSafariButton.addEventListener('click', () => {
    ipcRenderer.send('open-safari');
});

openChromeInspectButton.addEventListener('click', () => {
    ipcRenderer.send('open-chrome-inspect');
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDevices();
    updateSimulatorStatus();
    setInterval(updateSimulatorStatus, 5000); // Check status every 5 seconds
});
