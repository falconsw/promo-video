#!/bin/bash
# Installs the promo-video skill for Claude Code and everything it needs, for whoever runs it:
#   curl -fsSL https://raw.githubusercontent.com/falconsw/promo-video/main/install.sh | bash
# or, from a clone:  ./install.sh   (links that clone instead of cloning again)
# Run it again to update. Overrides: PROMO_VIDEO_REPO (git URL), PROMO_VIDEO_DIR (default ~/.claude/skills/promo-video).
set -euo pipefail

REPO=${PROMO_VIDEO_REPO:-https://github.com/falconsw/promo-video.git}
DIR=${PROMO_VIDEO_DIR:-$HOME/.claude/skills/promo-video}
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
tty_ok() { [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; }

[ "$(uname -s)" = Darwin ] || die "promo-video şimdilik yalnızca macOS (Apple Silicon) destekliyor. Windows ve Linux desteği yakında."
[ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] ||
  say "! Not an Apple Silicon Mac: Whisper (MLX) won't run, so only silent videos will work."

# Homebrew installs everything else. Its installer asks for the password, so it needs a terminal.
if ! command -v brew >/dev/null; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
fi
if ! command -v brew >/dev/null; then
  tty_ok || die "Homebrew is missing. Run this in a terminal first, then this installer again:
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  say "→ Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/tty
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
fi

command -v git >/dev/null || { say "→ git"; brew install git; }
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 22 ]; then
  say "→ Node 22+"
  brew install node || brew upgrade node
  hash -r
  [ "$(node_major)" -ge 22 ] || die "Node 22+ is needed; $(command -v node) is $(node -v). Put Homebrew's node first in PATH."
fi

# The skill itself: a clone this script runs from is linked, otherwise it is cloned (or updated) from REPO.
SRC=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/SKILL.md" ]; then
  SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
fi
mkdir -p "$(dirname "$DIR")"
if [ -n "$SRC" ] && [ "$SRC" != "$(cd "$DIR" 2>/dev/null && pwd -P)" ]; then
  [ -e "$DIR" ] && [ ! -L "$DIR" ] && die "$DIR already exists; move it away or set PROMO_VIDEO_DIR."
  say "→ linking $DIR → $SRC"
  ln -sfn "$SRC" "$DIR"
elif [ -d "$DIR/.git" ]; then
  say "→ updating the skill"
  git -C "$DIR" pull --ff-only --quiet
elif [ -z "$SRC" ]; then
  [ -e "$DIR" ] && die "$DIR already exists and is not a git clone; move it away or set PROMO_VIDEO_DIR."
  say "→ installing the skill into $DIR"
  git clone --quiet --depth 1 "$REPO" "$DIR"
fi

# The rest (ffmpeg, uv, Chrome, npm packages, Whisper, the Gemini key) is the engine's own setup, which Claude can
# also run later. With a terminal the key is asked for hidden there; otherwise a macOS dialog asks.
say "→ tools"
if tty_ok; then node "$DIR/engine/promo.mjs" setup </dev/tty; else node "$DIR/engine/promo.mjs" setup; fi &&
  say "
Ready. In any app's folder, tell Claude Code: \"Bu uygulama için TikTok tanıtım videosu yap\"." ||
  die "
Something is still missing (above). Fix it and run this installer again, or ask Claude to run \`promo.mjs setup\`."
