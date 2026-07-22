const express = require('express');
const fs = require('fs');
const path = require('path');
const { Telegraf, session, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://your-service.onrender.com

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required. Set it in Render env or .env locally.');

const wordsPath = path.join(__dirname, 'words2.json');
if (!fs.existsSync(wordsPath)) throw new Error('words2.json not found.');
const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));

// build sorted unique units
const unitsSet = Array.from(new Set(words.map(w => Number(w.unit)))).sort((a,b) => a - b);

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

function makeUnitsKeyboard() {
  const buttons = unitsSet.map(u => Markup.button.callback(`${u}`, `unit:${u}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    if (i + 1 < buttons.length) rows.push([buttons[i], buttons[i+1]]);
    else rows.push([buttons[i]]);
  }
  return Markup.inlineKeyboard(rows);
}

function getWordsForUnit(unit) {
  return words.filter(w => Number(w.unit) === Number(unit));
}

function normalizeText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/["'`.,!?;:\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function simpleDistance(a, b) {
  // Levenshtein distance
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  const dp = Array.from({length: la+1}, () => new Array(lb+1).fill(0));
  for (let i=0;i<=la;i++) dp[i][0] = i;
  for (let j=0;j<=lb;j++) dp[0][j] = j;
  for (let i=1;i<=la;i++){
    for (let j=1;j<=lb;j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[la][lb];
}

function isAcceptableAnswer(userAnswer, accepted) {
  const u = normalizeText(userAnswer).replace(/\s+/g,''); // remove spaces for lenient compare
  for (let acc of accepted) {
    const a = normalizeText(acc).replace(/\s+/g,'');
    if (!a) continue;
    if (u === a) return true;
    const dist = simpleDistance(u, a);
    const maxAllowed = Math.max(1, Math.floor(a.length * 0.2));
    if (dist <= maxAllowed) return true;
  }
  return false;
}

async function askRandomWord(ctx) {
  const unit = ctx.session.unit;
  const list = getWordsForUnit(unit);
  if (!list || list.length === 0) {
    await ctx.reply('Bu unit uchun so\'zlar topilmadi.');
    ctx.session = {};
    return;
  }
  // initialize used set
  if (!ctx.session.used) ctx.session.used = [];
  if (ctx.session.used.length >= list.length) {
    await ctx.reply(`Unit tugadi. Sizning natija: ${ctx.session.score || 0}/${list.length}`);
    ctx.session = {};
    return;
  }

  // pick random unused index
  let idx;
  do {
    idx = Math.floor(Math.random() * list.length);
  } while (ctx.session.used.includes(idx));
  ctx.session.used.push(idx);
  ctx.session.currentIndex = idx;

  const item = list[idx];
  // store accepted translations (split by comma)
  const accepted = item.translation.split(',').map(s => s.trim()).filter(Boolean);
  ctx.session.accepted = accepted;

  // send question
  await ctx.replyWithMarkdown(`*${item.word}*\n\nIltimos ushbu so'zni O'zbekchaga tarjima qiling:`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Units', 'menu')]]));
}

bot.start(async (ctx) => {
  ctx.session = {};
  await ctx.reply('Salom! Quyidagi unitlardan birini tanlang:');
  return ctx.reply('Units:', makeUnitsKeyboard());
});

bot.command('units', async (ctx) => {
  ctx.session = {};
  await ctx.reply('Units:', makeUnitsKeyboard());
});

bot.action(/unit:(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const unit = Number(ctx.match[1]);
  ctx.session = { mode: 'quiz', unit, score: 0, used: [] };
  // send first random word
  await askRandomWord(ctx);
});

bot.action('menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = {};
  // edit message if possible
  try {
    if (ctx.editMessageText) {
      await ctx.editMessageText('Units:', makeUnitsKeyboard().reply_markup);
      return;
    }
  } catch (e) {
    // ignore
  }
  return ctx.reply('Units:', makeUnitsKeyboard());
});

bot.on('text', async (ctx) => {
  const s = ctx.session || {};
  if (s.mode !== 'quiz' || typeof s.currentIndex === 'undefined') {
    return ctx.reply("Iltimos pastdagi unit tugmalaridan birini bosing yoki /units buyrug'idan foydalaning.");
  }

  const userAnswer = (ctx.message.text || '').trim();
  // check answer
  const accepted = s.accepted || [];
  const ok = isAcceptableAnswer(userAnswer, accepted);
  if (ok) {
    ctx.session.score = (ctx.session.score || 0) + 1;
    await ctx.reply("To'g'ri ✅");
  } else {
    await ctx.reply(`Noto'g'ri ❌\nTo'g'ri javob: ${accepted[0] || '—'}`);
  }

  // ask next or finish
  setTimeout(() => askRandomWord(ctx).catch(err => console.error(err)), 300);
});

// fallback
bot.on('message', async (ctx) => {
  // other message types
});

const app = express();
app.get('/', (req, res) => res.send('Bot service is running'));

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
