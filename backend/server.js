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

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error(`Origem não permitida: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      return callback(new Error(`Origem não permitida no socket: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

io.engine.on('connection_error', (err) => {
  console.error('ENGINE SOCKET ERROR');
  console.error('code:', err.code);
  console.error('message:', err.message);
  console.error('context:', err.context);
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend da fila está online.'
  });
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

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
      where: { isOnline: true },
      orderBy: { startedAt: 'desc' }
    },
    monitorias: {
      include: {
        subject: true
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
      monitorias: monitor.monitorias,
      subjects: monitor.monitorias.map(m => m.subject).filter(Boolean),
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
      },
      subject: {
        select: {
          id: true,
          name: true
        }
      },
      module: {
        select: {
          id: true,
          code: true,
          title: true,
          front: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
}

async function obterDadosIniciaisDoBanco(institutionId) {
  const [monitores, fila, historicoBruto] = await Promise.all([
    buscarMonitoresDoBanco(institutionId),
    buscarFilaDoBanco(institutionId),
    prisma.attendanceHistory.findMany({
      where: { institutionId },
      include: {
        monitor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        enteredQueueAt: 'desc'
      },
      take: 300
    })
  ]);

  const historico = historicoBruto.map((item) => ({
    id: item.id,
    nome: item.studentName || 'Aluno',
    turma: item.studentClass || '---',
    materia: item.subjectName || '---',
    modulos: Array.isArray(item.moduleNames) ? item.moduleNames : [],
    atendidoPor: item.monitor?.name || '---',
    nota: item.feedbackRating ?? null,
    inicio: item.startedAt || item.calledAt || item.enteredQueueAt || null,
    fim: item.finishedAt || null,
    duracao:
      typeof item.serviceSeconds === 'number'
        ? Math.max(1, Math.round(item.serviceSeconds / 60))
        : null,
    statusFinal: item.statusFinal || null,
    waitSeconds: item.waitSeconds ?? null,
    serviceSeconds: item.serviceSeconds ?? null
  }));

  return {
    monitores,
    fila,
    historico,
    serverTime: Date.now(),
    config: {
      tempoChegadaMs: 2 * 60 * 1000,
      tempoAtendimentoMs: 15 * 60 * 1000,
      tempoExtraMs: 5 * 60 * 1000
    }
  };
}

async function emitirEstadoInstituicao(institutionId) {
  const dados = await obterDadosIniciaisDoBanco(institutionId);
  io.to(`institution:${institutionId}`).emit('dados-iniciais', dados);
  console.dir(dados, { depth: null });
}

async function registrarSessaoMonitor({ userId, institutionId, monitoriaId, socketId }) {
  if (!userId || !institutionId || !monitoriaId || !socketId) {
    throw new Error('Dados incompletos para registrar sessão do monitor');
  }

  const sessaoExistenteMesmoSocket = await prisma.monitorSession.findUnique({
    where: { socketId }
  });

  if (sessaoExistenteMesmoSocket) {
    return prisma.monitorSession.update({
      where: { socketId },
      data: {
        monitorId: userId,
        institutionId,
        monitoriaId,
        isOnline: true,
        endedAt: null,
        lastSeenAt: new Date()
      }
    });
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
  try {
    const limiteChegada = new Date(Date.now() - 1000 * 60 * 2);

    const atrasados = await prisma.queueEntry.findMany({
      where: {
        status: 'CALLED',
        calledAt: { lt: limiteChegada }
      },
      include: {
        student: true,
        subject: true,
        module: true,
        monitoria: {
          select: {
            id: true,
            title: true,
            monitorId: true,
            institutionId: true
          }
        }
      }
    });

    for (const item of atrasados) {
      const agora = new Date();

      await prisma.queueEntry.update({
        where: { id: item.id },
        data: {
          status: 'WAITING',
          calledAt: null,
          requeuedAt: agora
        }
      });

      console.log('ATRASADOS:', atrasados.map(a => ({
        id: a.id,
        monitoriaId: a.monitoriaId,
        calledAt: a.calledAt
      })));

      await prisma.attendanceHistory.updateMany({
        where: { queueEntryId: item.id },
        data: {
          statusFinal: 'REQUEUED',
          note: 'Aluno não chegou em até 2 minutos e voltou para o final da fila.'
        }
      });

      const waitingEntries = await prisma.queueEntry.findMany({
        where: {
          monitoriaId: item.monitoriaId,
          status: 'WAITING'
        },
        include: {
          student: true,
          subject: true,
          module: true
        }
      });

      if (waitingEntries.length > 0) {
        waitingEntries.sort((a, b) => {
          const tempoA = new Date(a.requeuedAt || a.createdAt).getTime();
          const tempoB = new Date(b.requeuedAt || b.createdAt).getTime();
          return tempoA - tempoB;
        });

        console.log('WAITING ORDENADOS:', waitingEntries.map(e => ({
          id: e.id,
          createdAt: e.createdAt,
          requeuedAt: e.requeuedAt
        })));

        const nextEntry = waitingEntries[0];
        const calledAt = new Date();

        await prisma.queueEntry.update({
          where: { id: nextEntry.id },
          data: {
            status: 'CALLED',
            calledAt
          }
        });

        await prisma.attendanceHistory.updateMany({
          where: { queueEntryId: nextEntry.id },
          data: {
            calledAt,
            statusFinal: 'CALLED'
          }
        });
      }

      await emitirEstadoInstituicao(item.institutionId);
    }
  } catch (error) {
    console.error('Erro em verificarTempos:', error);
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
    const usuario = String(req.body?.usuario || '').trim();
    const senha = String(req.body?.senha || '');

    if (!usuario || !senha) {
      return res.status(400).json({
        success: false,
        message: 'Informe login e senha.'
      });
    }

    const monitor = await prisma.user.findFirst({
      where: {
        role: 'MONITOR',
        username: usuario
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

    await prisma.monitoria.updateMany({
      where: {
        institutionId: monitor.institutionId,
        monitorId: monitor.id
      },
      data: {
        active: true
      }
    });

    const monitorias = await prisma.monitoria.findMany({
      where: {
        institutionId: monitor.institutionId,
        monitorId: monitor.id,
        active: true
      },
      select: {
        id: true,
        title: true,
        subjectId: true
      },
      orderBy: {
        title: 'asc'
      }
    });

    console.log('MONITOR LOGANDO:', monitor.id);
    console.log('MONITORIAS ENCONTRADAS NO LOGIN:', monitorias);

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

app.post('/monitors', async (req, res) => {
  try {
    const { institutionId, nome, usuario, senha, materias = [] } = req.body;

    const name = String(nome || '').trim();
    const username = String(usuario || '').trim();
    const password = String(senha || '');
    const emailValue = `${username}@sem-email.local`;

    if (!institutionId || !name || !username || !password) {
      return res.status(400).json({
        ok: false,
        error: 'institutionId, nome, usuario e senha são obrigatórios.'
      });
    }

    if (!Array.isArray(materias) || materias.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Selecione pelo menos uma matéria.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const existente = await prisma.user.findUnique({
      where: { username }
    });

    if (existente) {
      return res.status(409).json({
        ok: false,
        error: 'Já existe um monitor com esse login.'
      });
    }

    const monitor = await prisma.user.create({
      data: {
        institutionId,
        name,
        username,
        email: emailValue,
        passwordHash,
        role: 'MONITOR',
        active: true
      }
    });

    for (const materia of materias) {
      const titulo = String(materia || '').trim();
      if (!titulo) continue;

      const subject = await prisma.subject.upsert({
        where: { name: titulo },
        update: {},
        create: { name: titulo }
      });

      await prisma.monitorSubject.upsert({
        where: {
          monitorId_subjectId: {
            monitorId: monitor.id,
            subjectId: subject.id
          }
        },
        update: {},
        create: {
          monitorId: monitor.id,
          subjectId: subject.id
        }
      });

      await prisma.monitoria.upsert({
        where: {
          institutionId_monitorId_subjectId: {
            institutionId,
            monitorId: monitor.id,
            subjectId: subject.id
          }
        },
        update: {
          title: titulo
        },
        create: {
          institutionId,
          monitorId: monitor.id,
          subjectId: subject.id,
          title: titulo,
          active: false
        }
      });

      const monitoriaCriada = await prisma.monitoria.upsert({
        where: {
          institutionId_monitorId_subjectId: {
            institutionId,
            monitorId: monitor.id,
            subjectId: subject.id
          }
        },
        update: {
          title: titulo
        },
        create: {
          institutionId,
          monitorId: monitor.id,
          subjectId: subject.id,
          title: titulo,
          active: false
        }
      });

      console.log('MONITORIA CRIADA/VINCULADA:', monitoriaCriada);
    }

    res.status(201).json({ ok: true, monitor });
  } catch (error) {
    console.error('Erro em POST /monitors:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Erro ao cadastrar monitor.'
    });
  }
});

app.get('/monitors/:monitorId/subjects', async (req, res) => {
  try {
    const { monitorId } = req.params;

    const assignments = await prisma.monitorSubject.findMany({
      where: { monitorId },
      include: {
        subject: true
      }
    });

    const uniqueSubjects = [];
    const seen = new Set();

    for (const item of assignments) {
      if (item.subject && !seen.has(item.subject.id)) {
        seen.add(item.subject.id);
        uniqueSubjects.push(item.subject);
      }
    }

    res.json({ ok: true, subjects: uniqueSubjects });
  } catch (error) {
    console.error('Erro em GET /monitors/:monitorId/subjects:', error);
    res.status(500).json({ ok: false, error: 'Erro ao buscar matérias do monitor.' });
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
    const {
      institutionId,
      monitoriaId,
      studentId: studentExternalId,
      subjectId,
      moduleId
    } = req.body || {};

    if (!institutionId || !monitoriaId || !studentExternalId) {
      return res.status(400).json({
        success: false,
        message: 'institutionId, monitoriaId e studentId são obrigatórios.'
      });
    }

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId }
    });

    if (!institution) {
      return res.status(400).json({
        success: false,
        message: 'Instituição inválida.'
      });
    }

    const monitoria = await prisma.monitoria.findUnique({
      where: { id: monitoriaId }
    });

    if (!monitoria) {
      return res.status(400).json({
        success: false,
        message: 'Monitoria inválida.'
      });
    }

    const institutionIdReal = monitoria.institutionId;

    if (monitoria.institutionId !== institutionId) {
      return res.status(400).json({
        success: false,
        message: 'A monitoria não pertence à instituição informada.'
      });
    }

    let subject = null;
    if (subjectId) {
      subject = await prisma.subject.findUnique({
        where: { id: subjectId }
      });

      if (!subject) {
        return res.status(400).json({
          success: false,
          message: 'Matéria inválida.'
        });
      }
    }

    let moduleRecord = null;
    if (moduleId) {
      moduleRecord = await prisma.module.findUnique({
        where: { id: moduleId }
      });

      if (!moduleRecord) {
        return res.status(400).json({
          success: false,
          message: 'Módulo inválido.'
        });
      }

      if (subjectId && moduleRecord.subjectId !== subjectId) {
        return res.status(400).json({
          success: false,
          message: 'O módulo não pertence à matéria selecionada.'
        });
      }
    }

    const usernameAluno = `student_${studentExternalId}`;
    const emailAluno = `${studentExternalId}@sem-email.local`;

    let student = await prisma.user.findFirst({
      where: {
        OR: [
          { username: usernameAluno },
          { email: emailAluno }
        ]
      }
    });

    if (!student) {
      student = await prisma.user.create({
        data: {
          institutionId: institutionIdReal,
          name: `Aluno ${studentExternalId}`,
          username: usernameAluno,
          email: emailAluno,
          passwordHash: '',
          role: 'STUDENT',
          active: true
        }
      });
    }

    if (student.institutionId !== institutionIdReal) {
      return res.status(400).json({
        success: false,
        message: 'O aluno não pertence à mesma instituição da monitoria.'
      });
    }

    const existente = await prisma.queueEntry.findFirst({
      where: {
        institutionId: institutionIdReal,
        monitoriaId,
        studentId: student.id,
        status: {
          in: [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE]
        }
      }
    });

    if (existente) {
      return res.status(400).json({
        success: false,
        message: 'Aluno já está na fila dessa monitoria.'
      });
    }

    console.log('DEBUG create queue', {
      institutionIdFrontend: institutionId,
      institutionIdReal,
      monitoriaId,
      studentExternalId,
      userIdReal: student.id,
      studentInstitutionId: student.institutionId
    });

    const entry = await prisma.queueEntry.create({
      data: {
        institutionId: institutionIdReal,
        monitoriaId,
        studentId: student.id,
        subjectId: subjectId || null,
        moduleId: moduleId || null,
        status: QueueStatus.WAITING
      },
      include: {
        student: true,
        subject: true,
        module: true,
        monitoria: {
          select: {
            id: true,
            title: true,
            monitorId: true,
            institutionId: true
          }
        }
      }
    });

    await prisma.attendanceHistory.create({
      data: {
        studentId: entry.studentId || null,
        queueEntryId: entry.id,
        subjectId: entry.subjectId || null,
        studentName: entry.student?.name || 'Aluno',
        studentPhone: null,
        subjectName: entry.subject?.name || null,
        moduleNames: entry.module ? [entry.module.title] : [],
        statusFinal: 'WAITING',
        enteredQueueAt: entry.createdAt,
        institution: {
          connect: { id: entry.institutionId }
        },
        monitor: {
          connect: { id: entry.monitoria.monitorId }
        }
      }
    });

    await emitirEstadoInstituicao(institutionIdReal);

    res.json({ success: true, entry });
  } catch (error) {
    console.error('Erro em /queue/join:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao entrar na fila.'
    });
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
    const calledAt = new Date();

    const waitingEntries = await prisma.queueEntry.findMany({
      where: {
        monitoriaId,
        status: 'WAITING'
      },
      include: {
        student: true,
        subject: true,
        module: true
      }
    });

    if (!waitingEntries.length) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum aluno aguardando na fila.'
      });
    }

    waitingEntries.sort((a, b) => {
      const tempoA = new Date(a.requeuedAt || a.createdAt).getTime();
      const tempoB = new Date(b.requeuedAt || b.createdAt).getTime();
      return tempoA - tempoB;
    });

    const nextEntry = waitingEntries[0];

    const updatedEntry = await prisma.queueEntry.update({
      where: { id: nextEntry.id },
      data: {
        status: 'CALLED',
        calledAt
      },
      include: {
        student: true,
        subject: true,
        module: true
      }
    });

    await prisma.attendanceHistory.updateMany({
      where: { queueEntryId: nextEntry.id },
      data: {
        calledAt,
        statusFinal: 'CALLED'
      }
    });

    await emitirEstadoInstituicao(updatedEntry.institutionId);

    return res.json({
      success: true,
      entry: updatedEntry
    });
  } catch (error) {
    console.error('Erro em POST /queue/:monitoriaId/next:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao chamar próximo.'
    });
  }
});

