const express = require('express');
const fs = require('fs');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://your-service.onrender.com

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required. Set it in Render env or .env locally.');

const unitsPath = path.join(__dirname, 'units.json');
if (!fs.existsSync(unitsPath)) throw new Error('units.json not found.');
const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// Helper to send current question
async function sendQuestion(ctx) {
  const s = ctx.session;
  const unit = units[s.unitIndex];
  const q = unit.questions[s.qIndex];

  if (!q) return ctx.reply('Savollar tugadi yoki xatolik yuz berdi.');

  if (q.type === 'mcq') {
    const optionsText = q.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    await ctx.reply(`${unit.title} — Question ${s.qIndex + 1}/${unit.questions.length}:\n\n${q.prompt}\n\n${q.promptUz || ''}\n\n${optionsText}\n\nSend the answer number (e.g. 2).`);
  } else if (q.type === 'open') {
    if (q.direction === 'eng-to-uz') {
      await ctx.reply(`${unit.title} — Question ${s.qIndex + 1}/${unit.questions.length}:\n\nEnglish: ${q.prompt}\n\nPlease write the Uzbek translation.`);
    } else {
      await ctx.reply(`${unit.title} — Question ${s.qIndex + 1}/${unit.questions.length}:\n\nO'zbekcha: ${q.promptUz || q.prompt}\n\nIltimos, inglizchasini yozing.`);
    }
  } else {
    await ctx.reply('Unknown question type.');
  }
}

bot.start((ctx) => {
  ctx.session = {};
  return ctx.reply("Salom! Men unit bo'yicha ingliz-uzbek test botiman. /units bilan bo'limlarni ko'rishingiz mumkin.");
});

bot.command('units', (ctx) => {
  const list = units.map((u, i) => `${i + 1}. ${u.title}`).join('\n');
  return ctx.reply(`Available units:\n\n${list}\n\nStart with: /unit <number> (e.g. /unit 1)`);
});

bot.command('unit', (ctx) => {
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const num = Number(parts[1]);
  if (!num || num < 1 || num > units.length) {
    return ctx.reply(`Please provide a valid unit number. Example: /unit 1\nAvailable: 1..${units.length}`);
  }

  ctx.session.unitIndex = num - 1;
  ctx.session.qIndex = 0;
  ctx.session.score = 0;
  ctx.session.mode = 'quiz';
  ctx.reply(`Unit ${num} started: ${units[num - 1].title}\nLet's begin...`);
  return sendQuestion(ctx);
});

bot.command('stop', (ctx) => {
  if (ctx.session && ctx.session.mode === 'quiz') {
    ctx.session = {};
    return ctx.reply("Quiz stopped. Use /units to choose again or /start to restart.");
  } else {
    return ctx.reply('No quiz is running right now.');
  }
});

bot.on('text', async (ctx) => {
  const s = ctx.session || {};
  if (s.mode !== 'quiz') return ctx.reply("I don't understand. Use /units to see units or /unit <n> to start a quiz.");

  const unit = units[s.unitIndex];
  const q = unit.questions[s.qIndex];
  const answer = (ctx.message.text || '').trim();

  let correct = false;
  if (q.type === 'mcq') {
    const n = Number(answer);
    if (!Number.isFinite(n)) {
      return ctx.reply('Please send the option number, e.g. 2');
    }
    if (n === q.answer) correct = true; // q.answer is 1-based index
  } else if (q.type === 'open') {
    const norm = answer.toLowerCase();
    const accepted = (q.acceptedAnswers || []).map(a => a.toLowerCase());
    if (accepted.includes(norm)) correct = true;
  }

  if (correct) {
    s.score = (s.score || 0) + 1;
    await ctx.reply('To'g'ri ✅');
  } else {
    const correctText = q.type === 'mcq' ? `Correct answer: ${q.answer}. ${q.options[q.answer - 1]}` : `Expected: ${ (q.acceptedAnswers || []).join(' / ') }`;
    await ctx.reply(`Noto'g'ri ❌\n${correctText}`);
  }

  s.qIndex++;
  if (s.qIndex >= unit.questions.length) {
    await ctx.reply(`Unit finished. Your score: ${s.score}/${unit.questions.length}`);
    ctx.session = {};
  } else {
    await sendQuestion(ctx);
  }
});

const app = express();
app.get('/', (req, res) => res.send('Bot service is running'));

// webhook path
const hookPath = `/webhook/${BOT_TOKEN}`;
app.post(hookPath, express.json(), (req, res, next) => bot.webhookCallback(hookPath)(req, res, next));

app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  if (WEBHOOK_URL) {
    const url = `${WEBHOOK_URL}${hookPath}`;
    try {
      await bot.telegram.setWebhook(url);
      console.log('Webhook set to', url);
    } catch (err) {
      console.error('Failed to set webhook:', err);
    }
  } else {
    console.log('WEBHOOK_URL not set — webhook not configured automatically.');
  }
});
