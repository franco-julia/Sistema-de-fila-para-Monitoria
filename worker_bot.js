const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const axios = require('axios');

const connection = new IORedis({ host: 'localhost', port: 6379 });

const worker = new Worker('notificacoesBot', async (job) => {
    const { nome, materia, whatsapp } = job.data;

    console.log(`Enviando mensagem para ${nome} (${whatsapp})...`);

    try {
        await axios.post('http://sua-api-whatsapp.com/send', {
            number: whatsapp,
            message: `Olá ${nome}! O monitor de ${materia} está te esperando agora. Por favor, dirija-se à sala.`
        });
    } catch (error) {
        console.error("Erro ao enviar mensagem via Bot:", error.message);
        throw error;
    }
}, { connection });

worker.on('completed', job => console.log(`Notificação enviada: ${job.id}`));