app.post('/queue/:entryId/start-service', async (req, res) => {
  try {
    const { entryId } = req.params;
    const startedAt = new Date();

    const entradaAtual = await prisma.queueEntry.findUnique({
      where: { id: entryId }
    });

    if (!entradaAtual) {
      return res.status(404).json({
        success: false,
        message: 'Atendimento não encontrado.'
      });
    }

    const waitSeconds = entradaAtual.createdAt
      ? Math.floor((startedAt - new Date(entradaAtual.createdAt)) / 1000)
      : null;

    const entry = await prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: 'IN_SERVICE',
        startedAt
      }
    });

    await prisma.attendanceHistory.updateMany({
      where: { queueEntryId: entryId },
      data: {
        startedAt,
        statusFinal: 'IN_SERVICE',
        waitSeconds,
      }
    });

    await emitirEstadoInstituicao(entry.institutionId);

    return res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('Erro em /queue/:entryId/start-service:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao confirmar chegada.'
    });
  }
});

app.post('/queue/:entryId/finish', async (req, res) => {
  try {
    const { entryId } = req.params;
    const finishedAt = new Date();

    const entry = await prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: 'FINISHED',
        finishedAt
      }
    });

    const waitSeconds =
      entry.startedAt && entry.createdAt
        ? Math.max(0, Math.floor((new Date(entry.startedAt) - new Date(entry.createdAt)) / 1000))
        : entry.calledAt && entry.createdAt
          ? Math.max(0, Math.floor((new Date(entry.calledAt) - new Date(entry.createdAt)) / 1000))
          : null;

    const serviceSeconds =
      entry.startedAt && finishedAt
        ? Math.max(0, Math.floor((finishedAt - new Date(entry.startedAt)) / 1000))
        : null;

    await prisma.attendanceHistory.updateMany({
      where: { queueEntryId: entryId },
      data: {
        finishedAt,
        statusFinal: 'DONE',
        waitSeconds,
        serviceSeconds,
        note: req.body?.note || null
      }
    });

    await emitirEstadoInstituicao(entry.institutionId);

    res.json({ success: true, entry });

  } catch (error) {
    console.error('Erro em /queue/:entryId/finish:', error);
    res.status(500).json({ success: false, message: 'Erro ao finalizar atendimento.' });
  }
});

