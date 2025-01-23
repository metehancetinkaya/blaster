const util = require('util');
const { exec } = require('child_process');
const chalk = require('chalk');
const execAsync = util.promisify(exec);

class MobileWebTester {
  constructor() {
    this.iosDevice = null;
    this.androidDevice = null;
  }

  async getIosDevices() {
    try {
      // Get all available runtimes
      const { stdout: runtimesOutput } = await execAsync('xcrun simctl list runtimes --json');
      const runtimes = JSON.parse(runtimesOutput).runtimes
        .filter(runtime => runtime.isAvailable && runtime.name.includes('iOS'))
        .map(runtime => ({
          name: runtime.name,
          identifier: runtime.identifier,
          version: runtime.version
        }));

      // Get all device types
      const { stdout: deviceTypesOutput } = await execAsync('xcrun simctl list devicetypes --json');
      const deviceTypes = JSON.parse(deviceTypesOutput).devicetypes
        .filter(device => {
          const name = device.name.toLowerCase();
          // Include only recent iPhone and iPad models
          return (name.includes('iphone') || name.includes('ipad')) && 
                 !name.includes('retina') && // Exclude older retina models
                 !name.includes('1st') && !name.includes('2nd') && // Exclude older generations
                 !name.includes('3rd') && !name.includes('4th');
        })
        .map(device => ({
          name: device.name,
          identifier: device.identifier
        }));

      console.log('Available device types:', deviceTypes);
      console.log('Available runtimes:', runtimes);

      return {
        devices: deviceTypes,
        runtimes: runtimes
      };
    } catch (error) {
      console.error('Error getting iOS devices:', error);
      return { devices: [], runtimes: [] };
    }
  }

  async getAndroidDevices() {
    try {
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
      const sdkmanager = `${androidHome}/cmdline-tools/latest/bin/sdkmanager`;
      
      // Get available system images
      const { stdout: systemImages } = await execAsync(`"${sdkmanager}" --list_installed`);
      const versions = systemImages
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

      // Get available device definitions
      const { stdout: avdOutput } = await execAsync(`"${androidHome}/emulator/emulator" -list-avds`);
      const devices = avdOutput.trim().split('\n').filter(Boolean);

      // If no devices found, create a default one
      if (devices.length === 0) {
        console.log('No Android devices found, creating default device...');
        await this.createDefaultAndroidDevice();
        
        // Check again for devices
        const { stdout: newAvdOutput } = await execAsync(`"${androidHome}/emulator/emulator" -list-avds`);
        return {
          devices: newAvdOutput.trim().split('\n').filter(Boolean).map(name => ({ name })),
          versions: versions
        };
      }

      return {
        devices: devices.map(name => ({ name })),
        versions: versions
      };
    } catch (error) {
      console.error('Error getting Android devices:', error);
      return { devices: [], versions: [] };
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

  async createIosDevice(deviceType, runtime) {
    try {
      const { stdout } = await execAsync(`xcrun simctl create "${deviceType.name}" "${deviceType.identifier}" "${runtime.identifier}"`);
      return stdout.trim();
    } catch (error) {
      console.error('Error creating iOS device:', error);
      throw new Error('Failed to create iOS device');
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

  setAndroidDevice(deviceName, version) {
    console.log('Setting Android device:', { deviceName, version });
    this.androidDevice = {
      name: deviceName,
      version: version
    };
    console.log('Current Android device:', this.androidDevice);
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
        throw new Error('No Android device selected');
      }

      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
      const emulatorPath = `${androidHome}/emulator/emulator`;
      const adbPath = `${androidHome}/platform-tools/adb`;

      console.log(`Starting Android emulator: ${this.androidDevice.name}`);

      // Start emulator in background
      exec(`"${emulatorPath}" -avd ${this.androidDevice.name}`);

      // Wait for emulator to boot and be ready
      console.log('Waiting for emulator to boot...');
      let booted = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max wait time

      while (!booted && attempts < maxAttempts) {
        try {
          const { stdout } = await execAsync('adb devices');
          if (stdout.includes('device')) {
            const { stdout: bootAnim } = await execAsync('adb shell getprop init.svc.bootanim');
            if (bootAnim.trim() === 'stopped') {
              booted = true;
              break;
            }
          }
        } catch (error) {
          console.log('Waiting for emulator to be ready...');
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      if (!booted) {
        throw new Error('Timeout waiting for Android emulator to boot');
      }

      console.log(`Opening ${url} in Android emulator...`);
      await execAsync(`"${adbPath}" shell am start -a android.intent.action.VIEW -d "${url}"`);
      console.log(`Successfully opened ${url} in Android emulator`);
    } catch (error) {
      console.error('Error launching Android emulator:', error);
      throw error;
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
      const androidHome = process.env.ANDROID_HOME || `${process.env.HOME}/Library/Android/sdk`;
      
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
}

module.exports = MobileWebTester;
