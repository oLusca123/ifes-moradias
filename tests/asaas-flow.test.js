const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = path.join(os.tmpdir(), `ifes-asaas-test-${randomUUID()}.sqlite`);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DATABASE_PATH = dbPath;
process.env.ASAAS_API_KEY = 'test-key';
process.env.ASAAS_ENVIRONMENT = 'sandbox';
process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-token';

const { getPaymentStatus, canTransitionPaymentStatus } = require('../dist/services/AsaasPaymentState.js');
const { asaasRequest, AsaasApiError } = require('../dist/services/AsaasService.js');
const { BancoDeDados } = require('../dist/services/BDConn.js');
const { router } = require('../dist/routers.js');
const { LocacaoController } = require('../dist/controllers/LocacaoController.js');
const { AsaasWebhookController } = require('../dist/controllers/AsaasWebhookController.js');
const { Locacao, LocacaoOperacao, PagamentoAluguel, AsaasWebhookEvent } = require('../dist/models/Locacao.js');
const { Moradia } = require('../dist/models/Moradia.js');
const { Usuario } = require('../dist/models/Usuario.js');

const route = router.stack.find((layer) => layer.route && layer.route.path === '/webhooks/asaas');

test.before(async () => {
  await BancoDeDados.initialize();
  await BancoDeDados.synchronize();
});