app.post('/queue/:entryId/feedback', async (req, res) => {
  try {
    const { entryId } = req.params;
    const { nota, comentario } = req.body || {};

    if (!nota || nota < 1 || nota > 5) {
      return res.status(400).json({
        success: false,
        message: 'Informe uma nota válida de 1 a 5.'
      });
    }

    const entry = await prisma.queueEntry.findUnique({
      where: { id: entryId }
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Atendimento não encontrado.'
      });
    }

    const feedbackAt = new Date();

    const atualizado = await prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        rating: Number(nota),
        feedbackComment: comentario || null,
        feedbackAt
      }
    });

    await prisma.attendanceHistory.updateMany({
      where: { queueEntryId: entryId },
      data: {
        feedbackRating: Number(nota),
        feedbackText: comentario || null
      }
    });

    if (entry.institutionId) {
      await emitirEstadoInstituicao(entry.institutionId);
    }

    return res.json({
      success: true,
      entry: atualizado
    });
  } catch (error) {
    console.error('Erro em /queue/:entryId/feedback:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar feedback.'
    });
  }
});

app.get('/subjects', async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' }
    });

    res.json({ ok: true, subjects });
  } catch (error) {
    console.error('Erro em GET /subjects:', error);
    res.status(500).json({
      ok: false,
      error: 'Erro ao buscar matérias.'
    });
  }
});

