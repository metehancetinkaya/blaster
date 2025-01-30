const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const execAsync = util.promisify(exec);

class SetupManager {
    constructor(window) {
        this.mainWindow = window;
    }

    async checkXcode() {
        try {
            // Check if Xcode.app exists
            const xcodeExists = fs.existsSync('/Applications/Xcode.app');
            
            if (!xcodeExists) {
                return { installed: false };
            }

            // Check if xcode-select is properly set up
            const { stdout } = await execAsync('xcode-select -p');
            const xcodePathValid = stdout.includes('Xcode.app');

            // Check if iOS simulators are available
            const { stdout: simulatorOutput } = await execAsync('xcrun simctl list devices');
            const simulatorsAvailable = simulatorOutput.includes('iPhone') || simulatorOutput.includes('iPad');

            return {
                installed: xcodePathValid && simulatorsAvailable,
                path: stdout.trim()
            };
        } catch (error) {
            console.error('Error checking Xcode:', error);
            return { installed: false, error: error.message };
        }
    }

    async checkAndroidStudio() {
        try {
            // Common paths for Android Studio and SDK
            const androidStudioPaths = [
                '/Applications/Android Studio.app',
                path.join(app.getPath('home'), 'Library/Application Support/Google/Android Studio'),
            ];

            const androidSdkPaths = [
                process.env.ANDROID_HOME,
                path.join(app.getPath('home'), 'Library/Android/sdk'),
                path.join(app.getPath('home'), 'Android/Sdk'),
                '/Users/Shared/Android/sdk'
            ];

            // Check Android Studio installation
            const studioExists = androidStudioPaths.some(p => fs.existsSync(p));
            console.log('Android Studio paths check:', { paths: androidStudioPaths, exists: studioExists });

            // Find Android SDK location
            let sdkPath = null;
            for (const path of androidSdkPaths) {
                if (path && fs.existsSync(path)) {
                    sdkPath = path;
                    break;
                }
            }
            console.log('Android SDK path check:', { paths: androidSdkPaths, found: sdkPath });

            if (!studioExists) {
                return { 
                    installed: false,
                    error: 'Android Studio not found'
                };
            }

            if (!sdkPath) {
                return { 
                    installed: false,
                    error: 'Android SDK not found. Please set ANDROID_HOME environment variable.'
                };
            }

            // Check for essential SDK components
            const platformToolsPath = path.join(sdkPath, 'platform-tools');
            const adbPath = path.join(platformToolsPath, 'adb');
            const emulatorPath = path.join(sdkPath, 'emulator');

            const hasAdb = fs.existsSync(adbPath);
            const hasEmulator = fs.existsSync(emulatorPath);

            console.log('Android tools check:', {
                platformTools: fs.existsSync(platformToolsPath),
                adb: hasAdb,
                emulator: hasEmulator
            });

            if (!hasAdb || !hasEmulator) {
                return {
                    installed: false,
                    error: 'Android SDK is missing essential components. Please install platform-tools and emulator.'
                };
            }

            // Try to run adb version to verify it's working
            try {
                const { stdout: adbVersion } = await execAsync(`${adbPath} version`);
                console.log('ADB version:', adbVersion);
            } catch (error) {
                console.error('Error running adb:', error);
                return {
                    installed: false,
                    error: 'ADB is not working properly. Please check Android Studio setup.'
                };
            }

            return {
                installed: true,
                path: sdkPath,
                studioPath: androidStudioPaths.find(p => fs.existsSync(p))
            };
        } catch (error) {
            console.error('Error checking Android Studio:', error);
            return { 
                installed: false,
                error: error.message
            };
        }
    }

    async checkIosRuntimes() {
        try {
            const { stdout } = await execAsync('xcrun simctl list runtimes --json');
            const runtimes = JSON.parse(stdout).runtimes;
            
            // Filter iOS runtimes and map to a simpler format
            const iosRuntimes = runtimes
                .filter(runtime => runtime.name.includes('iOS'))
                .map(runtime => ({
                    name: runtime.name,
                    version: runtime.version,
                    buildversion: runtime.buildversion,
                    isAvailable: runtime.isAvailable
                }));

            return {
                installed: true,
                runtimes: iosRuntimes
            };
        } catch (error) {
            console.error('Error checking iOS runtimes:', error);
            return { 
                installed: false, 
                error: error.message,
                runtimes: []
            };
        }
    }

