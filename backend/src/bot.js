import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

export function startBot({ botToken }) {
  const WEBAPP_URL = process.env.WEBAPP_URL;
  if (!WEBAPP_URL) {
    console.warn(
      "WEBAPP_URL is not set (.env). Bot will still run, but /start button won't open the app."
    );
  }

  const bot = new TelegramBot(botToken, { polling: true });

  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const startParam = match?.[1] || "";

    const url = WEBAPP_URL
      ? `${WEBAPP_URL}?startapp=${encodeURIComponent(startParam)}`
      : "";

    const text =
      "PostCoin — тапай конверты UzPost, покупай здания, собирай почасовой доход.\n\n" +
      (WEBAPP_URL
        ? "Нажми кнопку ниже, чтобы открыть Mini App:"
        : "Добавь WEBAPP_URL в .env, чтобы открыть Mini App.");

    const replyMarkup = WEBAPP_URL
      ? {
          inline_keyboard: [
            [
              {
                text: "Открыть PostCoin",
                web_app: { url }
              }
            ]
          ]
        }
      : undefined;

    await bot.sendMessage(chatId, text, { reply_markup: replyMarkup });
  });

  bot.onText(/\/ref/, async (msg) => {
    const chatId = msg.chat.id;
    const me = msg.from;
    if (!me) return;

    const ref = `ref_${me.id}`;
    const botInfo = await bot.getMe();
    const deepLink = `https://t.me/${botInfo.username}?start=${ref}`;

    await bot.sendMessage(chatId, `Твоя реферальная ссылка:\n${deepLink}`);
  });

  console.log("Telegram bot started");
}
