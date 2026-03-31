require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { PrismaClient, QueueStatus } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5005;

function gerarTokenMonitor(monitor) {
  return jwt.sign(
    {
      sub: monitor.id,
      institutionId: monitor.institutionId,
      username: monitor.username || monitor.email,
      role: 'MONITOR'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function limparSessoesAoIniciar() {
  await prisma.monitorSession.updateMany({
    where: {
      isOnline: true
    },
    data: {
      isOnline: false,
      endedAt: new Date(),
      lastSeenAt: new Date()
    }
  });
}

async function buscarMonitoresDoBanco(institutionId) {
  if (!institutionId) {
    throw new Error('institutionId não informado em buscarMonitoresDoBanco');
  }

  const monitores = await prisma.user.findMany({
    where: {
      institutionId,
      role: 'MONITOR'
    },
    include: {
      monitorSessions: {
        where: {
          isOnline: true
        },
        orderBy: {
          startedAt: 'desc'
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  });

  return monitores.map((monitor) => {
    const sessaoAtiva = monitor.monitorSessions[0] || null;

    return {
      id: monitor.id,
      name: monitor.name,
      email: monitor.email,
      role: monitor.role,
      institutionId: monitor.institutionId,
      isOnline: !!sessaoAtiva,
      sessaoAtiva: sessaoAtiva
        ? {
            id: sessaoAtiva.id,
            monitoriaId: sessaoAtiva.monitoriaId,
            socketId: sessaoAtiva.socketId,
            startedAt: sessaoAtiva.startedAt,
            lastSeenAt: sessaoAtiva.lastSeenAt,
            createdAt: sessaoAtiva.createdAt,
            updatedAt: sessaoAtiva.updatedAt
          }
        : null
    };
  });
}

async function buscarFilaDoBanco(institutionId) {
  if (!institutionId) {
    throw new Error('institutionId não informado em buscarFilaDoBanco');
  }

  return prisma.queueEntry.findMany({
    where: {
      institutionId,
      status: {
        in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE]
      }
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      monitoria: {
        select: {
          id: true,
          title: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
}

async function obterDadosIniciaisDoBanco(institutionId) {
  const [monitores, fila] = await Promise.all([
    buscarMonitoresDoBanco(institutionId),
    buscarFilaDoBanco(institutionId)
  ]);

  return { monitores, fila };
}

async function emitirEstadoInstituicao(institutionId) {
  const dados = await obterDadosIniciaisDoBanco(institutionId);
  io.to(`institution:${institutionId}`).emit('dados-iniciais', dados);
}

async function registrarSessaoMonitor({ userId, institutionId, monitoriaId, socketId }) {
  if (!userId || !institutionId || !monitoriaId || !socketId) {
    throw new Error('Dados incompletos para registrar sessão do monitor');
  }

  await prisma.monitorSession.updateMany({
    where: {
      monitorId: userId,
      isOnline: true
    },
    data: {
      isOnline: false,
      endedAt: new Date(),
      lastSeenAt: new Date()
    }
  });

  return prisma.monitorSession.create({
    data: {
      monitorId: userId,
      institutionId,
      monitoriaId,
      socketId,
      isOnline: true,
      startedAt: new Date(),
      lastSeenAt: new Date()
    }
  });
}

async function atualizarHeartbeatSessao(socketId) {
  if (!socketId) return;

  await prisma.monitorSession.updateMany({
    where: {
      socketId,
      isOnline: true
    },
    data: {
      lastSeenAt: new Date()
    }
  });
}

async function encerrarSessaoPorSocket(socketId) {
  if (!socketId) return;

  await prisma.monitorSession.updateMany({
    where: {
      socketId,
      isOnline: true
    },
    data: {
      isOnline: false,
      endedAt: new Date(),
      lastSeenAt: new Date()
    }
  });
}

async function verificarTempos() {
  const limite = new Date(Date.now() - 1000 * 60 * 60 * 6);

  try {
    await prisma.queueEntry.updateMany({
      where: {
        status: QueueStatus.CALLED,
        calledAt: { lt: limite }
      },
      data: {
        status: QueueStatus.CANCELED
      }
    });
  } catch {
    await prisma.queueEntry.updateMany({
      where: {
        status: QueueStatus.CALLED,
        calledAt: { lt: limite }
      },
      data: {
        status: QueueStatus.CANCELLED
      }
    });
  }
}

setInterval(() => {
  verificarTempos().catch((err) => {
    console.error('Erro em verificarTempos:', err);
  });
}, 60 * 1000);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/login-monitor', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    const monitor = await prisma.user.findFirst({
      where: {
        username: usuario,
        role: 'MONITOR'
      }
    });

    if (!monitor) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas.'
      });
    }

    const senhaOk = await bcrypt.compare(senha, monitor.passwordHash);

    if (!senhaOk) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas.'
      });
    }

    const token = gerarTokenMonitor(monitor);

    const monitorias = await prisma.monitoria.findMany({
      where: {
        institutionId: monitor.institutionId,
        active: true
      },
      select: {
        id: true,
        title: true
      },
      orderBy: {
        title: 'asc'
      }
    });

    res.json({
      success: true,
      token,
      usuario: monitor.username,
      monitorId: monitor.id,
      institutionId: monitor.institutionId,
      nome: monitor.name,
      monitorias
    });
  } catch (error) {
    console.error('Erro no login-monitor:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno.'
    });
  }
});

