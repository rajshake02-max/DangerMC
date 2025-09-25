// index.js - AFK bot + self-ping (2 min default)
// Replace your old index.js with this file.

require('dotenv').config(); // লোকালি .env থেকে পড়ার জন্য (optional)

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const mcDataLib = require('minecraft-data');

const config = require('./settings.json');
const express = require('express');
const fetch = require('node-fetch'); // v2 style
const { v4: uuidv4 } = require('uuid'); // unused but available if needed

const app = express();

// ======= HTTP endpoint for ping (Render/Glitch will use this) =======
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`HTTP server started on port ${PORT}`);
  // Server চালু হলে self-ping শুরু হবে (যদি PING_URL সেট থাকে)
  startSelfPing();
});

// =================== Self-ping configuration ===================
const PING_URL = process.env.PING_URL || ''; // Example: https://dangermc.onrender.com/
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL) || 120000; // default 120000 ms = 2 min

function startSelfPing() {
  if (!PING_URL) {
    console.log('[PING] PING_URL নেই — self-ping disabled.');
    return;
  }
  console.log(`[PING] Self-ping enabled -> ${PING_URL} every ${PING_INTERVAL/1000} sec`);

  const doPing = () => {
    fetch(PING_URL)
      .then(res => {
        console.log(`[PING] ${PING_URL} -> ${res.status}`);
      })
      .catch(err => {
        console.log(`[PING] পিং এরর: ${err.message}`);
      });
  };

  // প্রথমে একবার পিং করে তারপর interval চালানো
  doPing();
  setInterval(doPing, PING_INTERVAL);
}
// ==============================================================


// =================== Bot creation function ===================
function createBot() {
  const botOptions = {
    username: config['bot-account']['username'],
    password: config['bot-account']['password'] || undefined,
    auth: config['bot-account']['type'], // "offline" for cracked
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  };

  console.log('[Bot] Creating bot with options:', {
    username: botOptions.username,
    host: botOptions.host,
    port: botOptions.port,
    version: botOptions.version,
    auth: botOptions.auth
  });

  const bot = mineflayer.createBot(botOptions);

  // Plugins & movement setup
  bot.loadPlugin(pathfinder);
  bot.once('spawn', () => {
    // 안전하게 mcData লোড
    try {
      const mcData = mcDataLib(bot.version);
      const defaultMove = new Movements(bot, mcData);
      bot.pathfinder.setMovements(defaultMove);
    } catch (e) {
      console.log('[WARN] minecraft-data লোড করতে সমস্যা:', e.message);
    }
  });

  bot.settings.colorsEnabled = false;

  // EVENT: spawn
  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    // auto-auth (register/login) -- যদি enabled থাকে
    if (config.utils && config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password || '';
      if (password) {
        console.log('[INFO] Auto-auth: register/login পাঠানো হচ্ছে');
        bot.chat(`/register ${password} ${password}`);
        setTimeout(() => bot.chat(`/login ${password}`), 1500);
      } else {
        console.log('[WARN] auto-auth enabled আছে কিন্তু password খালি।');
      }
    }

    // chat-messages module
    if (config.utils && config.utils['chat-messages'] && config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages'].messages || [];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'] || 60;
        let i = 0;
        setInterval(() => {
          if (messages.length > 0) {
            bot.chat(messages[i]);
            i = (i + 1) % messages.length;
          }
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    // move to configured position
    const pos = config.position || { enabled: false };
    if (pos.enabled) {
      console.log(`[AfkBot] Moving to target (${pos.x}, ${pos.y}, ${pos.z})`);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    // anti-afk: jump/sneak
    if (config.utils && config.utils['anti-afk'] && config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
    }
  });

  // Event handlers
  bot.on('goal_reached', () => {
    console.log('\x1b[32m[AfkBot] Goal reached\x1b[0m', bot.entity && bot.entity.position);
  });

  bot.on('death', () => {
    console.log('\x1b[33m[AfkBot] Died and respawned\x1b[0m', bot.entity && bot.entity.position);
  });

  bot.on('kicked', (reason) => {
    console.log('\x1b[33m[AfkBot] Kicked from server. Reason:\n', reason, '\x1b[0m');
  });

  bot.on('error', (err) => {
    console.log('\x1b[31m[ERROR] ', err.message, '\x1b[0m');
  });

  // auto-reconnect
  if (config.utils && config.utils['auto-reconnect']) {
    bot.on('end', () => {
      const delay = config.utils['auto-recconect-delay'] || 5000;
      console.log(`[AfkBot] Disconnected — reconnecting after ${delay} ms`);
      setTimeout(() => createBot(), delay);
    });
  }
}

// Start bot
createBot();