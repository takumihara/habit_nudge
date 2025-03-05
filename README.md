# HabitNudge

An Electron-based desktop application that helps with habit formation using computer vision.

## Development

### Prerequisites

- Node.js (v14 or later)
- npm

### Setup

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd habitnudge
npm install
```

### Running the Application

To start the application in development mode:

```bash
npm start
```

## Packaging for Distribution

This application can be packaged as a standalone desktop application for different platforms.

### Build for All Platforms

```bash
npm run dist
```

### Build for Specific Platforms

#### macOS

```bash
npm run dist:mac
```

#### Windows

```bash
npm run dist:win
```

#### Linux

```bash
npm run dist:linux
```

### Build Directory Only (without packaging)

```bash
npm run pack
```

The packaged applications will be available in the `dist` directory.

## License

MIT