app.post('/monitor/session/start', async (req, res) => {
  try {
    const { monitorId, monitoriaId, institutionId, socketId } = req.body;

    const session = await registrarSessaoMonitor({
      userId: monitorId,
      monitoriaId,
      institutionId,
      socketId: socketId || `http-${Date.now()}`
    });

    await emitirEstadoInstituicao(institutionId);

    res.json({ ok: true, session });
  } catch (error) {
    console.error('Erro em /monitor/session/start:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/monitor/session/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    await prisma.monitorSession.update({
      where: { id: sessionId },
      data: {
        isOnline: false,
        endedAt: new Date(),
        lastSeenAt: new Date()
      }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro em /monitor/session/end:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/queue/join', async (req, res) => {
  try {
    const { institutionId, monitoriaId, studentId } = req.body;

    const existente = await prisma.queueEntry.findFirst({
      where: {
        institutionId,
        monitoriaId,
        studentId,
        status: {
          in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE]
        }
      }
    });

    if (existente) {
      return res.status(400).json({
        ok: false,
        error: 'Aluno já está na fila dessa monitoria.'
      });
    }

    const entry = await prisma.queueEntry.create({
      data: {
        institutionId,
        monitoriaId,
        studentId,
        status: QueueStatus.WAITING
      }
    });

    await emitirEstadoInstituicao(institutionId);

    res.json({ ok: true, entry });
  } catch (error) {
    console.error('Erro em /queue/join:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/queue/:monitoriaId', async (req, res) => {
  try {
    const { monitoriaId } = req.params;
    const { institutionId } = req.query;

    const fila = await prisma.queueEntry.findMany({
      where: {
        institutionId,
        monitoriaId,
        status: {
          in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE]
        }
      },
      include: {
        student: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    res.json({ ok: true, fila });
  } catch (error) {
    console.error('Erro em GET /queue/:monitoriaId:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/queue/:monitoriaId/position/:studentId', async (req, res) => {
  try {
    const { monitoriaId, studentId } = req.params;
    const { institutionId } = req.query;

    const fila = await prisma.queueEntry.findMany({
      where: {
        institutionId,
        monitoriaId,
        status: QueueStatus.WAITING
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const posicao = fila.findIndex((item) => item.studentId === studentId);

    res.json({
      ok: true,
      position: posicao >= 0 ? posicao + 1 : null
    });
  } catch (error) {
    console.error('Erro em GET /queue/.../position/...:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/queue/:monitoriaId/next', async (req, res) => {
  try {
    const { monitoriaId } = req.params;
    const { institutionId } = req.body;

    const proximo = await prisma.queueEntry.findFirst({
      where: {
        institutionId,
        monitoriaId,
        status: QueueStatus.WAITING
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (!proximo) {
      return res.json({ ok: true, entry: null });
    }

    const atualizado = await prisma.queueEntry.update({
      where: { id: proximo.id },
      data: {
        status: QueueStatus.CALLED,
        calledAt: new Date()
      }
    });

    await emitirEstadoInstituicao(institutionId);

    res.json({ ok: true, entry: atualizado });
  } catch (error) {
    console.error('Erro em POST /queue/:monitoriaId/next:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/queue/:entryId/start-service', async (req, res) => {
  try {
    const { entryId } = req.params;

    const atualizado = await prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: QueueStatus.IN_SERVICE,
        startedAt: new Date()
      }
    });

    res.json({ ok: true, entry: atualizado });
  } catch (error) {
    console.error('Erro em /queue/:entryId/start-service:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/queue/:entryId/finish', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { notes } = req.body;

    const atual = await prisma.queueEntry.findUnique({
      where: { id: entryId }
    });

    const atualizado = await prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: QueueStatus.FINISHED,
        finishedAt: new Date(),
        notes: notes || null
      }
    });

    if (atual?.institutionId) {
      await emitirEstadoInstituicao(atual.institutionId);
    }

    res.json({ ok: true, entry: atualizado });
  } catch (error) {
    console.error('Erro em /queue/:entryId/finish:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

io.on('connection', async (socket) => {
  console.log('NOVA CONEXÃO SOCKET NO SERVIDOR:', socket.id);

  let institutionId = null;
  let userId = null;
  let userRole = null;
  let monitoriaId = null;

  try {
    institutionId =
      socket.handshake.auth?.institutionId ||
      socket.handshake.query?.institutionId ||
      null;

    userId =
      socket.handshake.auth?.userId ||
      socket.handshake.query?.userId ||
      null;

    userRole =
      socket.handshake.auth?.role ||
      socket.handshake.query?.role ||
      null;

    monitoriaId =
      socket.handshake.auth?.monitoriaId ||
      socket.handshake.query?.monitoriaId ||
      null;

    if (!institutionId) {
      socket.emit('erro', { message: 'institutionId não informado na conexão.' });
      socket.disconnect();
      return;
    }

    socket.data.institutionId = institutionId;
    socket.data.userId = userId;
    socket.data.userRole = userRole;
    socket.data.monitoriaId = monitoriaId;

    socket.join(`institution:${institutionId}`);

    const dadosIniciais = await obterDadosIniciaisDoBanco(institutionId);
    socket.emit('dados-iniciais', dadosIniciais);

    if (userRole === 'MONITOR' && userId && monitoriaId) {
      const sessao = await registrarSessaoMonitor({
        userId,
        institutionId,
        monitoriaId,
        socketId: socket.id
      });

      socket.data.sessionId = sessao.id;
      await emitirEstadoInstituicao(institutionId);
    }

    socket.on('heartbeat', async () => {
      try {
        await atualizarHeartbeatSessao(socket.id);
      } catch (error) {
        console.error('Erro no heartbeat:', error);
      }
    });

    socket.on('monitor:online', async (payload = {}) => {
      try {
        const resolvedInstitutionId = payload.institutionId || socket.data.institutionId;
        const resolvedUserId = payload.userId || socket.data.userId;
        const resolvedMonitoriaId = payload.monitoriaId || socket.data.monitoriaId;

        const sessao = await registrarSessaoMonitor({
          userId: resolvedUserId,
          institutionId: resolvedInstitutionId,
          monitoriaId: resolvedMonitoriaId,
          socketId: socket.id
        });

        socket.data.sessionId = sessao.id;
        socket.data.monitoriaId = resolvedMonitoriaId;

        await emitirEstadoInstituicao(resolvedInstitutionId);
      } catch (error) {
        console.error('Erro em monitor:online:', error);
        socket.emit('erro', { message: error.message });
      }
    });

    socket.on('monitor:offline', async () => {
      try {
        await encerrarSessaoPorSocket(socket.id);
        if (socket.data.institutionId) {
          await emitirEstadoInstituicao(socket.data.institutionId);
        }
      } catch (error) {
        console.error('Erro em monitor:offline:', error);
      }
    });

    socket.on('fila:atualizar', async () => {
      try {
        if (socket.data.institutionId) {
          await emitirEstadoInstituicao(socket.data.institutionId);
        }
      } catch (error) {
        console.error('Erro em fila:atualizar:', error);
      }
    });

    socket.on('disconnect', async (reason) => {
      console.log(`SOCKET DESCONECTADO: ${socket.id} | motivo: ${reason}`);

      try {
        await encerrarSessaoPorSocket(socket.id);

        if (socket.data.institutionId) {
          await emitirEstadoInstituicao(socket.data.institutionId);
        }
      } catch (error) {
        console.error('Erro ao tratar disconnect:', error);
      }
    });
  } catch (error) {
    console.error('Erro na conexão inicial:', error);
    try {
      socket.emit('erro', { message: error.message || 'Erro interno ao iniciar conexão.' });
    } catch {}
    socket.disconnect();
  }
});

async function startServer() {
  try {
    await limparSessoesAoIniciar();

    server.listen(PORT, () => {
      console.log(`SERVIDOR INICIADO NA PORTA ${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();