app.get('/subjects/:subjectId/modules', async (req, res) => {
  try {
    const { subjectId } = req.params;

    const modules = await prisma.module.findMany({
      where: { subjectId },
      orderBy: [
        { sortOrder: 'asc' },
        { code: 'asc' }
      ]
    });

    res.json({ ok: true, modules });
  } catch (error) {
    console.error('Erro em GET /subjects/:subjectId/modules:', error);
    res.status(500).json({
      ok: false,
      error: 'Erro ao buscar módulos.'
    });
  }
});

app.get('/modules/:moduleId/topics', async (req, res) => {
  try {
    const { moduleId } = req.params;

    const topics = await prisma.topic.findMany({
      where: { moduleId },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ ok: true, topics });
  } catch (error) {
    console.error('Erro em GET /modules/:moduleId/topics:', error);
    res.status(500).json({ ok: false, error: 'Erro ao buscar tópicos.' });
  }
});

app.get('/admin/history', async (req, res) => {
  try {
    const { institutionId, monitorId, status, startDate, endDate } = req.query;

    const where = {};

    if (institutionId) where.institutionId = String(institutionId);
    if (monitorId) where.monitorId = String(monitorId);
    if (status) where.statusFinal = String(status);

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const history = await prisma.attendanceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        monitor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico.'
    });
  }
});

