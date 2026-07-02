# Building the Aeriocode VSCode Extension

This document provides detailed instructions on how to build, test, and work with the Aeriocode VSCode extension.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 22 recommended)
- [Git](https://git-scm.com/) with [Git LFS](https://git-lfs.github.com/) support
- [Visual Studio Code](https://code.visualstudio.com/)
- For Linux users: Additional system libraries (see [Linux-specific requirements](#linux-specific-requirements))

## Getting Started

1. Clone the repository with Git LFS:
   ```bash
   git clone https://github.com/your-repo/aeriocode.git
   cd aeriocode
   ```

2. Install dependencies for both the extension and webview UI:
   ```bash
   npm run install:all
   ```
   This command will install dependencies for both the main extension and the webview UI component.

## Building the Extension

### Development Build

For development with source maps and without minification:

```bash
npm run compile
```

This uses esbuild to compile the TypeScript code to JavaScript and places the output in the `dist` directory.

### Production Build

For a production build with minification:

```bash
npm run vscode:prepublish
```

This command runs a production build of both the extension and webview UI.

### Watch Mode

To continuously build the extension as you make changes:

```bash
npm run watch
```

### Building the Webview UI

The webview UI is built using React and Vite. To build just the webview UI:

```bash
npm run build:webview
```

For development of the webview UI with hot reloading:

```bash
npm run dev:webview
```

### Building the Standalone Version

To build the standalone version of the extension:

```bash
npm run compile-standalone
```

This creates a build in the `dist-standalone` directory.

## Running and Debugging

### Running in Development Mode

1. Open the project in VS Code
2. Press `F5` to start debugging

This will launch a new VS Code window with the extension loaded. You can choose different launch configurations from the dropdown in the Run and Debug view:

- **Run Extension (production)**: Runs the extension with production environment settings
- **Run Extension (staging)**: Runs the extension with staging environment settings
- **Run Extension (local)**: Runs the extension with local environment settings
- **Run Extension (Fresh Install Mode)**: Runs the extension in a clean VS Code environment
- **Run aeriocode-core service**: Runs just the core service for the standalone version

## Testing

### Running Unit Tests

```bash
npm run test:unit
```

### Running Integration Tests

```bash
npm run test:integration
```

### Running All Tests

```bash
npm run test
```

### Running Tests with Coverage

```bash
npm run test:coverage
```

### Running End-to-End Tests

```bash
npm run test:e2e
```

For optimized E2E testing (eliminates redundant builds):

```bash
npm run test:e2e:optimal
```

### Running Webview UI Tests

```bash
npm run test:webview
```

## Code Quality Tools

### Type Checking

```bash
npm run check-types
```

### Linting

```bash
npm run lint
```

### Formatting

Check formatting:
```bash
npm run format
```

Fix formatting issues:
```bash
npm run format:fix
```

## Packaging and Publishing

### Creating a VSIX Package

To create a `.vsix` package for manual installation:

```bash
npm vsce package
```
This will generate a `.vsix` file in the project root.

### Publishing to VS Code Marketplace

```bash
npm run publish:marketplace
```

Note: This requires appropriate credentials to be set up.

## Other Useful Commands

### Cleaning the Build

```bash
npm run clean
```

This removes the `dist` and `out` directories.

### Generating Protocol Buffers

```bash
npm run protos
```

### Creating a Changeset

```bash
npm run changeset
```

### Versioning Packages

```bash
npm run version-packages
```

## Project Structure

- `src/`: Main extension source code
- `webview-ui/`: React-based UI for webviews
- `dist/`: Compiled extension output
- `dist-standalone/`: Compiled standalone version output
- `.vscode/`: VS Code configuration files
- `scripts/`: Build and utility scripts
- `eslint-rules/`: Custom ESLint rules

## Linux-specific Requirements

For Linux users, the following system libraries are required:

- `xvfb` for running headless tests
- Additional libraries may be required depending on your distribution

On Debian/Ubuntu:
```bash
sudo apt-get update && sudo apt-get install -y xvfb
```

## Troubleshooting

### Common Issues

1. **Missing dependencies**: Run `npm run install:all` to ensure all dependencies are installed.

2. **Build errors**: Try cleaning the build with `npm run clean` and then rebuilding.

3. **Test failures on Linux**: Ensure `xvfb` is installed for headless testing.

4. **VS Code not recognizing the extension**: Make sure you're running the extension with F5 or using the "Run Extension" launch configuration.

5. **Webview not updating**: Try rebuilding the webview UI with `npm run build:webview`.