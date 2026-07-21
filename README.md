<div align="center">

# Aeriocode

**AI-powered aerospace and engineering coding assistant for VS Code**

</div>

<div align="center">
<table>
<tbody>
<td align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=aerio.Aerio-Code" target="_blank"><strong>Download on VS Marketplace</strong></a>
</td>
<td align="center">
<a href="https://github.com/aerioapp/aeriocode-vscode-extension/discussions/categories/feature-requests?discussions_q=is%3Aopen+category%3A%22Feature+Requests%22+sort%3Atop" target="_blank"><strong>Feature Requests</strong></a>
</td>
<td align="center">
<a href="https://aerio.bot/documentation/aeriocode/getting-started/what-is-aeriocode" target="_blank"><strong>Documentation</strong></a>
</td>
</tbody>
</table>
</div>

---

## What is Aeriocode?

Aeriocode is an AI-powered aerospace and engineering development assistant that integrates with Microsoft Visual Studio Code. It provides an interface between your IDE and LLMs, facilitating the development of safety-critical, avionics, and engineering software — increasing productivity and lowering the barrier to entry for engineers working on complex systems.

Unlike generic AI coding assistants, Aeriocode is purpose-built for aerospace workflows. It understands languages like C, C++, Ada, Python, MATLAB, and Rust — commonly used in avionics, flight dynamics, embedded systems, and simulation environments. Aeriocode accelerates onboarding for new engineers and connects with hundreds of tools through its MCP Marketplace, enabling everything from DO-178C traceability workflows to automated hardware-in-the-loop testing — all through natural language commands.

> Aeriocode is developed based on the [Cline VS Code Extension](https://www.cline.bot).

---

## Features

### Plan and Act Modes

Aeriocode operates in two modes: **Plan mode** for analysis and strategy (read-only), and **Act mode** for implementation (write/execute). This separation ensures deliberate, well-reasoned code changes.

### File Creation and Editing

Aeriocode creates and edits files directly in your editor with a diff view. You can edit or revert changes in the diff view, or provide feedback in chat until you're satisfied. The extension monitors linter and compiler errors, proactively fixing issues like missing imports and syntax errors.

### Terminal Command Execution

Aeriocode executes commands directly in your terminal and monitors their output. This allows it to install packages, run build scripts, deploy applications, manage databases, and execute tests — all while adapting to your dev environment and toolchain.

### Browser Integration

Aeriocode can launch a browser, click elements, type text, and scroll, capturing screenshots and console logs at each step. This enables interactive debugging, end-to-end testing, and visual bug fixing.

### Checkpoints

The extension takes automatic snapshots of your workspace at each step. Use the Compare button to see diffs between snapshots, and the Restore button to roll back to any point — safely exploring different approaches without losing progress.

### @ Mentions

Reference files, folders, problems, terminal output, git changes, and URLs directly in chat:

- **`@file`** — Add a file's contents to context
- **`@folder`** — Add all files in a folder
- **`@problems`** — Add workspace errors and warnings
- **`@url`** — Fetch and convert a URL to markdown
- **`@terminal`** — Add terminal output

### Aeriocode Rules

Create persistent project-level or global guidance files (`.aeriocoderules/`) to customize Aeriocode's behavior for your team's standards, coding conventions, and aerospace compliance requirements.

### MCP (Model Context Protocol) Servers

Extend Aeriocode's capabilities through custom tools. Install community-made servers or ask Aeriocode to create tools tailored to your workflow — from Jira integration to AWS EC2 management to PagerDuty incident tracking.

### Auto Approve

Fine-grained permission controls for file read/edit, command execution, browser use, and MCP servers. Configure what Aeriocode can do automatically and what requires your approval.

---

## Getting Started

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=aerio.Aerio-Code)
2. Sign in with your Aerio account at [aerio.bot](https://aerio.bot)
3. Select your AI model
4. Start coding with natural language commands

For detailed instructions, see the [Getting Started guide](https://aerio.bot/documentation/aeriocode/getting-started/installing-aeriocode).

---

## Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) to get started.

## License

[Aerio Code License © 2026 Aerio](./LICENSE) — source-available, not open source. See [LICENSE](./LICENSE) for redistribution terms.