app.get('/admin/history/summary', async (req, res) => {
  try {
    const { institutionId } = req.query;

    const where = {};
    if (institutionId) where.institutionId = String(institutionId);

    const registros = await prisma.attendanceHistory.findMany({
      where,
      select: {
        statusFinal: true,
        waitSeconds: true,
        serviceSeconds: true
      }
    });

    const total = registros.length;
    const finalizados = registros.filter(r => r.statusFinal === 'FINISHED').length;
    const cancelados = registros.filter(r => r.statusFinal === 'CANCELED').length;

    const waits = registros.map(r => r.waitSeconds).filter(v => typeof v === 'number');
    const services = registros.map(r => r.serviceSeconds).filter(v => typeof v === 'number');

    const mediaEspera = waits.length
      ? Math.floor(waits.reduce((a, b) => a + b, 0) / waits.length)
      : 0;

    const mediaAtendimento = services.length
      ? Math.floor(services.reduce((a, b) => a + b, 0) / services.length)
      : 0;

    res.json({
      success: true,
      summary: {
        total,
        finalizados,
        cancelados,
        mediaEspera,
        mediaAtendimento
      }
    });
  } catch (error) {
    console.error('Erro ao buscar resumo do histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar resumo do histórico.'
    });
  }
});

app.get('/coordination/history', async (req, res) => {
  try {
    const {
      institutionId,
      monitorId,
      subjectId,
      status,
      studentName,
      dateFrom,
      dateTo
    } = req.query;

    const where = {};

    if (institutionId) where.institutionId = institutionId;
    if (monitorId) where.monitorId = monitorId;
    if (subjectId) where.subjectId = subjectId;
    if (status) where.statusFinal = status;

    if (studentName) {
      where.studentName = {
        contains: studentName,
        mode: 'insensitive'
      };
    }

    if (dateFrom || dateTo) {
      where.enteredQueueAt = {};
      if (dateFrom) where.enteredQueueAt.gte = new Date(dateFrom);
      if (dateTo) where.enteredQueueAt.lte = new Date(dateTo);
    }

    const historico = await prisma.attendanceHistory.findMany({
      where: { institutionId },
      orderBy: { finishedAt: 'desc' },
      include: {
        monitor: true
      }
    });

    const historicoFormatado = historico.map(item => ({
      nome: item.studentName || 'Aluno',
      turma: item.studentClass || '---',
      materia: item.subjectName || '---',
      modulos: item.moduleNames || [],
      atendidoPor: item.monitor?.name || '---',
      nota: item.feedbackRating || null,
      inicio: item.startedAt || item.calledAt || item.enteredQueueAt || null,
      fim: item.finishedAt || null,
      duracao: item.serviceSeconds != null
        ? Math.round(item.serviceSeconds / 60)
        : null
    }));

    res.json({
      success: true,
      historico,
      historicoFormatado
    });
  } catch (error) {
    console.error('Erro em GET /coordination/history:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico.'
    });
  }
});

