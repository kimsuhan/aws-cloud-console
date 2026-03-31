# Release Guide

## Purpose

This project currently ships releases through a local/manual process. GitHub Actions release automation has been removed for now, so the release operator is expected to build and upload artifacts from a local macOS environment.

This guide is the source of truth for release work. Keep `AGENTS.md` short and point back here.

## Current Release Model

- Source of truth branch: `main`
- Release version source: `package.json`
- Release artifact: macOS ARM64 DMG
- GitHub release creation: manual via `gh`
- Code signing: ad-hoc only for now
- Notarization: not configured

Because notarization is not configured, macOS may still show a Gatekeeper warning. The artifact must at least be internally consistent:

- app bundle passes `codesign --verify`
- DMG passes `hdiutil imageinfo`

## Preconditions

- macOS machine with Xcode command line tools
- `pnpm` installed
- `gh` installed and authenticated
- repo up to date

Useful checks:

```bash
pnpm --version
gh --version
env -u GH_TOKEN gh auth status
git status -sb
```

## Recommended Release Flow

### 1. Land changes in `main`

Use this order:

1. Create or update a feature branch.
2. Open a PR.
3. Merge into `main`.
4. Fast-forward local `main`.

Example:

```bash
git switch main
git pull --ff-only origin main
```

### 2. Bump the version

Update the `version` field in `package.json`.

Current convention:

- `0.1.0`
- `0.1.1`
- `0.2.0`

After bumping:

```bash
pnpm test
pnpm build
```

### 3. Build the app bundle and DMG

Baseline command:

```bash
pnpm dist:mac
```

That creates:

- `release/mac-arm64/AWS Cloud Console.app`
- `release/AWS Cloud Console-<version>-arm64.dmg`

## Important macOS Packaging Note

The raw `electron-builder` output in this repo has previously produced an app bundle that was not safe to distribute as-is. Specifically, the packaged app could fail with broken bundle signature/resource metadata even though the build command succeeded.

Because of that, the current safe release flow is:

1. Build with `pnpm dist:mac`
2. Re-sign the `.app` ad-hoc
3. Re-create the DMG from that re-signed `.app`
4. Verify both app and DMG

### Re-sign the app ad-hoc

```bash
codesign --force --deep --sign - "release/mac-arm64/AWS Cloud Console.app"
```

### Verify the app

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/AWS Cloud Console.app"
```

Expected outcome:

- `valid on disk`
- `satisfies its Designated Requirement`

### Re-create the DMG from the re-signed app

```bash
rm -f "release/AWS Cloud Console-<version>-arm64.dmg"
hdiutil create \
  -srcfolder "release/mac-arm64/AWS Cloud Console.app" \
  -volname "AWS Cloud Console <version>-arm64" \
  -anyowners \
  -nospotlight \
  -format UDZO \
  -imagekey zlib-level=9 \
  -fs APFS \
  "release/AWS Cloud Console-<version>-arm64.dmg"
```

### Verify the DMG

```bash
hdiutil imageinfo "release/AWS Cloud Console-<version>-arm64.dmg"
shasum -a 256 "release/AWS Cloud Console-<version>-arm64.dmg"
```

If you want an extra runtime sanity check:

```bash
hdiutil attach "release/AWS Cloud Console-<version>-arm64.dmg" -nobrowse -quiet
```

Then detach it manually after inspection.

## GitHub Release Creation

Create a GitHub release from `main` using `gh`.

Example:

```bash
env -u GH_TOKEN gh release create "v<version>" \
  "release/AWS Cloud Console-<version>-arm64.dmg#AWS.Cloud.Console-<version>-arm64.dmg" \
  --target main \
  --title "v<version>" \
  --notes "## Summary
- <summary line 1>
- <summary line 2>

## Validation
- pnpm test
- pnpm build
- codesign --verify --deep --strict --verbose=2 release/mac-arm64/AWS Cloud Console.app
- hdiutil imageinfo release/AWS Cloud Console-<version>-arm64.dmg

## Distribution Note
- this macOS build is ad-hoc signed for test distribution and is not notarized"
```

## Existing Release Updates

If a release already exists and only the DMG needs replacement:

```bash
env -u GH_TOKEN gh release upload "v<version>" \
  "release/AWS Cloud Console-<version>-arm64.dmg#AWS.Cloud.Console-<version>-arm64.dmg" \
  --clobber
```

If an old blockmap asset should be removed:

```bash
env -u GH_TOKEN gh release delete-asset "v<version>" "AWS.Cloud.Console-<version>-arm64.dmg.blockmap" -y
```

## Icon Updates Before Release

If the app icon changed, rebuild these before packaging:

- `assets/aws-cloud.png`
- `assets/aws-cloud.iconset/*`
- `assets/aws-cloud.icns`

Do not ship a release if the icon source changed but the generated icon assets were not refreshed.

## Known Limitations

- No Developer ID certificate
- No notarization
- No stapled ticket
- Users may still see Gatekeeper warnings
- Release process depends on a local macOS machine

## Future Automation

When release automation is reintroduced, this document should remain the operational reference. The workflow should only automate the exact validated steps above, not invent a different release path.
