#!/usr/bin/env bash

set -euxo pipefail

# Prevent MSYS from converting paths.
# shellcheck disable=SC2034
MSYS_NO_PATHCONV=1
# shellcheck disable=SC2034
MSYS2_ARG_CONV_EXCL="*"

HASH=$(git rev-parse --short HEAD | xargs)
PACKAGE_NAME=$(node -p -e "require('./package.json').name")
PACKAGE_VERSION=$(node -p -e "/^([^-]+)/.exec(require('./package.json').version)[1]")
TARGET_VERSION="$PACKAGE_VERSION-$HASH"

CURRENT_LATEST=$(npm dist-tag "$PACKAGE_NAME@latest" | xargs | sed 's/latest: //')

npm version "$TARGET_VERSION"
npm publish
npm dist-tag add "$PACKAGE_NAME@$CURRENT_LATEST" latest
git push
git push origin "tags/v$TARGET_VERSION"

set +euxo pipefail
