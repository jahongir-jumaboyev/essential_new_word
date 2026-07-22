# Essential New Word - Telegram quiz bot

This repository contains a simple Telegram bot (Node.js + Telegraf) that quizzes users unit-by-unit with English-Uzbek mixed prompts.

How to run locally

1. Install dependencies:
   npm install

2. Create a .env file or set environment variables:
   BOT_TOKEN=<your-telegram-bot-token>
   WEBHOOK_URL=<your-public-url> (optional for local testing)

3. Start the bot:
   npm start

Notes for Render deployment

1. Push this repo to GitHub (already done).
2. Create a new Web Service on Render and connect the GitHub repo.
   - Build command: npm install
   - Start command: npm start
3. Add Environment variables in Render:
   - BOT_TOKEN = <your Telegram token>
   - WEBHOOK_URL = https://<your-render-service>.onrender.com
4. Deploy. The app will set Telegram webhook automatically on start using WEBHOOK_URL.

Usage

- /start - start the bot
- /units - list available units
- /unit <n> - start unit n (e.g. /unit 1)
- /stop - stop the current quiz

Feel free to modify units.json to add or change questions.