app.get('/coordination/history/summary', async (req, res) => {
  try {
    const { institutionId, dateFrom, dateTo } = req.query;

    const where = {};
    if (institutionId) where.institutionId = institutionId;

    if (dateFrom || dateTo) {
      where.enteredQueueAt = {};
      if (dateFrom) where.enteredQueueAt.gte = new Date(dateFrom);
      if (dateTo) where.enteredQueueAt.lte = new Date(dateTo);
    }

    const historico = await prisma.attendanceHistory.findMany({ where });

    const total = historico.length;
    const concluidos = historico.filter(h => h.statusFinal === 'DONE').length;
    const faltas = historico.filter(h => h.statusFinal === 'NO_SHOW').length;

    const esperas = historico
      .filter(h => typeof h.waitSeconds === 'number')
      .map(h => h.waitSeconds);

    const atendimentos = historico
      .filter(h => typeof h.serviceSeconds === 'number')
      .map(h => h.serviceSeconds);

    const mediaEspera = esperas.length
      ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length)
      : 0;

    const mediaAtendimento = atendimentos.length
      ? Math.round(atendimentos.reduce((a, b) => a + b, 0) / atendimentos.length)
      : 0;

    res.json({
      success: true,
      resumo: {
        total,
        concluidos,
        faltas,
        mediaEspera,
        mediaAtendimento
      }
    });
  } catch (error) {
    console.error('Erro em GET /coordination/history/summary:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar resumo.'
    });
  }
});

async function desativarMonitoriasDoMonitor(monitorId, institutionId) {
  const relacoes = await prisma.monitorSubject.findMany({
    where: { monitorId },
    include: { subject: true }
  });

  const titulos = relacoes
    .map(item => item.subject?.name)
    .filter(Boolean);

  if (!titulos.length) return;

  await prisma.monitoria.updateMany({
    where: {
      institutionId,
      monitorId
    },
    data: {
      active: false
    }
  });
}

io.on('connection', async (socket) => {
  console.log('NOVA CONEXÃO SOCKET NO SERVIDOR:', socket.id);
  console.log('AUTH RECEBIDO:', socket.handshake.auth);
  console.log('QUERY RECEBIDA:', socket.handshake.query);

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
      console.error('Socket rejeitado: institutionId não informado.', {
        auth: socket.handshake.auth,
        query: socket.handshake.query
      });
      socket.disconnect(true);
      return;
    }

    socket.data.institutionId = institutionId;
    socket.data.userId = userId;
    socket.data.userRole = userRole;
    socket.data.monitoriaId = monitoriaId;

    socket.join(`institution:${institutionId}`);

    //const dadosIniciais = await obterDadosIniciaisDoBanco(institutionId);
    //socket.emit('dados-iniciais', dadosIniciais);

    socket.emit('dados-iniciais', {
      ok: true,
      message: 'socket conectado'
    });

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

        if (socket.data.userId && socket.data.institutionId) {
          await desativarMonitoriasDoMonitor(socket.data.userId, socket.data.institutionId);
        }

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

    socket.on('disconnect', async () => {
      try {
        await encerrarSessaoPorSocket(socket.id);

        if (socket.data.userId && socket.data.institutionId) {
          await desativarMonitoriasDoMonitor(socket.data.userId, socket.data.institutionId);
        }

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

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`SERVIDOR INICIADO NA PORTA ${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();