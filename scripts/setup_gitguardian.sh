#!/bin/sh
# Setup script to install GitGuardian and install the pre‑push hook
# ---------------------------------------------------------------
# 1. Install ggshield if not already present
if ! command -v ggshield >/dev/null 2>&1; then
  echo "Installing GitGuardian CLI (ggshield)..."
  pip install --user ggshield
else
  echo "ggshield already installed."
fi

# 2. Create the pre‑push hook inside the local .git directory
HOOK_PATH="$(git rev-parse --show-toplevel)/.git/hooks/pre-push"
cat > "$HOOK_PATH" <<'EOF'
#!/bin/sh
# GitGuardian pre‑push hook – abort push if secrets are found
# Scan the whole repository for secrets using ggshield (no colour output)

ggshield secret scan . --no-color
RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "\n✖️  GitGuardian detected potential secrets. Push aborted."
  exit 1
fi
# If scan passes, allow push to proceed
exit 0
EOF
chmod +x "$HOOK_PATH"

echo "GitGuardian pre‑push hook installed successfully."
