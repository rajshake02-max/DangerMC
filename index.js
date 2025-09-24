require('dotenv').config(); // লোকাল টেস্টের জন্য .env থেকে পড়বে

const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(8000, () => {
  console.log('Server started on port 8000');
});

// --- Ely.by authentication ---
async function getElyAuth(username, password) {
  const clientToken = uuidv4();
  const res = await fetch('https://authserver.ely.by/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: username,
      password: password,
      clientToken: clientToken,
      requestUser: true
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Ely.by auth failed: ${res.status} ${JSON.stringify(err)}`);
  }
  return await res.json();
}

async function createBot() {
  let botConfig = {
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  };

  if (config['bot-account']['type'] === 'ely') {
    console.log('[INFO] Ely.by দিয়ে লগইন করার চেষ্টা হচ্ছে...');
    try {
      const user = process.env.ELY_USER;
      const pass = process.env.ELY_PASS;
      const data = await getElyAuth(user, pass);

      botConfig.username = data.selectedProfile.name;
      botConfig.auth = 'mojang'; // Ely.by Mojang-এর মতো কাজ করে
      botConfig.accessToken = data.accessToken;

      console.log(`[INFO] Ely.by login সফল — ${botConfig.username}`);
    } catch (err) {
      console.error('[ERROR] Ely.by authentication ব্যর্থ:', err.message);
      return;
    }
  } else {
    botConfig.username = config['bot-account']['username'];
    botConfig.password = config['bot-account']['password'];
    botConfig.auth = config['bot-account']['type'];
  }

  const bot = mineflayer.createBot(botConfig);

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Auto-auth চালু');
      const password = config.utils['auto-auth'].password;
      bot.chat(`/register ${password} ${password}`);
      bot.chat(`/login ${password}`);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach((msg) => bot.chat(msg));
      }
    }

    const pos = config.position;
    if (config.position.enabled) {
      console.log(`[Afk Bot] (${pos.x}, ${pos.y}, ${pos.z}) এ যাচ্ছে`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(() => {
        createBot();
      }, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', (reason) =>
    console.log(`[AfkBot] Kicked! Reason: ${reason}`)
  );

  bot.on('error', (err) =>
    console.log(`[ERROR] ${err.message}`)
  );
}

createBot();