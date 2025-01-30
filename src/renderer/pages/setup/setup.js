const { ipcRenderer } = require('electron');

class SetupManager {
    constructor() {
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeTheme();
        this.checkDependencies();
    }

    initializeElements() {
        // Theme elements
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');

        // Status elements
        this.xcodeStatus = document.getElementById('xcode-status');
        this.androidStatus = document.getElementById('android-status');
        this.iosRuntimeStatus = document.getElementById('ios-runtime-status');

        // Buttons
        this.installXcodeBtn = document.getElementById('install-xcode');
        this.installAndroidBtn = document.getElementById('install-android');
        this.continueBtn = document.getElementById('continue-btn');
        this.openXcodeVersionsBtn = document.getElementById('open-xcode-versions');

        // Progress bars
        this.xcodeProgress = document.getElementById('xcode-progress');
        this.androidProgress = document.getElementById('android-progress');
        this.iosRuntimeProgress = document.getElementById('ios-runtime-progress');

        // Message
        this.setupMessage = document.getElementById('setup-message');

        // iOS Runtime elements
        this.iosRuntimeSelect = document.getElementById('ios-runtime-select');
        this.runtimeList = document.getElementById('runtime-list');
    }

    initializeEventListeners() {
        // Theme toggle
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

        // Button click handlers
        this.installXcodeBtn.addEventListener('click', () => this.installXcode());
        this.installAndroidBtn.addEventListener('click', () => this.installAndroidStudio());
        this.continueBtn.addEventListener('click', () => this.continueToApp());
        this.openXcodeVersionsBtn.addEventListener('click', () => this.openXcodeComponents());

        // IPC listeners
        ipcRenderer.on('xcode-install-progress', (_, progress) => {
            this.updateProgress('xcode', progress);
        });

        ipcRenderer.on('android-install-progress', (_, progress) => {
            this.updateProgress('android', progress);
        });

        ipcRenderer.on('ios-runtime-install-progress', (_, progress) => {
            this.updateProgress('ios-runtime', progress);
        });
    }

    initializeTheme() {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else {
            // Check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
            localStorage.setItem('theme', prefersDark ? 'dark' : 'light');
        }

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Animate the button
        this.themeToggleBtn.style.transform = 'scale(0.9)';
        setTimeout(() => {
            this.themeToggleBtn.style.transform = 'scale(1)';
        }, 100);
    }

    async checkDependencies() {
        try {
            // Check Xcode
            const xcodeResult = await ipcRenderer.invoke('check-xcode');
            this.updateStatus('xcode', xcodeResult);

            // Check Android Studio
            const androidResult = await ipcRenderer.invoke('check-android-studio');
            console.log('Android Studio check result:', androidResult);
            
            if (!androidResult.installed && androidResult.error) {
                this.setupMessage.textContent = `Android Studio issue: ${androidResult.error}`;
                
                // Try to fix Android setup
                const fixResult = await ipcRenderer.invoke('fix-android-setup');
                if (fixResult.success) {
                    this.setupMessage.textContent = 'Fixed Android Studio setup. Checking again...';
                    // Recheck after fixing
                    const newAndroidResult = await ipcRenderer.invoke('check-android-studio');
                    this.updateStatus('android', newAndroidResult);
                } else {
                    this.setupMessage.textContent = `Could not fix Android Studio setup: ${fixResult.error}`;
                }
            } else {
                this.updateStatus('android', androidResult);
            }

            // Check iOS runtimes
            const iosRuntimesResult = await ipcRenderer.invoke('check-ios-runtimes');
            this.updateIosRuntimesStatus(iosRuntimesResult);

            this.updateContinueButton();
        } catch (error) {
            console.error('Error checking dependencies:', error);
            this.setupMessage.textContent = 'Error checking dependencies. Please try again.';
        }
    }

    updateStatus(type, status) {
        const statusElement = type === 'xcode' ? this.xcodeStatus : this.androidStatus;
        const installButton = type === 'xcode' ? this.installXcodeBtn : this.installAndroidBtn;

        if (status.installed) {
            statusElement.textContent = 'Installed';
            statusElement.className = 'status installed';
            installButton.disabled = true;
        } else {
            statusElement.textContent = 'Not Installed';
            statusElement.className = 'status not-installed';
            installButton.disabled = false;
        }
    }

    async updateIosRuntimesStatus(status) {
        if (status.installed && status.runtimes.length > 0) {
            this.iosRuntimeStatus.textContent = 'Available';
            this.iosRuntimeStatus.className = 'status success';
            
            // Update installed runtimes list
            this.runtimeList.innerHTML = status.runtimes
                .map(runtime => `<li>${runtime.name} (${runtime.isAvailable ? 'Ready' : 'Not Available'})</li>`)
                .join('');
                
            // Update available versions in dropdown
            await this.updateAvailableIosVersions();
        } else {
            this.iosRuntimeStatus.textContent = 'No Runtimes';
            this.iosRuntimeStatus.className = 'status warning';
            await this.updateAvailableIosVersions();
        }
    }

