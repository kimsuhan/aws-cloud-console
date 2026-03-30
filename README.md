# AWS Electron Console

Electron app for AWS profile selection, EC2 listing, and SSM shell sessions.

## MCP setup for Electron DevTools

This project supports the Electron MCP server from `@ohah/electron-mcp-server`.

1. Start the app with remote debugging enabled:

```bash
pnpm dev:mcp
```

2. Ensure your MCP client loads the included project config from [.cursor/mcp.json](/Users/kim/Dev/n_workspace/00_suhan/aws-electron/.cursor/mcp.json), or copy the same server entry into your own MCP config.

3. The app will expose Chrome DevTools Protocol on port `9222` while `ELECTRON_REMOTE_DEBUGGING_PORT=9222` is set.
