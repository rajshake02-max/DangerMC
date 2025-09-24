const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(8000, () => {
  console.log('Server started on port 8000');
});

function createBot() {
  // offline (cracked) mode config
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'] || undefined,
    auth: config['bot-account']['type'], // "offline" for cracked servers
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Auto-auth enabled');
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
    if (pos.enabled) {
      console.log(`[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})`);
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

  bot.on('goal_reached', () => {
    console.log(`[AfkBot] Bot reached target location ${bot.entity.position}`);
  });

  bot.on('death', () => {
    console.log(`[AfkBot] Bot died and respawned at ${bot.entity.position}`);
  });

  bot.on('kicked', (reason) => {
    console.log(`[AfkBot] Kicked from server. Reason: ${reason}`);
  });

  bot.on('error', (err) => {
    console.log(`[ERROR] ${err.message}`);
  });
}

createBot();