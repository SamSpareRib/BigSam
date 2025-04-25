const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

app.post('/ask', async (req, res) => {
  const { question } = req.body;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }]
        })
      }
    );

    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || '无回复';

    res.json({ answer });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ answer: '出错了，请稍后再试。' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
