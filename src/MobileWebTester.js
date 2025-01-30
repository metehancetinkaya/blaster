const util = require('util');
const { exec } = require('child_process');
const chalk = require('chalk');
const fs = require('fs');
const execAsync = util.promisify(exec);

class MobileWebTester {
  constructor() {
    this.iosDevice = null;
    this.androidDevice = null;
    this.androidVersion = null;
    this.deviceCompatibilityMap = null;
  }

  async getIosDevices() {
    try {
      // Get all available runtimes
      const { stdout: runtimesOutput } = await execAsync('xcrun simctl list runtimes --json');
      const allRuntimes = JSON.parse(runtimesOutput).runtimes;
      
      // Only include properly installed iOS runtimes
      const runtimes = allRuntimes
        .filter(runtime => runtime.isAvailable && runtime.name.includes('iOS'))
        .map(runtime => ({
          name: runtime.name,
          identifier: runtime.identifier,
          version: runtime.version,
          buildversion: runtime.buildversion,
          supportedDeviceTypes: runtime.supportedDeviceTypes || []
        }));

      if (runtimes.length === 0) {
        console.log('No available iOS runtimes found');
        return { devices: [], runtimes: [] };
      }

      // Create a map of compatible devices for each runtime
      const compatibilityMap = new Map();
      
      for (const runtime of runtimes) {
        // Get supported device types for this runtime
        const compatibleDevices = runtime.supportedDeviceTypes
          .filter(device => {
            const name = device.name.toLowerCase();
            return (name.includes('iphone') || name.includes('ipad')) && 
                   !name.includes('retina');
          })
          .map(device => ({
            name: device.name,
            identifier: device.identifier,
            productFamily: device.productFamily
          }));

        compatibilityMap.set(runtime.identifier, compatibleDevices);
      }

      // Store the compatibility map for use when switching versions
      this.deviceCompatibilityMap = compatibilityMap;

      // Get the compatible devices for the first runtime
      const initialDevices = compatibilityMap.get(runtimes[0]?.identifier) || [];

      return {
        devices: initialDevices,
        runtimes: runtimes
      };
    } catch (error) {
      console.error('Error getting iOS devices:', error);
      return { devices: [], runtimes: [] };
    }
  }

  async getCompatibleDevices(runtimeIdentifier) {
    return this.deviceCompatibilityMap?.get(runtimeIdentifier) || [];
  }

