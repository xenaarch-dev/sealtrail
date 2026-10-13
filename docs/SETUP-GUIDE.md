# Setup guide: WSL + Claude Code + Claude Design (10 minutes)

## 1. Put the project on WSL (Ubuntu-24.04)
Download `seva-hackathon.zip` from the chat, then in Windows Terminal:
```bash
wsl -d Ubuntu-24.04
mkdir -p ~/projects && cd ~/projects
cp /mnt/c/Users/<YOUR_WINDOWS_USER>/Downloads/seva-hackathon.zip .
unzip seva-hackathon.zip && cd seva-hackathon
node --version        # need 18+. If missing: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
npm test && npm start # open http://localhost:3000 in your Windows browser
```

## 2. Connect it to Claude Code
```bash
cd ~/projects/seva-hackathon
git init && git add -A && git commit -m "SealTrail: hackathon build"
claude                # starts Claude Code in this folder; it reads CLAUDE.md automatically
```
First prompt to give Claude Code:
> Read docs/PRD-claude-code.md. Do task 7.1 (persistence) then 7.2 (browser-side keys). Keep zero dependencies and keep `npm test` green.

## 3. Push to GitHub (judges like a repo link)
```bash
gh repo create xenaarch-dev/sealtrail --public --source=. --push
```

## 4. Claude Design
1. Open Claude, start a new chat, ask for a design (Claude Design).
2. Paste the full contents of `docs/PRD-claude-design.md`.
3. Ask for screens 1–5 plus the pitch hero. Export as images/PDF for your submission deck.

## 5. Submission checklist (do before 2:10)
- [ ] Repo link or zip
- [ ] Screenshot of verdict screen + tamper-detected screen
- [ ] 60-second screen recording of the demo script in README
- [ ] One-line pitch: "SealTrail makes every freight handover co-signed and tamper-evident, so a small operator can prove exactly who held the goods when they broke."
