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

        // Buttons
        this.installXcodeBtn = document.getElementById('install-xcode');
        this.installAndroidBtn = document.getElementById('install-android');
        this.continueBtn = document.getElementById('continue-btn');

        // Progress bars
        this.xcodeProgress = document.getElementById('xcode-progress');
        this.androidProgress = document.getElementById('android-progress');

        // Message
        this.setupMessage = document.getElementById('setup-message');
    }

    initializeEventListeners() {
        // Theme toggle
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

        // Install buttons
        this.installXcodeBtn.addEventListener('click', () => this.installXcode());
        this.installAndroidBtn.addEventListener('click', () => this.installAndroidStudio());
        this.continueBtn.addEventListener('click', () => this.continueToApp());

        // IPC listeners
        ipcRenderer.on('xcode-install-progress', (_, progress) => {
            this.updateProgress('xcode', progress);
        });

        ipcRenderer.on('android-install-progress', (_, progress) => {
            this.updateProgress('android', progress);
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

    updateProgress(type, progress) {
        const progressBar = type === 'xcode' ? this.xcodeProgress : this.androidProgress;
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

    updateContinueButton() {
        const xcodeInstalled = this.xcodeStatus.classList.contains('installed');
        const androidInstalled = this.androidStatus.classList.contains('installed');
        this.continueBtn.disabled = !(xcodeInstalled && androidInstalled);
    }

    async continueToApp() {
        await ipcRenderer.invoke('continue-to-app');
    }
}

// Initialize setup manager when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new SetupManager();
});
