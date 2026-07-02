# Contributing to Aeriocode

Thank you for your interest in contributing to Aeriocode. Whether you're fixing a bug, adding a feature, or improving documentation, every contribution helps build a better tool for aerospace and engineering developers.

All contributors must adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Reporting Bugs or Issues

Before creating a new issue, please [search existing ones](https://github.com/aerioapp/aeriocode-vscode-extension/issues) to avoid duplicates.

When reporting a bug, use our [issue templates](https://github.com/aerioapp/aeriocode-vscode-extension/issues/new/choose) to provide the required information.

> **Security vulnerabilities:** If you discover a security vulnerability, please use the [GitHub security tool](https://github.com/aerioapp/aeriocode-vscode-extension/security/advisories/new) to report it privately. Do not open a public issue.

---

## Before Contributing

All contributions must begin with a GitHub Issue, unless the change is for small bug fixes, typo corrections, minor wording improvements, or simple type fixes that don't change functionality.

**For features and contributions:**

1. Check the [Feature Requests](https://github.com/aerioapp/aeriocode-vscode-extension/discussions/categories/feature-requests) for similar ideas
2. If your idea is new, create a feature request
3. Wait for approval from core maintainers before starting implementation
4. Once approved, begin working on a PR

**PRs without approved issues may be closed.**

---

## Deciding What to Work On

Look for issues labeled ["good first issue"](https://github.com/aerioapp/aeriocode-vscode-extension/labels/good%20first%20issue) or ["help wanted"](https://github.com/aerioapp/aeriocode-vscode-extension/labels/help%20wanted) for areas where we need help.

We also welcome contributions to our [documentation](https://github.com/aerioapp/aeriocode-vscode-extension/tree/main/docs). Start by exploring `/docs` and looking for areas that need improvement.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (version 22 recommended)
- [Git](https://git-scm.com/) with [Git LFS](https://git-lfs.github.com/) support
- [Visual Studio Code](https://code.visualstudio.com/)

### Local Development

1. Clone the repository:

    ```bash
    git clone https://github.com/aerioapp/aeriocode-vscode-extension.git
    cd aeriocode-vscode-extension
    ```

2. Install dependencies:

    ```bash
    npm run install:all
    ```

3. Press `F5` or go to `Run > Start Debugging` to launch a new VS Code window with the extension loaded.

    > You may need to install the [esbuild problem matchers extension](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers) if you run into build issues.

### Linux-specific Setup

VS Code extension tests on Linux require additional system libraries:

```bash
sudo apt update
sudo apt install -y \
  dbus libasound2 libatk-bridge2.0-0 libatk1.0-0 libdrm2 \
  libgbm1 libgtk-3-0 libnss3 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxfixes3 libxkbfile1 libxrandr2 xvfb
```

---

## Creating a Pull Request

### 1. Create a Changeset

Before creating a PR, generate a changeset entry:

```bash
npm run changeset
```

Choose the appropriate version bump:
- `major` — breaking changes (1.0.0 to 2.0.0)
- `minor` — new features (1.0.0 to 1.1.0)
- `patch` — bug fixes (1.0.0 to 1.0.1)

### 2. Run Tests and Format

```bash
npm run test
npm run format:fix
npm run lint
```

### 3. Commit and Push

```bash
git add .
git commit -m "feat: your descriptive message"
git push origin your-branch-name
```

### 4. Create the PR

- Clearly describe what your changes do
- Include steps to test the changes
- List any breaking changes
- Reference relevant issues using #issue-number

### CI Process

When you push, our CI will:
- Run tests and checks
- Changesetbot will comment showing the version impact
- When merged to main, changesetbot creates a Version Packages PR
- When that PR is merged, a new release is published

---

## Code Quality

- Run `npm run lint` to check code style
- Run `npm run format` to format code
- All PRs must pass CI checks (linting and formatting)
- Follow TypeScript best practices and maintain type safety
- Add tests for new features
- Update existing tests if your changes affect them

---

## Commit Guidelines

- Write clear, descriptive commit messages
- Use conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- Reference relevant issues: `fix: resolve terminal timeout (#123)`

---

## Contribution Agreement

By submitting a pull request, you agree that your contributions will be licensed under the same license as the project ([Apache 2.0](LICENSE)).

---

## Questions?

For questions about contributing, open a [discussion](https://github.com/aerioapp/aeriocode-vscode-extension/discussions) or contact us at contact@aerio.bot.
