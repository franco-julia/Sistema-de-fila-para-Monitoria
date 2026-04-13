require('dotenv').config();

const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Servidor mínimo funcionando'
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SERVIDOR MÍNIMO NA PORTA ${PORT}`);
});