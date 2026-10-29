#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  Finanzverwaltung Pro – Release aus dem Arbeitsordner (für Claude Code)
#
#    bash scripts/release.sh --next      nächste Version anzeigen
#    bash scripts/release.sh --dry-run   alles prüfen, nichts ändern/pushen
#    bash scripts/release.sh             prüfen → +0.0.1 → Commit → Tag → Push
#
#  Voraussetzungen für ein Release (sonst Abbruch):
#   - Branch main, nicht hinter origin/main
#   - CHANGELOG[0].v in src/app.js == neue Version
#   - release-notes/RELEASE-NOTES-<neu>.md vorhanden
#   - node src/check.js . ohne Fehler
#   - keine Nutzerdaten/Token im Commit
#  Der Tag v<neu> startet GitHub Actions (Windows-Build + Release).
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

MODE="${1:-release}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "✗ Kein Git-Repo."; exit 1; }
cd "$ROOT"

say()  { printf '%s\n' "$*"; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

CUR="$(node -p "require('./package.json').version")"
NEXT="$(node -e "const [a,b,c]=process.argv[1].split('.').map(Number);console.log([a,b,c+1].join('.'))" "$CUR")"

if [[ "$MODE" == "--next" ]]; then echo "$NEXT"; exit 0; fi
[[ "$MODE" == "release" || "$MODE" == "--dry-run" ]] || die "Unbekannte Option: $MODE"

say "▶ Release $CUR → $NEXT"

# ── 1. Branch & Remote ───────────────────────────────────────────────
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "main" ]] || die "Nicht auf main (aktuell: $BRANCH)."
git fetch -q origin main || die "git fetch fehlgeschlagen."
BEHIND="$(git rev-list --count HEAD..origin/main)"
[[ "$BEHIND" == "0" ]] || die "Lokal $BEHIND Commit(s) hinter origin/main – erst 'git pull --rebase'."
git rev-parse -q --verify "refs/tags/v$NEXT" >/dev/null && die "Tag v$NEXT existiert lokal schon."
git ls-remote --exit-code --tags origin "refs/tags/v$NEXT" >/dev/null 2>&1 && die "Tag v$NEXT existiert auf GitHub schon."

# ── 2. CHANGELOG & Release-Notes ─────────────────────────────────────
CL_V="$(node -e "
const s=require('fs').readFileSync('src/app.js','utf8');
const i=s.indexOf('const CHANGELOG = [');
if(i<0){console.log('');process.exit(0)}
const m=s.slice(i).match(/\{\s*v:\s*'([^']+)'/);console.log(m?m[1]:'')")"
[[ "$CL_V" == "$NEXT" ]] || die "CHANGELOG[0].v ist '$CL_V', erwartet '$NEXT' – Eintrag in src/app.js ergänzen."
[[ -f "release-notes/RELEASE-NOTES-$NEXT.md" ]] || die "release-notes/RELEASE-NOTES-$NEXT.md fehlt."

# ── 3. Checks ────────────────────────────────────────────────────────
for f in src/app.js src/main.js src/preload.js; do node --check "$f" || die "Syntaxfehler in $f"; done
node src/check.js . > /tmp/fvp-check.log 2>&1 || { cat /tmp/fvp-check.log; die "check.js meldet Fehler."; }
say "✓ check.js sauber"

# ── 4. Keine sensiblen Dateien ───────────────────────────────────────
BAD="$(git status --porcelain --untracked-files=all | awk '{print $NF}' \
  | grep -Ei '(^|/)(data(-[a-z]+)?\.json|data_alt\.json|.*\.json\.prev|backup-.*\.json|gh_token\.txt|.*\.env)$' || true)"
[[ -z "$BAD" ]] || die "Sensible Datei(en) im Arbeitsbaum – nicht committen:
$BAD"

if [[ "$MODE" == "--dry-run" ]]; then
  say "✓ Dry-Run ok – würde committen:"; git status --short; exit 0
fi

# ── 5. Version setzen, Commit, Tag ───────────────────────────────────
node -e "
const fs=require('fs');
for (const f of ['package.json','package-lock.json']) {
  if (!fs.existsSync(f)) continue;
  const j=JSON.parse(fs.readFileSync(f,'utf8'));
  j.version=process.argv[1];
  if (j.packages && j.packages['']) j.packages[''].version=process.argv[1];
  fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n');
}" "$NEXT"

git add -A
git diff --cached --quiet && die "Nichts zu committen."
git commit -q -m "Release $NEXT"
git tag "v$NEXT"
say "✓ Commit + Tag v$NEXT"

# ── 6. Push (Credential Manager, sonst gh_token.txt) ─────────────────
push_all() { git push -q "$1" main && git push -q "$1" "v$NEXT"; }

if push_all origin 2>/dev/null; then
  say "✓ Gepusht (origin)"
else
  TOKEN_FILE=""
  for p in "$ROOT/gh_token.txt" "$ROOT/../gh_token.txt" "/x/Claude/Finanzverwaltung Pro/gh_token.txt"; do
    [[ -f "$p" ]] && { TOKEN_FILE="$p"; break; }
  done
  [[ -n "$TOKEN_FILE" ]] || die "Push fehlgeschlagen und keine gh_token.txt gefunden. Commit+Tag sind lokal – 'git push origin main v$NEXT' manuell."
  TOKEN="$(tr -d '\r\n ' < "$TOKEN_FILE")"
  URL="https://x-access-token:${TOKEN}@github.com/Marco-Conrad-00/FinanzverwaltungPro-.git"
  push_all "$URL" 2>&1 | sed "s/${TOKEN}/***/g" || die "Push mit Token fehlgeschlagen."
  git fetch -q origin
  say "✓ Gepusht (Token)"
fi

say ""
say "🚀 v$NEXT ist auf GitHub. Build: https://github.com/Marco-Conrad-00/FinanzverwaltungPro-/actions"
say "   Release: https://github.com/Marco-Conrad-00/FinanzverwaltungPro-/releases"