    async openXcodeComponents() {
        try {
            // First check if Xcode is installed
            const xcodeResult = await this.checkXcode();
            if (!xcodeResult.installed) {
                throw new Error('Xcode is not installed');
            }

            // Open Xcode
            await execAsync('open -a "Xcode"');
            
            // Wait a moment for Xcode to open
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Open Xcode preferences using a more reliable AppleScript command
            const openPrefsScript = `
                tell application "System Events"
                    tell process "Xcode"
                        click menu item "Settings…" of menu "Xcode" of menu bar 1
                    end tell
                end tell
            `;
            
            await execAsync(`osascript -e '${openPrefsScript}'`);

            // Show a message to the user about where to find the Components tab
            return {
                success: true,
                message: 'Opened Xcode Settings. Please click on the "Components" tab to view available iOS versions.'
            };
        } catch (error) {
            console.error('Error opening Xcode Settings:', error);
            return {
                success: false,
                error: `Error opening Xcode Settings: ${error.message}`
            };
        }
    }

    async getAvailableIosVersions() {
        try {
            // Get currently installed runtimes
            const { runtimes: installedRuntimes } = await this.checkIosRuntimes();
            const installedVersions = new Set(installedRuntimes.map(r => r.version));

            // List of supported iOS versions (you can update this list as needed)
            const supportedVersions = [
                { version: '18.2', name: 'iOS 18.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2' },
                { version: '17.2', name: 'iOS 17.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-2' },
                { version: '17.0', name: 'iOS 17.0', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0' },
                { version: '16.4', name: 'iOS 16.4', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-16-4' },
                { version: '16.2', name: 'iOS 16.2', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-16-2' },
                { version: '16.0', name: 'iOS 16.0', identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-16-0' }
            ];

            // Filter out installed versions
            const availableVersions = supportedVersions.filter(v => !installedVersions.has(v.version));

            return {
                success: true,
                versions: availableVersions
            };
        } catch (error) {
            console.error('Error getting available iOS versions:', error);
            return {
                success: false,
                error: error.message,
                versions: []
            };
        }
    }

    async installIosRuntime(version) {
        try {
            // First check if Xcode Command Line Tools are installed
            await execAsync('xcode-select -p');
            
            // Find the runtime identifier for the requested version
            const { stdout: runtimeList } = await execAsync('xcrun simctl list runtimes --json');
            const runtimes = JSON.parse(runtimeList).runtimes;
            const runtime = runtimes.find(r => r.version === version);

            if (!runtime) {
                // Check if runtime is available for download
                const { stdout: availableList } = await execAsync('xcrun xcodebuild -showsdks');
                if (!availableList.includes(`iOS ${version}`)) {
                    throw new Error(`iOS ${version} is not available in your Xcode installation`);
                }
            }

            // Install the runtime using simctl
            const { stdout } = await execAsync(`xcrun simctl runtime add "iOS ${version}"`);
            
            console.log('iOS Runtime installation output:', stdout);
            
            return {
                success: true,
                message: `Successfully installed iOS ${version} runtime`
            };
        } catch (error) {
            console.error('Error installing iOS runtime:', error);
            
            // Check if it's a permission error
            if (error.message.includes('permission denied') || error.message.includes('sudo')) {
                return {
                    success: false,
                    error: 'Permission denied. Please run with sudo privileges.'
                };
            }
            
            // Check if runtime is not available
            if (error.message.includes('not available')) {
                return {
                    success: false,
                    error: `iOS ${version} is not available in your Xcode installation. Please install it through Xcode first.`
                };
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async installXcode() {
        try {
            // Open Mac App Store Xcode page
            await execAsync('open macappstore://apps.apple.com/app/xcode/id497799835');
            this.mainWindow.webContents.send('xcode-install-started', {
                message: 'Redirected to Xcode download page in Mac App Store. Please install Xcode and then restart the application.'
            });
        } catch (error) {
            console.error('Error opening Xcode download page:', error);
            throw error;
        }
    }

    async installAndroidStudio() {
        try {
            // Open Android Studio download page
            await execAsync('open https://developer.android.com/studio');
            this.mainWindow.webContents.send('android-install-started', {
                message: 'Redirected to Android Studio download page. Please follow these steps:\n' +
                        '1. Download and install Android Studio\n' +
                        '2. During installation, make sure to install the Android SDK\n' +
                        '3. After installation, open Android Studio and complete the setup wizard\n' +
                        '4. Restart this application'
            });
        } catch (error) {
            console.error('Error opening Android Studio download page:', error);
            throw error;
        }
    }
}

module.exports = SetupManager;