test.after(async () => {
  if (BancoDeDados.isInitialized) {
    await BancoDeDados.destroy();
  }
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

test.beforeEach(async () => {
  const repos = [
    BancoDeDados.getRepository(PagamentoAluguel),
    BancoDeDados.getRepository(LocacaoOperacao),
    BancoDeDados.getRepository(Locacao),
    BancoDeDados.getRepository(AsaasWebhookEvent),
    BancoDeDados.getRepository(Moradia),
    BancoDeDados.getRepository(Usuario)
  ];
  for (const repo of repos) {
    await repo.clear();
  }
});

test('Asaas payment states separate CONFIRMED from RECEIVED', () => {
  assert.equal(getPaymentStatus('PAYMENT_CONFIRMED', 'CONFIRMED'), 'CONFIRMED');
  assert.equal(getPaymentStatus('PAYMENT_RECEIVED', 'RECEIVED'), 'RECEIVED');
  assert.equal(getPaymentStatus('PAYMENT_UPDATED', 'CONFIRMED'), 'CONFIRMED');
  assert.equal(getPaymentStatus('PAYMENT_UPDATED', 'RECEIVED'), 'RECEIVED');
});

test('payment status transitions respect official ordering', () => {
  assert.equal(canTransitionPaymentStatus('PENDING', 'CONFIRMED'), true);
  assert.equal(canTransitionPaymentStatus('CONFIRMED', 'RECEIVED'), true);
  assert.equal(canTransitionPaymentStatus('RECEIVED', 'CONFIRMED'), false);
  assert.equal(canTransitionPaymentStatus('PENDING', 'REFUNDED'), true);
  assert.equal(canTransitionPaymentStatus('RECEIVED', 'REFUNDED'), true);
});

test('webhook route remains published under /webhooks/asaas', () => {
  assert.ok(route, 'webhook route must exist');
  assert.equal(route.route.methods.post, true);
});

test('rental pricing remains consistent with the current business rule', () => {
  const result = LocacaoController.calcularCobranca(101);
  assert.equal(result.valorCobrado, 101);
  assert.equal(result.valorAnunciado, 100);
  assert.equal(result.taxaPlataforma, 1);
  assert.equal(result.valorParaDono, 100);
});

test('Asaas validation errors log only safe metadata and codes', async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const logEntries = [];
  const sensitiveValues = [
    'Sensitive Test Name',
    'private.test@example.com',
    '52998224725',
    'wallet_secret_123',
    'api_key_secret_456',
    'private-webhook-token'
  ];

  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      errors: [
        {
          code: 'invalid_split_wallet',
          description: `Validation failed for ${sensitiveValues.join(' ')}`
        },
        { code: 'bad-value', description: 'Value invalid' },
        { code: `invalid-${sensitiveValues[0]}`, description: 'Unsafe code' },
        { code: 'missing-description' }
      ]
    })
  });
  console.error = (...args) => logEntries.push(args.map((arg) =>
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  ).join(' '));

  try {
    await assert.rejects(
      asaasRequest('/subscriptions?externalReference=private-reference', {
        method: 'POST',
        body: { name: sensitiveValues[0], cpfCnpj: sensitiveValues[2] }
      }),
      (error) => {
        assert.ok(error instanceof AsaasApiError);
        assert.equal(error.message, 'O Asaas não conseguiu concluir a solicitação.');
        assert.equal(error.status, 400);
        assert.equal(error.ambiguous, false);
        assert.deepEqual(error.validationCodes, ['invalid_split_wallet', 'bad-value', 'missing-description']);
        return true;
      }
    );

    assert.equal(logEntries.length, 1);
    const log = logEntries[0];
    assert.match(log, /POST/);
    assert.match(log, /\/subscriptions/);
    assert.match(log, /400/);
    assert.match(log, /invalid_split_wallet/);
    assert.match(log, /bad-value/);
    assert.match(log, /missing-description/);
    for (const sensitiveValue of [...sensitiveValues, 'private-reference', 'Validation failed', 'Value invalid']) {
      assert.equal(log.includes(sensitiveValue), false, `log must not include ${sensitiveValue}`);
    }
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('sandbox subscription and Pix QR flow uses mocked Asaas responses only', async () => {
  const locatario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Locatario Sandbox', email: 'sandbox-locatario@test.com', senha: '123', tipo: 'COMUM'
  });
  const proprietario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Proprietario Sandbox', email: 'sandbox-proprietario@test.com', senha: '123',
    tipo: 'PROPRIETARIO', asaasWalletId: 'wallet_test_123'
  });
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Imovel sandbox', preco: 1000, imagem: '/sandbox.jpg',
    proprietarioId: proprietario.id, disponivel: true, demonstracao: false
  });

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const parsedUrl = new URL(String(url));
    let response;
    if (parsedUrl.pathname === '/v3/customers' && options.method === 'POST') {
      response = { id: 'cus_sandbox_1' };
    } else if (parsedUrl.pathname === '/v3/customers') {
      response = { data: [] };
    } else if (parsedUrl.pathname === '/v3/subscriptions' && options.method === 'POST') {
      response = { id: 'sub_sandbox_1' };
    } else if (parsedUrl.pathname === '/v3/subscriptions') {
      response = { data: [] };
    } else if (parsedUrl.pathname === '/v3/subscriptions/sub_sandbox_1/payments') {
      response = { data: [{
        id: 'pay_sandbox_1', value: 1010, status: 'PENDING', dueDate: '2026-12-01'
      }] };
    } else if (parsedUrl.pathname === '/v3/payments/pay_sandbox_1/pixQrCode') {
      response = {
        encodedImage: 'mock-base64-image',
        payload: 'mock-pix-copy-paste',
        expirationDate: '2026-12-01T23:59:59Z'
      };
    } else {
      throw new Error(`Unexpected mocked Asaas request: ${options.method || 'GET'} ${parsedUrl.pathname}`);
    }

    return {
      ok: true,
      status: 200,
      json: async () => response
    };
  };

  try {
    const req = {
      session: { usuarioId: locatario.id },
      params: { moradiaId: String(moradia.id) },
      body: { cpfCnpj: '529.982.247-25' }
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      render(view, data) { this.view = view; this.data = data; return this; },
      send(message) { this.message = message; return this; },
      redirect(location) { this.location = location; return this; },
      sendStatus(code) { this.statusCode = code; return this; }
    };

    await LocacaoController.createRental(req, res);
    assert.match(res.location, /^\/alugueis\/\d+$/);

    const subscriptionRequest = requests.find(({ url, options }) =>
      new URL(url).pathname === '/v3/subscriptions' && options.method === 'POST');
    assert.ok(subscriptionRequest);
    assert.equal(new URL(subscriptionRequest.url).origin, 'https://api-sandbox.asaas.com');
    assert.equal(subscriptionRequest.options.headers.access_token, 'test-key');
    const subscriptionBody = JSON.parse(subscriptionRequest.options.body);
    assert.equal(subscriptionBody.billingType, 'PIX');
    assert.equal(subscriptionBody.cycle, 'MONTHLY');
    assert.equal(subscriptionBody.split[0].walletId, 'wallet_test_123');
    assert.equal(subscriptionBody.split[0].percentualValue, 99);

    const payment = await BancoDeDados.getRepository(PagamentoAluguel).findOneByOrFail({
      asaasPaymentId: 'pay_sandbox_1'
    });
    const pixReq = {
      session: { usuarioId: locatario.id },
      params: { paymentId: String(payment.id) }
    };
    const pixRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      render(view, data) { this.view = view; this.data = data; return this; },
      send(message) { this.message = message; return this; }
    };
    await LocacaoController.pix(pixReq, pixRes);
    assert.equal(pixRes.view, 'pix');
    assert.equal(pixRes.data.pix.payload, 'mock-pix-copy-paste');
    assert.ok(requests.some(({ url }) =>
      new URL(url).pathname === '/v3/payments/pay_sandbox_1/pixQrCode'));

    const webhookPayload = {
      id: 'evt_sandbox_received_1',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_sandbox_1',
        value: 1010,
        status: 'RECEIVED',
        subscription: 'sub_sandbox_1',
        dueDate: '2026-12-01'
      }
    };
    const webhookResponse = () => ({
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      send() { return this; },
      sendStatus(code) { this.statusCode = code; return this; }
    });
    const rejectedWebhookRes = webhookResponse();
    await AsaasWebhookController.webhook({
      header: () => 'wrong-token',
      body: webhookPayload
    }, rejectedWebhookRes);
    assert.equal(rejectedWebhookRes.statusCode, 401);

    const acceptedWebhookRes = webhookResponse();
    await AsaasWebhookController.webhook({
      header: (name) => name === 'asaas-access-token' ? 'webhook-token' : undefined,
      body: webhookPayload
    }, acceptedWebhookRes);
    assert.equal(acceptedWebhookRes.statusCode, 200);
    const savedEvent = await BancoDeDados.getRepository(AsaasWebhookEvent).findOneBy({
      eventId: 'evt_sandbox_received_1'
    });
    assert.equal(savedEvent.result, 'PROCESSED');
    const updatedPayment = await BancoDeDados.getRepository(PagamentoAluguel).findOneByOrFail({
      asaasPaymentId: 'pay_sandbox_1'
    });
    assert.equal(updatedPayment.status, 'RECEIVED');
    const rental = await BancoDeDados.getRepository(Locacao).findOneByOrFail({
      asaasSubscriptionId: 'sub_sandbox_1'
    });
    assert.equal(rental.status, 'ATIVA');
  } finally {
    global.fetch = originalFetch;
  }
});

