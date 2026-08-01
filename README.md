# 🤖 AI Technical Interviewer

> **Real-time, voice-interactive technical interviewing platform powered by AI, WebRTC, Deepgram, and Groq.**

---

## 🌟 Overview

**AI Technical Interviewer** is a full-stack, autonomous technical interviewing platform designed to simulate real-world hiring rounds. Candidates participate in dynamic voice-based technical interviews, answer context-aware questions tailored to their actual GitHub projects, write and execute code in an integrated Monaco Editor, and receive instant, comprehensive performance scorecards.

---

## ✨ Key Features

- 🎙️ **Real-Time Voice AI (WebRTC)**: Ultra-low latency, bidirectional audio streaming between the candidate and the AI interviewer using **Werift WebRTC**, **Deepgram STT/TTS**, and **Groq LLM**.
- 🤖 **Context-Aware AI Interviewer**: Powered by Groq (Llama-3), generating adaptive questions based on candidate responses, tech stack, and experience level.
- 🐙 **GitHub Profile Intelligence**: Scrapes and analyzes candidates' GitHub repositories to ask targeted technical questions about their real-world codebases.
- 💻 **Live Monaco Code Editor**: Embedded code editing environment supporting live code submission, logic verification, and Python execution during coding rounds.
- 📊 **Automated Assessment & Scorecard**: Generates post-interview feedback highlighting strengths, improvement areas, code quality, and communication skills.
- 🔐 **Secure Authentication**: User registration and login powered by **JWT tokens**, **bcrypt** password hashing, and **PostgreSQL** state management via **Prisma ORM**.

---

## 📐 System Architecture

```mermaid
graph TD
    subgraph Client ["Client Browser (Frontend)"]
        UI["React 19 + Tailwind CSS"]
        Monaco["Monaco Code Editor"]
        WebRTCClient["WebRTC Microphone / Audio Stream"]
    end

    subgraph Server ["Backend Server (Node.js / Express)"]
        API["Express REST API (Port 2000)"]
        Auth["JWT Auth & Middleware"]
        Scraper["GitHub Profile Scraper"]
        WebRTCServer["Werift WebRTC Server"]
    end

    subgraph External ["External Services & Database"]
        DeepgramSTT["Deepgram STT (Speech-to-Text)"]
        DeepgramTTS["Deepgram TTS (Text-to-Speech)"]
        GroqLLM["Groq Llama-3 (LLM Brain)"]
        DB[(PostgreSQL Database)]
    end

    UI <-->|HTTP / REST API| API
    Monaco <-->|Code Submit & Verify| API
    WebRTCClient <-->|Audio WebRTC RTP| WebRTCServer
    API <-->|Prisma ORM| DB
    API -->|Extract Repos| Scraper
    WebRTCServer <-->|Transcribe Audio| DeepgramSTT
    WebRTCServer <-->|Synthesize Speech| DeepgramTTS
    WebRTCServer <-->|Prompt & Converse| GroqLLM
```

---

## 🛠️ Tech Stack

| Component | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Bun, Tailwind CSS v4, Monaco Editor (`@monaco-editor/react`), Recoil, Sonner, Lucide Icons |
| **Backend** | Node.js, Express v5, TypeScript, Werift (WebRTC), WebSockets (`ws`), Prisma ORM, PostgreSQL |
| **AI / Voice Stack** | **Groq SDK** (Llama-3 LLM reasoning), **Deepgram SDK** (STT transcription & TTS speech synthesis) |
| **Database** | PostgreSQL (supported via Neon DB / AWS RDS) |

---

## 📋 Prerequisites

Before starting locally, ensure you have installed:

- **Node.js** (v18.x or v20.x LTS)
- **Bun** (Recommended for frontend development) or **npm**
- **PostgreSQL Database** (Local instance or free cloud database like [Neon](https://neon.tech/))
- **API Keys**:
  - **Groq API Key**: Get free tier key at [console.groq.com](https://console.groq.com/)
  - **Deepgram API Key**: Get $200 free credits at [console.deepgram.com](https://console.deepgram.com/)

---

## 🚀 How to Start Locally

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ai-interviewer.git
cd ai-interviewer
```

---

### 2️⃣ Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in `backend/`:
   ```env
   PORT=2000
   DEEPGRAM_API_KEY="your_deepgram_api_key"
   GROQ_API_KEY="your_groq_api_key"
   DATABASE_URL="postgresql://user:password@localhost:5432/ai_interviewer?sslmode=require"
   JWT_SECRET="your_jwt_secret_key_here"
   ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
   ```

4. **Run Database Migrations & Prisma Setup**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start the Backend Server**:
   ```bash
   npm run start
   ```
   > Server will start on `http://localhost:2000`.

---

### 3️⃣ Frontend Setup

1. **Open a new terminal window and navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   bun install
   # or: npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in `frontend/`:
   ```env
   VITE_BACKEND_URL=http://localhost:2000
   ```

4. **Start the Frontend Development Server**:
   ```bash
   bun dev
   # or: npm run dev
   ```
   > Frontend will run at `http://localhost:3000`.

---

### 4️⃣ Accessing & Using the App

1. Open `http://localhost:3000` in your web browser.
2. Sign Up for a new account (or Sign In).
3. Enter candidate details (e.g. GitHub URL, Target Job Role, Focus Areas).
4. Allow browser microphone access when prompted.
5. Begin the voice-interactive interview, solve live coding problems in the Monaco Editor, and review your performance evaluation.

---

## 📁 Repository Structure

```
ai-interviewer/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # PostgreSQL database schema
│   ├── src/
│   │   ├── GithubScrape/        # GitHub repo scraping utilities
│   │   ├── services/            # Groq LLM, Deepgram STT & TTS integration
│   │   ├── index.ts             # Express API server & Auth endpoints
│   │   ├── serverWebrtc.ts      # Werift WebRTC audio pipeline
│   │   └── validate.ts          # Request validation
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/          # Interview UI, Monaco Editor, Forms, Auth
│   │   ├── state/               # Recoil global state management
│   │   ├── App.tsx              # Main Routing & UI logic
│   │   └── index.ts             # Bun development entry point
│   ├── package.json
│   └── tailwind.config.js
├── AWS_DEPLOYMENT_GUIDE.md      # AWS EC2 + S3 + CloudFront deployment guide
└── README.md                    # Project documentation
```

---

## ☁️ Deployment

For deploying the application to AWS (EC2 for backend, S3 + CloudFront for frontend, RDS for database), check out the step-by-step guide:

👉 **[AWS Deployment Guide](AWS_DEPLOYMENT_GUIDE.md)**

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).