    async updateAvailableIosVersions() {
        try {
            const result = await ipcRenderer.invoke('get-available-ios-versions');
            
            if (result.success && result.versions.length > 0) {
                // Clear existing options except the first one
                while (this.iosRuntimeSelect.options.length > 1) {
                    this.iosRuntimeSelect.remove(1);
                }
                
                // Add available versions
                result.versions.forEach(version => {
                    const option = document.createElement('option');
                    option.value = version.version;
                    option.textContent = version.name;
                    this.iosRuntimeSelect.appendChild(option);
                });
                
                this.installIosRuntimeBtn.disabled = false;
            } else {
                this.iosRuntimeSelect.innerHTML = '<option value="">No versions available</option>';
                this.installIosRuntimeBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error updating available iOS versions:', error);
            this.iosRuntimeSelect.innerHTML = '<option value="">Error loading versions</option>';
            this.installIosRuntimeBtn.disabled = true;
        }
    }

    updateProgress(type, progress) {
        const progressBar = type === 'xcode' ? this.xcodeProgress : type === 'android' ? this.androidProgress : this.iosRuntimeProgress;
        const progressElement = progressBar.querySelector('.progress');

        if (progress === 0) {
            progressBar.style.display = 'block';
        } else if (progress === 100) {
            setTimeout(() => {
                progressBar.style.display = 'none';
                this.checkDependencies();
            }, 1000);
        }

        progressElement.style.width = `${progress}%`;
    }

    async installXcode() {
        try {
            this.installXcodeBtn.disabled = true;
            this.setupMessage.textContent = 'Installing Xcode... This may take a while.';
            await ipcRenderer.invoke('install-xcode');
        } catch (error) {
            console.error('Error installing Xcode:', error);
            this.setupMessage.textContent = 'Error installing Xcode. Please try again.';
            this.installXcodeBtn.disabled = false;
        }
    }

    async installAndroidStudio() {
        try {
            this.installAndroidBtn.disabled = true;
            this.setupMessage.textContent = 'Installing Android Studio... This may take a while.';
            await ipcRenderer.invoke('install-android-studio');
        } catch (error) {
            console.error('Error installing Android Studio:', error);
            this.setupMessage.textContent = 'Error installing Android Studio. Please try again.';
            this.installAndroidBtn.disabled = false;
        }
    }

    async installIosRuntime() {
        try {
            const selectedVersion = this.iosRuntimeSelect.value;
            this.installIosRuntimeBtn.disabled = true;
            this.iosRuntimeProgress.style.display = 'block';
            
            const result = await ipcRenderer.invoke('install-ios-runtime', selectedVersion);
            
            if (result.success) {
                this.setupMessage.textContent = result.message;
                // Refresh runtime list
                const iosRuntimesResult = await ipcRenderer.invoke('check-ios-runtimes');
                this.updateIosRuntimesStatus(iosRuntimesResult);
            } else {
                this.setupMessage.textContent = `Failed to install iOS ${selectedVersion} runtime: ${result.error}`;
            }
        } catch (error) {
            console.error('Error installing iOS runtime:', error);
            this.setupMessage.textContent = `Error installing iOS runtime: ${error.message}`;
        } finally {
            this.installIosRuntimeBtn.disabled = false;
            this.iosRuntimeProgress.style.display = 'none';
        }
    }

    async openXcodeComponents() {
        try {
            this.setupMessage.textContent = 'Opening Xcode Components...';
            const result = await ipcRenderer.invoke('open-xcode-components');
            
            if (result.success) {
                this.setupMessage.textContent = result.message;
            } else {
                this.setupMessage.textContent = `Error: ${result.error}`;
            }
        } catch (error) {
            console.error('Error opening Xcode Components:', error);
            this.setupMessage.textContent = `Error: ${error.message}`;
        }
    }

    updateContinueButton() {
        const xcodeInstalled = this.xcodeStatus.classList.contains('installed');
        const androidInstalled = this.androidStatus.classList.contains('installed');
        const iosRuntimesAvailable = this.iosRuntimeStatus.classList.contains('success');
        this.continueBtn.disabled = !(xcodeInstalled && androidInstalled && iosRuntimesAvailable);
    }

    async continueToApp() {
        await ipcRenderer.invoke('continue-to-app');
    }
}

// Initialize setup manager when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new SetupManager();
});
