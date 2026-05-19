# MIRA Deployment Plan
### Memory Integrated Realtime Agent — End-to-End Implementation Guide

> [!IMPORTANT]
> This is your single source of truth. Complete each phase in order. Do not skip phases.

---

## Phase 0 — Prerequisites & Accounts

Before writing any code, ensure you have the following accounts set up.

| Service | Purpose | Cost | Link |
|---|---|---|---|
| GitHub | Code hosting & CI | Free | [github.com](https://github.com) |
| Vercel | Frontend hosting (Next.js) | Free Tier | [vercel.com](https://vercel.com) |
| Oracle Cloud | Backend VM (FastAPI + Kokoro) | Always Free | [cloud.oracle.com](https://cloud.oracle.com) |
| Groq | Whisper STT API | Free Tier | [console.groq.com](https://console.groq.com) |
| OpenRouter | LLM API (Gemini Flash, DeepSeek, etc) | Free Tier | [openrouter.ai](https://openrouter.ai) |

---

## Phase 1 — Get Your API Keys

### Step 1.1 — Get Groq API Key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up / Log in
3. Navigate to **API Keys** → **Create API Key**
4. Copy the key — it starts with `gsk_`
5. Save it somewhere safe (e.g., a local `.env` file you **do not commit**)

### Step 1.2 — Get OpenRouter API Key
1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up / Log in
3. Navigate to **Keys** → **Create Key**
4. Copy the key — it starts with `sk-or-v1-`
5. Save it alongside your Groq key

---

## Phase 2 — Push Code to GitHub

### Step 2.1 — Create a `.gitignore`
In the root of your MIRA project (`c:\Sagar\Projects\AntiGravityProjects\MIRA`), create a `.gitignore` file:

```
.env
*.db
node_modules/
__pycache__/
.next/
*.pyc
.vercel/
```

### Step 2.2 — Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new)
2. Name it `MIRA`
3. Set it to **Private**
4. Do **not** initialize with README (you already have one)
5. Copy the remote URL (e.g., `https://github.com/YOUR_USERNAME/MIRA.git`)

### Step 2.3 — Push Your Local Code
Open a terminal in `c:\Sagar\Projects\AntiGravityProjects\MIRA` and run:

```bash
git init
git add .
git commit -m "feat: initial MIRA scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/MIRA.git
git push -u origin main
```

---

## Phase 3 — Set Up Oracle Cloud VM

### Step 3.1 — Create an Oracle Cloud Account
1. Go to [cloud.oracle.com](https://cloud.oracle.com) and sign up
2. Use a valid credit card for verification (you will NOT be charged on the Always Free tier)
3. Wait for the account to be provisioned (can take up to 10 minutes)

### Step 3.2 — Create an Ampere A1 VM Instance
1. In the Oracle Cloud Console, go to **Compute** → **Instances** → **Create Instance**
2. Choose a name: `mira-backend`
3. Under **Image**, select **Ubuntu 22.04** (Canonical)
4. Under **Shape**, click **Change Shape** → Select **Ampere** (ARM) → Choose `VM.Standard.A1.Flex`
5. Set **OCPUs**: `4` and **RAM**: `24 GB` (this is always free)
6. Under **Add SSH Keys**, upload your public SSH key or let Oracle generate one for you and download it
7. Click **Create**

### Step 3.3 — Configure the VM Firewall (Security List)
1. In the Oracle Console, go to **Networking** → **Virtual Cloud Networks** → Your VCN → **Security Lists**
2. Edit the default security list and add the following **Ingress Rules**:

| Protocol | Source | Port | Description |
|---|---|---|---|
| TCP | `0.0.0.0/0` | `80` | HTTP (Nginx) |
| TCP | `0.0.0.0/0` | `443` | HTTPS |
| TCP | `0.0.0.0/0` | `8000` | FastAPI (direct, for testing) |

### Step 3.4 — SSH Into Your VM
```bash
ssh -i /path/to/your/private-key ubuntu@YOUR_ORACLE_VM_PUBLIC_IP
```

### Step 3.5 — Install Docker on the VM
Run the following on your VM:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git
sudo usermod -aG docker ubuntu
newgrp docker
```

Verify Docker works:
```bash
docker run hello-world
```

---

## Phase 4 — Deploy Backend & Kokoro on Oracle VM

### Step 4.1 — Clone Your GitHub Repo to the VM
```bash
sudo mkdir /opt/mira
sudo chown ubuntu:ubuntu /opt/mira
git clone https://github.com/YOUR_USERNAME/MIRA.git /opt/mira
cd /opt/mira
```

### Step 4.2 — Create Your `.env` File on the VM
```bash
cp .env.example .env
nano .env
```
Fill in your actual values:
```
GROQ_API_KEY=gsk_YOUR_KEY_HERE
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY_HERE
KOKORO_BASE_URL=http://kokoro:8880/v1
```
Press `Ctrl+X`, `Y`, `Enter` to save.

### Step 4.3 — Pull Docker Images and Start Services
```bash
cd /opt/mira
docker-compose pull
docker-compose up -d
```
This will:
- Pull and start **Kokoro TTS** (CPU version)
- Build and start your **FastAPI backend**
- Start **Nginx** as a reverse proxy

> [!NOTE]
> The first `docker-compose pull` for Kokoro may take 5–10 minutes as it downloads the model weights. Subsequent starts are instant.

### Step 4.4 — Verify Services Are Running
```bash
docker-compose ps
```
You should see `backend`, `kokoro`, and `nginx` all with status `Up`.

Test the backend directly:
```bash
curl http://localhost:8000/
# Expected: {"status":"MIRA Backend Running"}
```

Test that Kokoro is reachable:
```bash
curl http://localhost:8880/v1/audio/speech -d '{"model":"kokoro","input":"hello","voice":"af_heart"}' -o test.mp3
```

### Step 4.5 — Register as a Systemd Service (Auto-Start on Reboot)
```bash
sudo cp /opt/mira/infra/systemd/mira.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mira
sudo systemctl start mira
sudo systemctl status mira
```

---

## Phase 5 — Deploy Frontend to Vercel

### Step 5.1 — Get Your Oracle VM Public IP
In the Oracle Console → **Compute** → **Instances** → Click your `mira-backend` instance → Copy the **Public IP Address**.

### Step 5.2 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account
2. Click **Add New Project** → Import your `MIRA` repository
3. In the **Configure Project** step:
   - **Framework Preset**: Should auto-detect as `Next.js`
   - **Root Directory**: Click **Edit** → Set to `frontend`
4. Expand **Environment Variables** and add:
   - Key: `NEXT_PUBLIC_BACKEND_URL`
   - Value: `ws://YOUR_ORACLE_VM_PUBLIC_IP/ws`
5. Click **Deploy**

### Step 5.3 — Verify Frontend Deployment
1. Vercel will give you a URL like `https://mira-xyz.vercel.app`
2. Open it in your browser
3. Click the **Settings** button in the bottom right
4. Enter your **Groq API Key** and **OpenRouter API Key**
5. Click **Save** — keys are stored in your browser's localStorage

---

## Phase 6 — End-to-End Test

### Step 6.1 — Test the Full Pipeline
1. Open your Vercel frontend URL
2. The status indicator should show **Connected** (green dot)
3. If it shows Disconnected:
   - Check your Oracle VM is running: `sudo systemctl status mira`
   - Make sure port 80 is open in Oracle's firewall (Step 3.3)
   - Verify the `NEXT_PUBLIC_BACKEND_URL` matches your Oracle IP

### Step 6.2 — Test Voice Conversation
1. Click the microphone / center orb to start speaking
2. Say something to MIRA
3. Watch the transcript box update
4. MIRA should respond via voice audio

---

## Phase 7 — Optional: HTTPS & Custom Domain

> [!TIP]
> For a polished demo, set up HTTPS so browsers don't block microphone access on non-localhost origins.

### Step 7.1 — Point a Domain to Your Oracle VM
1. Buy/use a domain (Namecheap, Cloudflare, etc.)
2. Add an **A Record** pointing to your Oracle VM's public IP

### Step 7.2 — Install Certbot on the VM
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```
Certbot will auto-edit your Nginx config to add SSL.

### Step 7.3 — Update Vercel Environment Variable
Go to Vercel → Your Project → **Settings** → **Environment Variables**:
- Update `NEXT_PUBLIC_BACKEND_URL` to: `wss://yourdomain.com/ws`

Redeploy from the Vercel dashboard.

---

## Ongoing Maintenance

### How to Update the Backend After a Code Change
```bash
# On your local machine
git add .
git commit -m "feat: your update"
git push origin main

# On your Oracle VM
cd /opt/mira
git pull origin main
docker-compose up -d --build
```

### How to View Backend Logs
```bash
sudo journalctl -u mira -f
# OR
cd /opt/mira && docker-compose logs -f backend
```

### How to Restart Services
```bash
sudo systemctl restart mira
```

---

## Summary Checklist

- [ ] Created Groq API Key
- [ ] Created OpenRouter API Key
- [ ] Pushed MIRA code to a GitHub repository
- [ ] Created Oracle Ampere A1 VM (4 OCPUs, 24GB RAM)
- [ ] Opened ports 80, 443, 8000 in Oracle Security List
- [ ] Installed Docker & Docker Compose on Oracle VM
- [ ] Cloned MIRA repo to `/opt/mira` on Oracle VM
- [ ] Created `.env` on Oracle VM with API keys
- [ ] Started services via `docker-compose up -d`
- [ ] Registered MIRA as a systemd service for auto-restart
- [ ] Deployed frontend to Vercel with correct `NEXT_PUBLIC_BACKEND_URL`
- [ ] Entered API keys in the frontend Settings panel
- [ ] Confirmed green "Connected" status in the UI
- [ ] Successfully tested a voice conversation end-to-end
- [ ] (Optional) Set up HTTPS with a custom domain
