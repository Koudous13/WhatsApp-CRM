const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const token = envFile.match(/^TELEGRAM_BOT_TOKEN=(.*)$/m)?.[1]?.trim();
const chatId = envFile.match(/^TELEGRAM_ALERT_CHAT_ID=(.*)$/m)?.[1]?.trim();

fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        chat_id: chatId,
        text: '🚀 *TEST RÉUSSI* — L\'Agent IA BloLab est maintenant connecté à ce groupe Telegram !\n\nVous recevrez ici les alertes dès qu\'un prospect est qualifié.',
        parse_mode: 'Markdown',
    }),
}).then(res => res.json()).then(console.log).catch(console.error);
