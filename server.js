process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// ТВОИ ОФИЦИАЛЬНЫЕ КЛЮЧИ
const CLIENT_ID = 'l2xDdNRkLBM7CG9O2NGa0xuEi7ctRVNa';
const CLIENT_SECRET = 'ISsUMKktZiqmbhALsTV1lewqkNCD9oDZ';
const REDIRECT_URI = 'https://my-sc-proxy.onrender.com/api/callback';

// База данных в оперативе
const userTokens = {};

// --- 1. АВТОРИЗАЦИЯ ---
app.get('/api/login', (req, res) => {
    const tgId = req.query.tg_id || 'test_user';
    const scAuthUrl = `https://soundcloud.com/connect?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=${tgId}`;
    res.redirect(scAuthUrl);
});

app.get('/api/callback', async (req, res) => {
    const { code, state: tgId } = req.query;
    if (!code) return res.status(400).send('Ошибка: Нет кода авторизации');

    try {
        const tokenResponse = await axios.post('https://api.soundcloud.com/oauth2/token', new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        userTokens[tgId] = tokenResponse.data.access_token;
        console.log(`✅ Токен успешно получен для юзера: ${tgId}`);

        res.send(`
            <body style="background:#121212; color:white; font-family:sans-serif; text-align:center; padding-top:100px;">
                <h1 style="color:#ff5500;">✅ Успешно!</h1><p>Твой SoundCloud подключен. Закрой эту вкладку.</p>
            </body>
        `);
    } catch (error) {
        console.error('❌ Ошибка авторизации:', error.message);
        res.send('<h2 style="color:red; text-align:center;">Ошибка авторизации</h2>');
    }
});

// --- 2. ЛАЙКИ (С новым фиксом) ---
app.get('/api/me/likes', async (req, res) => {
    const tgId = req.query.tg_id || 'test_user';
    const userToken = userTokens[tgId];

    if (!userToken) return res.status(401).json({ error: 'Нужна авторизация' });

    try {
        console.log('Тянем лайки...');
        // Передаем токен прямо в URL — так работает 100%
        const url = `https://api.soundcloud.com/me/favorites?limit=20&oauth_token=${userToken}`;
        const response = await axios.get(url);
        
        console.log(`✅ Лайки загружены! Найдено: ${response.data.length} треков`);
        res.json(response.data);
    } catch (error) {
        console.error('❌ ОШИБКА SC API (Лайки):', error.response ? error.response.status : error.message);
        res.status(500).json({ error: 'Не удалось загрузить медиатеку' });
    }
});

// --- 3. ПОИСК ТРЕКОВ ---
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: 'Нужен параметр q' });

        const scUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${CLIENT_ID}&limit=15`;
        const response = await axios.get(scUrl);
        res.json(response.data.collection);
    } catch (error) {
        console.error('Ошибка поиска:', error.message);
        res.status(500).json({ error: 'Ошибка при поиске' });
    }
});

// --- 4. СТРИМИНГ (ПРОКСИ) ---
app.get('/api/stream/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;

        const trackInfo = await axios.get(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${CLIENT_ID}`);
        const progressiveStream = trackInfo.data.media.transcodings.find(t => t.format.protocol === 'progressive');

        if (!progressiveStream) return res.status(404).json({ error: 'Формат не найден' });

        const streamUrlData = await axios.get(`${progressiveStream.url}?client_id=${CLIENT_ID}`);
        const audioStream = await axios({ method: 'get', url: streamUrlData.data.url, responseType: 'stream' });

        res.setHeader('Content-Type', 'audio/mpeg');
        audioStream.data.pipe(res);
    } catch (error) {
        console.error('Ошибка стриминга:', error.message);
        res.status(500).json({ error: 'Ошибка стриминга' });
    }
});

app.listen(PORT, () => console.log(`🚀 Бэкенд запущен на порту ${PORT}. Готов к работе!`));

