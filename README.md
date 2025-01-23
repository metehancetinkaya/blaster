# Mobile Web Tester

A command-line tool for testing websites on iOS and Android simulators.

## Features

- Test websites on iOS Simulator and Android Emulator
- Interactive CLI with colored output
- Automatic simulator state detection
- Support for custom device names
- Error handling and helpful error messages
- Modern ES modules architecture
- Proper command-line argument parsing

## Prerequisites

1. Node.js 14 or higher
2. XCode and iOS Simulator installed for iOS testing
3. Android Studio and Android Emulator installed for Android testing
4. macOS operating system

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Make the CLI globally available (optional):
```bash
npm link
```

## Usage

### Using npm start:
```bash
npm start https://example.com
```

### Using the CLI directly (if globally linked):
```bash
mobile-web-test https://example.com
```

### Command-line options:
```bash
Options:
  -V, --version              output version number
  -i, --ios-device <name>    iOS simulator device name (default: "iPhone 12")
  -a, --android-device <name> Android emulator device name (default: "Pixel_3a_API_34_extension_level_7_x86_64")
  -h, --help                 display help for command
```

## Project Structure

```
mobile-web-tester/
├── src/
│   ├── index.js          # Entry point and CLI setup
│   ├── MobileWebTester.js # Main tester class
│   ├── cli.js            # CLI interaction handling
│   └── utils.js          # Utility functions
├── package.json
├── .eslintrc.json
├── .prettierrc
└── README.md
```

## Development

- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier
- `npm test`: Run tests

## Requirements

### iOS Simulator
- XCode must be installed
- At least one iOS Simulator device must be available

### Android Emulator
- Android Studio must be installed
- Android SDK tools must be in PATH
- At least one Android Virtual Device (AVD) must be created

## Error Handling

The tool includes comprehensive error handling for common scenarios:
- Invalid URLs
- Missing simulators
- Failed simulator launches
- Network issues

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT
