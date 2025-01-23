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

    async installXcode() {
        try {
            // Open Mac App Store Xcode page
            await execAsync('open macappstore://apps.apple.com/app/xcode/id497799835');
            
            this.mainWindow.webContents.send('xcode-install-progress', 50);

            // Wait for Xcode installation (this is a simplified version)
            const checkInterval = setInterval(async () => {
                const { installed } = await this.checkXcode();
                if (installed) {
                    clearInterval(checkInterval);
                    this.mainWindow.webContents.send('xcode-install-progress', 100);
                }
            }, 10000);

        } catch (error) {
            console.error('Error installing Xcode:', error);
            throw error;
        }
    }

    async installAndroidStudio() {
        try {
            // Download Android Studio
            this.mainWindow.webContents.send('android-install-progress', 10);
            
            const downloadUrl = 'https://redirector.gvt1.com/edgedl/android/studio/install/2021.2.1.16/android-studio-2021.2.1.16-mac.dmg';
            const downloadPath = path.join(app.getPath('downloads'), 'android-studio.dmg');

            await execAsync(`curl -L "${downloadUrl}" -o "${downloadPath}"`);
            this.mainWindow.webContents.send('android-install-progress', 50);

            // Mount DMG
            await execAsync(`hdiutil attach "${downloadPath}"`);
            this.mainWindow.webContents.send('android-install-progress', 60);

            // Copy to Applications
            await execAsync('cp -R "/Volumes/Android Studio/Android Studio.app" /Applications/');
            this.mainWindow.webContents.send('android-install-progress', 80);

            // Unmount DMG
            await execAsync('hdiutil detach "/Volumes/Android Studio"');
            this.mainWindow.webContents.send('android-install-progress', 90);

            // Clean up
            await execAsync(`rm "${downloadPath}"`);
            this.mainWindow.webContents.send('android-install-progress', 100);

        } catch (error) {
            console.error('Error installing Android Studio:', error);
            throw error;
        }
    }

    async fixAndroidSetup() {
        try {
            const androidHome = process.env.ANDROID_HOME || path.join(app.getPath('home'), 'Library/Android/sdk');
            
            // Create .zshrc if it doesn't exist
            const zshrcPath = path.join(app.getPath('home'), '.zshrc');
            if (!fs.existsSync(zshrcPath)) {
                fs.writeFileSync(zshrcPath, '');
            }

            // Read current .zshrc content
            const currentContent = fs.readFileSync(zshrcPath, 'utf8');

            // Add Android environment variables if they don't exist
            const envVars = [
                `export ANDROID_HOME=${androidHome}`,
                'export PATH=$PATH:$ANDROID_HOME/tools',
                'export PATH=$PATH:$ANDROID_HOME/tools/bin',
                'export PATH=$PATH:$ANDROID_HOME/platform-tools',
                'export PATH=$PATH:$ANDROID_HOME/emulator'
            ];

            let contentChanged = false;
            let newContent = currentContent;

            for (const envVar of envVars) {
                if (!currentContent.includes(envVar)) {
                    newContent += `\n${envVar}`;
                    contentChanged = true;
                }
            }

            if (contentChanged) {
                fs.writeFileSync(zshrcPath, newContent);
                console.log('Updated .zshrc with Android environment variables');
            }

            // Source the updated .zshrc
            await execAsync('source ~/.zshrc');

            // Install essential SDK components if needed
            const sdkmanagerPath = path.join(androidHome, 'tools', 'bin', 'sdkmanager');
            if (fs.existsSync(sdkmanagerPath)) {
                try {
                    await execAsync(`${sdkmanagerPath} --install "platform-tools" "emulator"`);
                    console.log('Installed essential Android SDK components');
                } catch (error) {
                    console.error('Error installing SDK components:', error);
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Error fixing Android setup:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = SetupManager;
