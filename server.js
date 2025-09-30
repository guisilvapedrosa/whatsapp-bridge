const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3100;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const SELF_API_KEY = process.env.SELF_API_KEY;
const SUPABASE_WEBHOOK_URL = process.env.SUPABASE_WEBHOOK_URL;

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['authorization']?.split(' ')[1];
  if (!apiKey || apiKey !== SELF_API_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
};

app.post('/create-instance', apiKeyAuth, async (req, res) => {
  const { instanceId } = req.body;
  
  if (!instanceId) {
    return res.status(400).json({ error: 'instanceId é obrigatório' });
  }

  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        instanceName: instanceId,
        qrcode: true,
        webhook: {
          url: `${req.protocol}://${req.get('host')}/evolution-webhook`,
          events: ['connection.update', 'messages.upsert']
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Erro ao criar instância');
    }

    res.json({ qrCode: data.qrcode?.base64 || data.qrcode });
  } catch (error) {
    console.error('Erro ao criar instância:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-message', apiKeyAuth, async (req, res) => {
  const { instanceId, to, text } = req.body;

  try {
    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: to,
        text: text
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/instance-control', apiKeyAuth, async (req, res) => {
  const { action, instanceId } = req.body;

  try {
    let endpoint;
    if (action === 'disconnect') {
      endpoint = `/instance/logout/${instanceId}`;
    } else if (action === 'delete') {
      endpoint = `/instance/delete/${instanceId}`;
    } else {
      return res.status(400).json({ error: 'Ação inválida' });
    }

    const response = await fetch(`${EVOLUTION_API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'apikey': EVOLUTION_API_KEY
      }
    });

    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Erro ao controlar instância:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/evolution-webhook', async (req, res) => {
  try {
    res.status(200).json({ received: true });

    await fetch(SUPABASE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SELF_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    console.log('Webhook repassado para Supabase');
  } catch (error) {
    console.error('Erro ao repassar webhook:', error);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor bridge rodando na porta ${PORT}`);
  console.log(`Evolution API: ${EVOLUTION_API_URL}`);
});
