# Contributing to Pribado

Thank you for your interest in contributing to Pribado! This document provides guidelines and steps for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

---

## Getting Started

### Prerequisites

- Node.js v20+
- npm v10+
- Git

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/pribado.git
   cd pribado
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/pribado/pribado.git
   ```

---

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/pribado/pribado/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Screenshots if applicable

### Suggesting Features

1. Check existing [Issues](https://github.com/pribado/pribado/issues) and [Discussions](https://github.com/pribado/pribado/discussions)
2. Create a new issue with the `enhancement` label
3. Describe:
   - The problem you're trying to solve
   - Your proposed solution
   - Alternative solutions you've considered

### Submitting Code

1. Find an issue to work on, or create one
2. Comment on the issue to let others know you're working on it
3. Create a branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Make your changes
5. Write/update tests if applicable
6. Submit a pull request

---

## Pull Request Process

1. **Update your branch** with the latest from main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure your code passes all checks**:
   ```bash
   npm run lint
   npm run build
   ```

3. **Write a clear PR description**:
   - What does this PR do?
   - Why is this change needed?
   - Link to related issues

4. **Request review** from maintainers

5. **Address feedback** promptly

6. **Squash commits** if requested

---

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
cp .env.local.example .env.local
```

Generate a secret for local development:
```bash
echo "ENCLAVE_SECRET=$(openssl rand -hex 32)" >> .env.local
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Start Chat Server (Optional)

```bash
ENCLAVE_SECRET=your_secret node server/runChatServer.js
```

---

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Define types for all function parameters and return values

### Naming Conventions

- **Files**: `camelCase.ts` or `PascalCase.tsx` for components
- **Variables/Functions**: `camelCase`
- **Components**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

### Code Style

- Use 4 spaces for indentation
- Use single quotes for strings
- Always use semicolons
- Max line length: 120 characters

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

feat: add new feature
fix: fix a bug
docs: update documentation
style: formatting changes
refactor: code restructuring
test: add tests
chore: maintenance tasks
```

Examples:
```
feat(api): add rate limiting to proxy endpoint
fix(chat): resolve duplicate user issue on reconnect
docs(readme): update self-hosting instructions
```

---

## Security Vulnerabilities

If you discover a security vulnerability, please do **NOT** open a public issue. Instead, email security@pribado.dev with details.

---

## Questions?

- Open a [Discussion](https://github.com/pribado/pribado/discussions)
- Join our [Discord](https://discord.gg/pribado) (if available)

---

Thank you for contributing! 🎉