  async getAndroidDevices() {
    try {
      // Check multiple possible SDK locations
      const possibleSdkPaths = [
        process.env.ANDROID_HOME,
        `${process.env.HOME}/Library/Android/sdk`,
        `${process.env.HOME}/Android/Sdk`
      ].filter(Boolean);

      let androidHome = null;
      for (const path of possibleSdkPaths) {
        try {
          await execAsync(`test -d "${path}"`);
          androidHome = path;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!androidHome) {
        console.error('Android SDK not found in common locations');
        return { devices: [], versions: [] };
      }

      // Get AVD files from the correct location
      const avdPath = `${process.env.HOME}/.android/avd`;
      const { stdout: avdFiles } = await execAsync(`ls "${avdPath}" 2>/dev/null || true`);
      
      // Parse .ini files to get device names
      const devices = avdFiles
        .split('\n')
        .filter(file => file.endsWith('.ini'))
        .map(file => ({
          name: file.replace('.ini', '')
        }));

      // Get installed system images and platforms
      let versions = [];
      try {
        // First try to get versions from platforms directory
        const { stdout: platformsDir } = await execAsync(`ls "${androidHome}/platforms"`);
        const platformDirVersions = platformsDir
          .split('\n')
          .filter(dir => dir.startsWith('android-'))
          .map(dir => dir.replace('android-', ''))
          .filter(v => !isNaN(v));
        
        console.log('Versions found in platforms directory:', platformDirVersions);
        
        if (platformDirVersions.length > 0) {
          versions = platformDirVersions
            .sort((a, b) => parseInt(b) - parseInt(a))
            .map(version => ({
              version,
              name: this.getAndroidVersionName(version),
              apiLevel: version
            }));
        }

        // If no versions found, try sdkmanager as fallback
        if (versions.length === 0) {
          const cmdlineToolsPath = `${androidHome}/cmdline-tools/latest/bin`;
          const legacyToolsPath = `${androidHome}/tools/bin`;
          
          let sdkmanagerPath;
          try {
            await execAsync(`test -f "${cmdlineToolsPath}/sdkmanager"`);
            sdkmanagerPath = `${cmdlineToolsPath}/sdkmanager`;
          } catch (e) {
            try {
              await execAsync(`test -f "${legacyToolsPath}/sdkmanager"`);
              sdkmanagerPath = `${legacyToolsPath}/sdkmanager`;
            } catch (e) {
              console.log('sdkmanager not found, using platform versions only');
            }
          }

          if (sdkmanagerPath) {
            const { stdout: installedPackages } = await execAsync(`"${sdkmanagerPath}" --list_installed`);
            const systemImageVersions = installedPackages
              .split('\n')
              .filter(line => line.includes('system-images;android-'))
              .map(line => {
                const match = line.match(/system-images;android-(\d+);([^;]+);([^|]+)/);
                if (match) {
                  return {
                    version: match[1],
                    type: match[2],
                    arch: match[3].trim()
                  };
                }
                return null;
              })
              .filter(Boolean);

            if (systemImageVersions.length > 0) {
              const additionalVersions = systemImageVersions
                .map(v => v.version)
                .filter(v => !versions.some(existing => existing.version === v));

              versions.push(...additionalVersions.map(version => ({
                version,
                name: this.getAndroidVersionName(version),
                apiLevel: version
              })));

              // Re-sort all versions
              versions.sort((a, b) => parseInt(b.version) - parseInt(a.version));
            }
          }
        }
      } catch (error) {
        console.error('Error getting Android versions:', error);
      }

      console.log('Final Android versions to be displayed:', versions);

      console.log('Found Android devices:', devices);
      console.log('Found Android versions:', versions);

      return {
        devices: devices,
        versions: versions
      };
    } catch (error) {
      console.error('Error getting Android devices:', error);
      return { devices: [], versions: [] };
    }
  }

  async createIosDevice(deviceType, runtime) {
    try {
      // First check if this combination is compatible
      const { stdout: devicesOutput } = await execAsync('xcrun simctl list devices --json');
      const devices = JSON.parse(devicesOutput).devices;
      
      // Check if there are any existing devices with this runtime
      const runtimeDevices = devices[runtime.identifier] || [];
      const compatibleDevice = runtimeDevices.find(d => 
        d.deviceTypeIdentifier === deviceType.identifier && 
        !d.isDeleted && 
        !d.error
      );

      if (!compatibleDevice) {
        throw new Error(`Device ${deviceType.name} is not compatible with iOS ${runtime.version}`);
      }

      const { stdout } = await execAsync(`xcrun simctl create "${deviceType.name}" "${deviceType.identifier}" "${runtime.identifier}"`);
      return stdout.trim();
    } catch (error) {
      console.error('Error creating iOS device:', error);
      throw error;
    }
  }

  async createDefaultAndroidDevice() {
    try {
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
      const sdkmanager = `${androidHome}/cmdline-tools/latest/bin/sdkmanager`;
      const avdmanager = `${androidHome}/cmdline-tools/latest/bin/avdmanager`;
      
      // Install required packages
      await execAsync(`"${sdkmanager}" "system-images;android-30;google_apis;x86_64"`);
      await execAsync(`"${sdkmanager}" "platforms;android-30"`);
      
      // Create AVD
      await execAsync(`echo "no" | "${avdmanager}" create avd -n Pixel_3a -k "system-images;android-30;google_apis;x86_64" -d "pixel_3a"`);
      
      console.log('Default Android device created successfully');
    } catch (error) {
      console.error('Error creating default Android device:', error);
      throw new Error('Failed to create default Android device');
    }
  }

  getAndroidVersionName(apiLevel) {
    const versionMap = {
      '34': 'Android 14',
      '33': 'Android 13',
      '32': 'Android 12L',
      '31': 'Android 12',
      '30': 'Android 11',
      '29': 'Android 10',
      '28': 'Android 9',
      '27': 'Android 8.1',
      '26': 'Android 8.0',
      '25': 'Android 7.1',
      '24': 'Android 7.0',
      '23': 'Android 6.0'
    };
    return versionMap[apiLevel] || `Android API ${apiLevel}`;
  }

  async launchIosSimulator(url) {
    try {
      console.log('Launching iOS simulator with device:', this.iosDevice);
      
      if (!this.iosDevice?.name || !this.iosDevice?.runtime) {
        throw new Error('No iOS device selected. Please select both device and version.');
      }

      // Get device type identifier
      const { stdout: deviceTypesOutput } = await execAsync('xcrun simctl list devicetypes --json');
      const deviceTypes = JSON.parse(deviceTypesOutput).devicetypes;
      const selectedDevice = deviceTypes.find(d => d.name === this.iosDevice.name);

      if (!selectedDevice) {
        throw new Error(`Device type ${this.iosDevice.name} not found`);
      }

      // Get runtime identifier
      const { stdout: runtimesOutput } = await execAsync('xcrun simctl list runtimes --json');
      const runtimes = JSON.parse(runtimesOutput).runtimes;
      const selectedRuntime = runtimes.find(r => r.name === `iOS ${this.iosDevice.runtime}`);

      if (!selectedRuntime) {
        throw new Error(`iOS version ${this.iosDevice.runtime} not found`);
      }

      // Create the device if it doesn't exist
      const deviceName = `${selectedDevice.name.replace('iPhone ', '').replace('iPad ', '')} (${this.iosDevice.runtime})`;
      console.log('Creating device:', {
        name: deviceName,
        deviceType: selectedDevice.identifier,
        runtime: selectedRuntime.identifier
      });

      const { stdout: createOutput } = await execAsync(
        `xcrun simctl create "${deviceName}" "${selectedDevice.identifier}" "${selectedRuntime.identifier}"`
      );
      const deviceUdid = createOutput.trim();

      console.log('Created device:', deviceUdid);

      // Boot the simulator
      console.log('Booting simulator...');
      await execAsync(`xcrun simctl boot ${deviceUdid}`);
      
      // Open Safari with the URL
      console.log('Opening URL in simulator...');
      await execAsync(`xcrun simctl openurl ${deviceUdid} "${url}"`);
      
      // Open Simulator.app to show the device
      console.log('Opening Simulator.app...');
      await execAsync('open -a Simulator');
      
      return { success: true };
    } catch (error) {
      console.error('Error launching iOS simulator:', error);
      return { success: false, error: error.message };
    }
  }

  async launchAndroidEmulator(url) {
    try {
      if (!this.androidDevice) {
        // Get available devices and use the first one
        const { devices, versions } = await this.getAndroidDevices();
        if (devices.length > 0 && versions.length > 0) {
          const defaultDevice = devices[0].name;
          const defaultVersion = versions[0].version;
          await this.setAndroidDevice(defaultDevice, defaultVersion);
        } else {
          throw new Error('No Android devices available. Please create one in Android Studio.');
        }
      }

      // Find Android SDK path
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
      const emulatorPath = `${androidHome}/emulator/emulator`;

      console.log(`Using Android device: ${this.androidDevice}`);
      console.log(`Checking if emulator ${this.androidDevice} is running...`);

      const { stdout: runningDevices } = await execAsync('adb devices');
      const isEmulatorRunning = runningDevices.includes(this.androidDevice);

      if (!isEmulatorRunning) {
        console.log(chalk.yellow(`Starting Android emulator: ${this.androidDevice}`));
        
        // Use the full path to emulator and the device name
        const emulatorCommand = `"${emulatorPath}" -avd "${this.androidDevice}"`;
        console.log(`Running command: ${emulatorCommand}`);
        
        // Start emulator in background
        const childProcess = exec(emulatorCommand, (error) => {
          if (error) {
            console.error('Error starting emulator:', error);
          }
        });
        
        // Wait for the emulator to fully start
        console.log(chalk.yellow('Waiting for emulator to start...'));
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Wait for device to be ready
        await execAsync('adb wait-for-device');
      }

      // Launch Chrome with the URL
      console.log(chalk.yellow(`Opening URL in Android Chrome: ${url}`));
      await execAsync(`adb shell am start -a android.intent.action.VIEW -d "${url}"`);

      return { success: true };
    } catch (error) {
      console.error('Error launching Android emulator:', error);
      throw new Error(`Error launching Android emulator: ${error.message}`);
    }
  }

  async checkSimulatorState() {
    try {
      const { stdout } = await execAsync('xcrun simctl list devices booted --json');
      const devices = JSON.parse(stdout).devices;
      
      for (const runtime in devices) {
        if (devices[runtime].some(device => device.state === 'Booted')) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking simulator state:', error);
      return false;
    }
  }

  async checkAndroidSetup() {
    try {
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/.android/avd`;
      console.log(androidHome)
      // Check if Android SDK exists
      const { stdout: adbVersion } = await execAsync(`${androidHome}/platform-tools/adb --version`);
      const { stdout: emulatorVersion } = await execAsync(`${androidHome}/emulator/emulator -version`);
      
      return {
        isSetup: true,
        adbVersion: adbVersion.split('\n')[0],
        emulatorVersion: emulatorVersion.split('\n')[0]
      };
    } catch (error) {
      return {
        isSetup: false,
        error: 'Android SDK not found. Please install Android Studio and set ANDROID_HOME.'
      };
    }
  }

  setIosDevice(deviceName, runtime) {
    console.log('Setting iOS device:', { deviceName, runtime });
    this.iosDevice = {
      name: deviceName,
      runtime: runtime
    };
    console.log('Current iOS device:', this.iosDevice);
  }

  async setAndroidDevice(deviceName, version) {
    console.log(`Setting Android device: ${deviceName}, version: ${version}`);
    this.androidDevice = deviceName;
    this.androidVersion = version;
  }

  getDefaultAndroidVersion(deviceName) {
    // Try to extract version from device name
    const versionMatch = deviceName.match(/API[_\s](\d+)/i);
    if (versionMatch) {
      return versionMatch[1];
    }
    
    // Default to latest stable version if no version in name
    return '33'; // Android 13
  }
}

module.exports = MobileWebTester;
