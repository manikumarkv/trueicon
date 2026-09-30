#!/bin/bash
# Installs dependencies so lint, typecheck and tests work in Claude Code on the web sessions.
set -euo pipefail

# Local sessions manage their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --ignore-scripts: the optional semantic-search dev dependency (@huggingface/transformers ->
# onnxruntime-node) downloads a native binary in its install script, which the web sandbox
# blocks. Nothing else needs install scripts, and the semantic tests skip without the runtime.
npm install --ignore-scripts --no-audit --no-fund