test('pending rental operations are deduplicated when created concurrently', async () => {
  const locatario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Locatario', email: 'locatario@test.com', senha: '123', tipo: 'COMUM', telefone: '000000000'
  });
  const proprietario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Proprietario', email: 'proprietario@test.com', senha: '123', tipo: 'PROPRIETARIO', telefone: '111111111', asaasWalletId: 'wallet_123'
  });
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Casa teste', preco: 1000, imagem: '/img.jpg', proprietarioId: proprietario.id, disponivel: true, demonstracao: false
  });

  const operations = await Promise.all([
    LocacaoController.getOrCreateOperation(moradia, locatario.id, proprietario.id, 1010),
    LocacaoController.getOrCreateOperation(moradia, locatario.id, proprietario.id, 1010),
    LocacaoController.getOrCreateOperation(moradia, locatario.id, proprietario.id, 1010)
  ]);

  const count = await BancoDeDados.getRepository(LocacaoOperacao).count({ where: { locatarioId: locatario.id, moradiaId: moradia.id } });
  assert.equal(count, 1);
  assert.equal(new Set(operations.map((op) => op.reference)).size, 1);
});

test('webhook deduplicates same event id and reprocesses pending links after locacao linkage', async () => {
  const locatario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Locatario 2', email: 'locatario2@test.com', senha: '123', tipo: 'COMUM'
  });
  const proprietario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Proprietario 2', email: 'proprietario2@test.com', senha: '123', tipo: 'PROPRIETARIO', asaasWalletId: 'wallet_456'
  });
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Casa teste 2', preco: 1400, imagem: '/img2.jpg', proprietarioId: proprietario.id, disponivel: true, demonstracao: false
  });
  const locacao = await BancoDeDados.getRepository(Locacao).save({
    moradiaId: moradia.id,
    locatarioId: locatario.id,
    proprietarioId: proprietario.id,
    asaasCustomerId: 'cus_42',
    asaasSubscriptionId: 'sub_42',
    asaasSubscriptionStatus: 'ACTIVE',
    valorMensal: 1400,
    status: 'AGUARDANDO_PAGAMENTO'
  });

  const payload = {
    id: 'evt_dup_42',
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_42',
      value: 1400,
      status: 'RECEIVED',
      subscription: 'sub_42',
      dueDate: '2026-12-01'
    }
  };
  await BancoDeDados.getRepository(AsaasWebhookEvent).save({
    eventId: 'evt_dup_42',
    eventType: 'PAYMENT_RECEIVED',
    paymentId: 'pay_42',
    subscriptionId: 'sub_42',
    externalReference: null,
    payload: JSON.stringify(payload),
    paymentValue: 1400,
    receivedAt: new Date(),
    processingStartedAt: null,
    processedAt: null,
    lockedUntil: null,
    attemptCount: 0,
    result: 'PENDING_LINK',
    resultDetails: 'Pendente de vinculação da assinatura.'
  });

  await AsaasWebhookController.processPendingEvents();

  const event = await BancoDeDados.getRepository(AsaasWebhookEvent).findOneBy({ eventId: 'evt_dup_42' });
  const pagamento = await BancoDeDados.getRepository(PagamentoAluguel).findOneBy({ asaasPaymentId: 'pay_42' });
  assert.equal(event.result, 'PROCESSED');
  assert.ok(pagamento);
  assert.equal(pagamento.status, 'RECEIVED');
  assert.equal(pagamento.locacaoId, locacao.id);

  const duplicateReq = {
    header: (name) => name === 'asaas-access-token' ? 'webhook-token' : undefined,
    body: payload,
  };
  let statusCode = 200;
  const duplicateRes = {
    status: (code) => { statusCode = code; return duplicateRes; },
    send: () => duplicateRes,
    sendStatus: (code) => { statusCode = code; return duplicateRes; }
  };
  await AsaasWebhookController.webhook(duplicateReq, duplicateRes);
  assert.equal(statusCode, 200);
});
