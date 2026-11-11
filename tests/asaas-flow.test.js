const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');

const dbPath = path.join(os.tmpdir(), `ifes-asaas-test-${randomUUID()}.sqlite`);
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.DATABASE_PATH = dbPath;
process.env.ASAAS_API_KEY = 'test-key';
process.env.ASAAS_ENVIRONMENT = 'sandbox';
process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-token';
process.env.RENDER_GIT_BRANCH = 'staging-asaas';

const { getPaymentStatus, canTransitionPaymentStatus } = require('../dist/services/AsaasPaymentState.js');
const {
  BARRACAO,
  formatLocalidade,
  getBarracaoSearchPatterns,
  isBarracao
} = require('../dist/services/Localidade.js');
const { asaasRequest, AsaasApiError } = require('../dist/services/AsaasService.js');
const {
  isStagingDemoRentalsEnabled,
  sandboxDemoWalletId
} = require('../dist/services/AsaasSandboxDemoRentals.js');
const { BancoDeDados } = require('../dist/services/BDConn.js');
const { router } = require('../dist/routers.js');
const { LocacaoController } = require('../dist/controllers/LocacaoController.js');
const { MoradiaController } = require('../dist/controllers/MoradiaController.js');
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

test('rental routes continue to require an authenticated session', () => {
  const rentalRoute = router.stack.find((layer) =>
    layer.route && layer.route.path === '/alugueis/contratar/:moradiaId' && layer.route.methods.post);
  assert.ok(rentalRoute, 'rental POST route must exist');
  assert.equal(rentalRoute.route.stack.length, 2);

  let continued = false;
  const response = {
    redirect(location) { this.location = location; return this; }
  };
  rentalRoute.route.stack[0].handle({
    session: {},
    originalUrl: '/alugueis/contratar/1'
  }, response, () => { continued = true; });
  assert.equal(continued, false);
  assert.match(response.location, /^\/login\?/);
});

test('local guide includes emergency, campus, and transport information', () => {
  const information = MoradiaController.getInformacoesUteis();
  const categories = new Set(information.map((item) => item.categoria));
  assert.ok(categories.has('seguranca'));
  assert.ok(categories.has('campus'));
  assert.ok(categories.has('transporte'));
  assert.ok(information.some((item) => item.titulo === 'Emergências'));
  assert.ok(information.some((item) => item.titulo === 'Serviços e avisos do campus'));
  assert.ok(information.some((item) => item.categoria === 'transporte'));
});

test('moradias listing route renders the local guide content', async () => {
  const listingRoute = router.stack.find((layer) =>
    layer.route && layer.route.path === '/moradias' && layer.route.methods.get);
  assert.ok(listingRoute, 'moradias GET route must exist');

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    render(view, data) {
      this.view = view;
      this.data = data;
      this.html = ejs.render(
        fs.readFileSync(path.join(__dirname, '..', 'src', 'views', `${view}.ejs`), 'utf8'),
        data
      );
      return this;
    },
    send(message) { this.message = message; return this; }
  };
  await MoradiaController.list({ query: {}, session: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.view, 'moradias');
  const categories = new Set(response.data.informacoesUteis.map((item) => item.categoria));
  assert.ok(categories.has('seguranca'));
  assert.ok(categories.has('campus'));
  assert.ok(categories.has('transporte'));
  assert.match(response.html, /Emergências/);
  assert.match(response.html, /Serviços e avisos do campus/);
  assert.match(response.html, /Consultar horários de ônibus/);
});

test('local guide region filters keep general emergency, campus, and transport cards visible', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'moradias.ejs'), 'utf8');
  const scriptStart = template.indexOf('        const regionTabs = document.querySelectorAll');
  const scriptEnd = template.indexOf('    </script>', scriptStart);
  assert.notEqual(scriptStart, -1);
  assert.notEqual(scriptEnd, -1);

  const makeTab = (dataset, active = false) => {
    const listeners = {};
    return {
      dataset,
      active,
      listeners,
      classList: {
        toggle(name, force) {
          if (name === 'active') this.owner.active = force;
        },
        owner: null
      },
      addEventListener(name, handler) { listeners[name] = handler; },
      setAttribute() {}
    };
  };
  const regionTabs = [
    makeTab({ region: 'todas' }, true),
    makeTab({ region: BARRACAO }),
    makeTab({ region: 'Patrimônio' })
  ];
  const categoryTabs = [
    makeTab({ category: 'todos' }, true),
    makeTab({ category: 'seguranca' }),
    makeTab({ category: 'campus' }),
    makeTab({ category: 'transporte' })
  ];
  for (const tab of [...regionTabs, ...categoryTabs]) {
    tab.classList.owner = tab;
  }
  const cards = [
    { dataset: { region: 'Geral', category: 'seguranca' }, hidden: false },
    { dataset: { region: 'Geral', category: 'campus' }, hidden: false },
    { dataset: { region: 'Geral', category: 'transporte' }, hidden: false },
    { dataset: { region: BARRACAO, category: 'comercio' }, hidden: false }
  ];
  const document = {
    querySelector(selector) {
      const tabs = selector.startsWith('.guide-region-tab') ? regionTabs : categoryTabs;
      return tabs.find((tab) => tab.active) || null;
    },
    querySelectorAll(selector) {
      if (selector === '.guide-region-tab') return regionTabs;
      if (selector === '.guide-tab') return categoryTabs;
      if (selector === '.guide-card') return cards;
      return [];
    }
  };

  vm.runInNewContext(template.slice(scriptStart, scriptEnd), { document });
  regionTabs[1].listeners.click();
  for (const [index, category] of [[1, 'seguranca'], [2, 'campus'], [3, 'transporte']]) {
    categoryTabs[index].listeners.click();
    const globalCard = cards.find((card) => card.dataset.category === category);
    assert.equal(globalCard.hidden, false, `${category} information should remain visible`);
  }
  assert.equal(cards[3].hidden, true, 'a card for another specific region should remain filtered');
  regionTabs[2].listeners.click();
  categoryTabs[3].listeners.click();
  assert.equal(cards.find((card) => card.dataset.category === 'transporte').hidden, false);
});

test('Barracão is canonical and legacy SJP names normalize to it', () => {
  for (const legacyValue of [
    'Barracão',
    'Barracao',
    'SJP',
    'São João de Petrópolis',
    'Sao Joao de Petropolis',
    'sjp',
    'Região de Barracão',
    'Rua central, São João de Petrópolis, Barracão',
    'Barracão (São João de Petrópolis)',
    'São João de Petrópolis (Barracão), Patrimônio'
  ]) {
    assert.equal(isBarracao(legacyValue), true, legacyValue);
  }
  assert.equal(formatLocalidade('Barracão'), BARRACAO);
  assert.equal(formatLocalidade('São João de Petrópolis'), BARRACAO);
  assert.equal(formatLocalidade('SJP'), BARRACAO);
  assert.equal(formatLocalidade('Região de Barracão'), `Região de ${BARRACAO}`);
  assert.equal(formatLocalidade('Rua central, São João de Petrópolis, Barracão'), `Rua central, ${BARRACAO}`);
  assert.equal(formatLocalidade('Barracão (São João de Petrópolis)'), BARRACAO);
  assert.equal(formatLocalidade('São João de Petrópolis (Barracão), Patrimônio'), `${BARRACAO}, Patrimônio`);
  assert.equal(isBarracao('Patrimônio'), false);
  assert.equal(formatLocalidade('Patrimônio'), 'Patrimônio');
  assert.ok(getBarracaoSearchPatterns().some((pattern) => pattern.includes('barracão')));
  assert.ok(getBarracaoSearchPatterns().some((pattern) => pattern.includes('sjp')));
});

test('property listings search legacy locality values from every supported alias', async () => {
  const repo = BancoDeDados.getRepository(Moradia);
  const barracao = await repo.save({
    titulo: 'Anúncio legado Barracão', preco: 300, imagem: '/barracao.jpg',
    bairro: 'Barracão', localizacao: 'Região de Barracão', demonstracao: false, disponivel: true
  });
  const sjp = await repo.save({
    titulo: 'Anúncio legado SJP', preco: 400, imagem: '/sjp.jpg',
    bairro: 'SJP', localizacao: 'São João de Petrópolis', demonstracao: false, disponivel: true
  });
  const patrimonio = await repo.save({
    titulo: 'Anúncio de outra região', preco: 500, imagem: '/outra.jpg',
    bairro: 'Patrimônio', localizacao: 'Patrimônio', demonstracao: false, disponivel: true
  });
  const santaTeresa = await repo.save({
    titulo: 'Anúncio em Santa Teresa', preco: 600, imagem: '/santa-teresa.jpg',
    bairro: 'Santa Teresa', localizacao: 'Santa Teresa', demonstracao: false, disponivel: true
  });
  const saoRoque = await repo.save({
    titulo: 'Anúncio em São Roque', preco: 700, imagem: '/sao-roque.jpg',
    bairro: 'São Roque', localizacao: 'São Roque', demonstracao: false, disponivel: true
  });

  for (const busca of ['Barracão', 'SJP', 'São João de Petrópolis', 'São João de Petrópolis (Barracão)']) {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      render(view, data) { this.view = view; this.data = data; return this; },
      send(message) { this.message = message; return this; }
    };
    await MoradiaController.list({ query: { busca }, session: {} }, response);
    assert.equal(response.statusCode, 200, busca);
    const matchedTestHomes = response.data.moradias.filter((item) => [barracao.id, sjp.id].includes(item.id));
    assert.deepEqual(
      matchedTestHomes.map((item) => item.id).sort(),
      [barracao.id, sjp.id].sort(),
      `legacy homes should match ${busca}`
    );
    assert.equal(matchedTestHomes.length, 2, `no duplicate or missing homes for ${busca}`);
    assert.equal(response.data.moradias.some((item) => item.bairro === 'Patrimônio'), false);
  }

  for (const [region, expectedId] of [
    ['Patrimônio', patrimonio.id],
    ['Santa Teresa', santaTeresa.id],
    ['São Roque', saoRoque.id]
  ]) {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      render(view, data) { this.view = view; this.data = data; return this; },
      send(message) { this.message = message; return this; }
    };
    await MoradiaController.list({ query: { busca: region }, session: {} }, response);
    assert.equal(response.data.moradias.some((item) => item.id === expectedId), true);
    assert.equal(response.data.moradias.some((item) => [barracao.id, sjp.id].includes(item.id)), false);
  }
});

test('region filters and listing form expose exactly four regions and normalize old values', () => {
  const listingTemplate = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'moradias.ejs'), 'utf8');
  const formTemplate = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'moradia_novo.ejs'), 'utf8');
  const regionFilterMarkup = listingTemplate.slice(
    listingTemplate.indexOf('<div class="guide-region-filters"'),
    listingTemplate.indexOf('</div>', listingTemplate.indexOf('<div class="guide-region-filters"'))
  );
  assert.deepEqual(
    [...regionFilterMarkup.matchAll(/data-region="([^"]+)"/g)].map((match) => match[1]),
    ['todas', 'Santa Teresa', 'Barracão', 'Patrimônio', 'São Roque']
  );
  const cityStripMarkup = listingTemplate.slice(
    listingTemplate.indexOf('<div class="city-strip">'),
    listingTemplate.indexOf('</div>', listingTemplate.indexOf('<div class="city-strip">'))
  );
  assert.deepEqual(
    [...cityStripMarkup.matchAll(/class="city-pill(?: [^"]*)?"[^>]*>([^<]*)/g)].map((match) => match[1].replace(/^[^\p{L}]*/u, '').trim()),
    ['Ver todas as regiões', 'Barracão', 'Santa Teresa', 'Patrimônio', 'São Roque']
  );

  const formHtml = ejs.render(formTemplate, {
    form: { bairro: 'São João de Petrópolis' },
    formatLocalidade,
    erro: null,
    asaasConfigurado: true,
    usuario: null
  });
  assert.equal((formHtml.match(/value="Barracão"/g) || []).length, 1);
  assert.equal((formHtml.match(/value="São João de Petrópolis"/g) || []).length, 0);
  assert.match(formHtml, /value="Barracão" selected/);
  assert.equal((formHtml.match(/value="Santa Teresa"/g) || []).length, 1);
  assert.equal((formHtml.match(/value="Patrimônio"/g) || []).length, 1);
  assert.equal((formHtml.match(/value="São Roque"/g) || []).length, 1);
});

test('legacy locality values render canonically on listing and detail pages', async () => {
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Moradia com bairro legado', preco: 350, imagem: '/legacy.jpg',
    bairro: 'São João de Petrópolis', localizacao: 'Rua principal, Barracão, São João de Petrópolis',
    demonstracao: false, disponivel: true
  });
  const renderResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    render(view, data) {
      this.view = view;
      this.data = data;
      this.html = ejs.render(
        fs.readFileSync(path.join(__dirname, '..', 'src', 'views', `${view}.ejs`), 'utf8'),
        data
      );
      return this;
    },
    send(message) { this.message = message; return this; }
  });

  const listResponse = renderResponse();
  await MoradiaController.list({ query: { busca: 'Barracão' }, session: {} }, listResponse);
  assert.match(listResponse.html, /📍 Barracão<\/span>/);
  assert.equal(listResponse.html.includes('São João de Petrópolis'), false);

  const detailsResponse = renderResponse();
  await MoradiaController.show({ params: { id: String(moradia.id) }, session: {} }, detailsResponse);
  assert.match(detailsResponse.html, /Rua principal, Barracão/);
  assert.equal(detailsResponse.html.includes('São João de Petrópolis'), false);
});

test('staging demo rentals require the sandbox, branch, and explicit flag', () => {
  const originalEnvironment = process.env.ASAAS_ENVIRONMENT;
  const originalFlag = process.env.ASAAS_STAGING_DEMO_RENTALS;
  const originalBranch = process.env.RENDER_GIT_BRANCH;
  try {
    process.env.ASAAS_ENVIRONMENT = 'sandbox';
    process.env.ASAAS_STAGING_DEMO_RENTALS = 'true';
    process.env.RENDER_GIT_BRANCH = 'staging-asaas';
    assert.equal(isStagingDemoRentalsEnabled(), true);

    process.env.ASAAS_ENVIRONMENT = 'production';
    assert.equal(isStagingDemoRentalsEnabled(), false);
    process.env.ASAAS_ENVIRONMENT = 'sandbox';

    process.env.RENDER_GIT_BRANCH = 'main';
    assert.equal(isStagingDemoRentalsEnabled(), false);
    process.env.RENDER_GIT_BRANCH = 'staging-asaas';

    process.env.ASAAS_STAGING_DEMO_RENTALS = 'false';
    assert.equal(isStagingDemoRentalsEnabled(), false);
  } finally {
    if (originalEnvironment === undefined) delete process.env.ASAAS_ENVIRONMENT;
    else process.env.ASAAS_ENVIRONMENT = originalEnvironment;
    if (originalFlag === undefined) delete process.env.ASAAS_STAGING_DEMO_RENTALS;
    else process.env.ASAAS_STAGING_DEMO_RENTALS = originalFlag;
    if (originalBranch === undefined) delete process.env.RENDER_GIT_BRANCH;
    else process.env.RENDER_GIT_BRANCH = originalBranch;
  }
});

test('webhook 401 logs only boolean token diagnostics', async () => {
  const originalToken = process.env.ASAAS_WEBHOOK_TOKEN;
  const originalConsoleWarn = console.warn;
  const logs = [];
  const webhookTokenSentinel = 'private-webhook-token-sentinel';
  const webhookResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    send(message) { this.message = message; return this; }
  });
  const invokeWebhook = async (receivedToken) => {
    const res = webhookResponse();
    await AsaasWebhookController.webhook({
      header: (name) => name === 'asaas-access-token' ? receivedToken : undefined,
      body: {}
    }, res);
    return res;
  };

  console.warn = (...args) => logs.push(args);
  try {
    process.env.ASAAS_WEBHOOK_TOKEN = webhookTokenSentinel;
    const missingHeaderResponse = await invokeWebhook(undefined);
    assert.equal(missingHeaderResponse.statusCode, 401);

    const mismatchedTokenResponse = await invokeWebhook('different-private-token');
    assert.equal(mismatchedTokenResponse.statusCode, 401);

    const matchingTokenResponse = await invokeWebhook(webhookTokenSentinel);
    assert.equal(matchingTokenResponse.statusCode, 400);

    delete process.env.ASAAS_WEBHOOK_TOKEN;
    const unconfiguredResponse = await invokeWebhook(webhookTokenSentinel);
    assert.equal(unconfiguredResponse.statusCode, 503);
  } finally {
    console.warn = originalConsoleWarn;
    if (originalToken === undefined) delete process.env.ASAAS_WEBHOOK_TOKEN;
    else process.env.ASAAS_WEBHOOK_TOKEN = originalToken;
  }

  assert.deepEqual(logs, [
    [
      'Asaas webhook authentication failed:',
      {
        expectedTokenConfigured: true,
        receivedTokenPresent: false,
        tokensMatch: false
      }
    ],
    [
      'Asaas webhook authentication failed:',
      {
        expectedTokenConfigured: true,
        receivedTokenPresent: true,
        tokensMatch: false
      }
    ]
  ]);
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(webhookTokenSentinel), false);
  assert.equal(serializedLogs.includes('different-private-token'), false);
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
        { code: 'bad-value', description: 'The value is invalid.' },
        { code: 'invalid-customer', description: 'Customer Sensitive Name is invalid.' },
        { code: 'invalid-person', description: 'John is invalid.' },
        { code: 'invalid-wallet', description: 'Wallet walletsecretidentifier is invalid.' },
        { code: 'invalid-email', description: 'Invalid email private.test@example.com.' },
        { code: 'invalid-document', description: 'CPF 529.982.247-25 is invalid.' },
        { code: 'invalid-phone', description: 'Phone +55 27 99999-1234 is invalid.' },
        { code: 'invalid-token', description: 'Invalid token abcdefghijklmnop.' },
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
        assert.deepEqual(error.validationCodes, [
          'invalid_split_wallet',
          'bad-value',
          'invalid-customer',
          'invalid-person',
          'invalid-wallet',
          'invalid-email',
          'invalid-document',
          'invalid-phone',
          'invalid-token',
          'missing-description'
        ]);
        assert.deepEqual(error.validationErrors.map(({ code, description }) => [code, description]), [
          ['invalid_split_wallet', null],
          ['bad-value', 'The value is invalid.'],
          ['invalid-customer', null],
          ['invalid-person', null],
          ['invalid-wallet', null],
          ['invalid-email', null],
          ['invalid-document', null],
          ['invalid-phone', null],
          ['invalid-token', null],
          ['missing-description', null]
        ]);
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
    assert.match(log, /The value is invalid/);
    for (const sensitiveValue of [
      ...sensitiveValues,
      'private-reference',
      'Validation failed',
      'Sensitive Name',
      'John is invalid',
      'email private.test@example.com',
      'CPF 529.982.247-25',
      '+55 27 99999-1234',
      'abcdefghijklmnop',
      'Unsafe code'
    ]) {
      assert.equal(log.includes(sensitiveValue), false, `log must not include ${sensitiveValue}`);
    }
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test('sandbox subscription and Pix QR flow uses mocked Asaas responses only', async () => {
  const originalDemoFlag = process.env.ASAAS_STAGING_DEMO_RENTALS;
  process.env.ASAAS_STAGING_DEMO_RENTALS = 'true';
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
    if (originalDemoFlag === undefined) delete process.env.ASAAS_STAGING_DEMO_RENTALS;
    else process.env.ASAAS_STAGING_DEMO_RENTALS = originalDemoFlag;
  }
});

test('demo rental is rejected outside the explicitly enabled staging sandbox', async () => {
  const originalEnvironment = process.env.ASAAS_ENVIRONMENT;
  const originalFlag = process.env.ASAAS_STAGING_DEMO_RENTALS;
  const originalBranch = process.env.RENDER_GIT_BRANCH;
  const originalFetch = global.fetch;
  const locatario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Locatario sem modo de teste', email: 'demo-disabled@test.com', senha: '123', tipo: 'COMUM'
  });
  const testOwner = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Conta Sandbox', email: 'demo-disabled-owner@test.com', senha: '123',
    tipo: 'COMUM', asaasWalletId: sandboxDemoWalletId
  });
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Moradia demonstrativa bloqueada', preco: 100, imagem: '/demo.jpg',
    proprietarioId: null, disponivel: true, demonstracao: true
  });
  let externalRequests = 0;
  global.fetch = async () => {
    externalRequests += 1;
    throw new Error('No external API calls are expected in this test.');
  };

  try {
    process.env.ASAAS_ENVIRONMENT = 'sandbox';
    process.env.ASAAS_STAGING_DEMO_RENTALS = 'true';
    process.env.RENDER_GIT_BRANCH = 'main';
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      send(message) { this.message = message; return this; },
      render(view, data) { this.view = view; this.data = data; return this; }
    };
    await LocacaoController.createRental({
      session: { usuarioId: locatario.id },
      params: { moradiaId: String(moradia.id) },
      body: { cpfCnpj: '529.982.247-25' }
    }, response);
    assert.equal(response.statusCode, 404);
    assert.equal(externalRequests, 0);
    assert.equal(await BancoDeDados.getRepository(LocacaoOperacao).count(), 0);

    const ownerDetailsResponse = {
      render(view, data) { this.view = view; this.data = data; return this; }
    };
    await MoradiaController.show({
      params: { id: String(moradia.id) },
      session: { usuarioId: testOwner.id, usuarioNome: testOwner.nome, usuarioTipo: testOwner.tipo }
    }, ownerDetailsResponse);
    assert.equal(ownerDetailsResponse.data.stagingDemoRentalAvailable, false);
  } finally {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.ASAAS_ENVIRONMENT;
    else process.env.ASAAS_ENVIRONMENT = originalEnvironment;
    if (originalFlag === undefined) delete process.env.ASAAS_STAGING_DEMO_RENTALS;
    else process.env.ASAAS_STAGING_DEMO_RENTALS = originalFlag;
    if (originalBranch === undefined) delete process.env.RENDER_GIT_BRANCH;
    else process.env.RENDER_GIT_BRANCH = originalBranch;
  }
});

test('staging demo rentals use the sandbox wallet without changing housing or user roles', async () => {
  const originalFlag = process.env.ASAAS_STAGING_DEMO_RENTALS;
  const originalFetch = global.fetch;
  process.env.ASAAS_ENVIRONMENT = 'sandbox';
  process.env.RENDER_GIT_BRANCH = 'staging-asaas';
  process.env.ASAAS_STAGING_DEMO_RENTALS = 'true';

  const locatario = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Locatario de teste', email: 'demo-renter@test.com', senha: '123', tipo: 'COMUM'
  });
  const testOwner = await BancoDeDados.getRepository(Usuario).save({
    nome: 'Conta Sandbox', email: 'demo-owner@test.com', senha: '123',
    tipo: 'COMUM', asaasWalletId: sandboxDemoWalletId
  });
  const moradia = await BancoDeDados.getRepository(Moradia).save({
    titulo: 'Moradia demonstrativa', preco: 100, imagem: '/demo.jpg',
    proprietarioId: null, disponivel: true, demonstracao: true
  });
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const parsedUrl = new URL(String(url));
    let response;
    if (parsedUrl.pathname === '/v3/customers' && options.method === 'POST') {
      response = { id: 'cus_demo_1' };
    } else if (parsedUrl.pathname === '/v3/customers') {
      response = { data: [] };
    } else if (parsedUrl.pathname === '/v3/subscriptions' && options.method === 'POST') {
      response = { id: 'sub_demo_1' };
    } else if (parsedUrl.pathname === '/v3/subscriptions') {
      response = { data: [] };
    } else if (parsedUrl.pathname === '/v3/subscriptions/sub_demo_1/payments') {
      response = { data: [{
        id: 'pay_demo_1', value: 101, status: 'PENDING', dueDate: '2026-12-01'
      }] };
    } else if (parsedUrl.pathname === '/v3/payments/pay_demo_1/pixQrCode') {
      response = { encodedImage: 'mock-demo-image', payload: 'mock-demo-pix' };
    } else {
      throw new Error(`Unexpected mocked Asaas request: ${options.method || 'GET'} ${parsedUrl.pathname}`);
    }

    return { ok: true, status: 200, json: async () => response };
  };

  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    render(view, data) { this.view = view; this.data = data; return this; },
    send(message) { this.message = message; return this; },
    redirect(location) { this.location = location; return this; },
    sendStatus(code) { this.statusCode = code; return this; }
  });
  const webhook = async (eventId, event) => {
    const res = response();
    await AsaasWebhookController.webhook({
      header: (name) => name === 'asaas-access-token' ? 'webhook-token' : undefined,
      body: {
        id: eventId,
        event,
        payment: {
          id: 'pay_demo_1',
          value: 101,
          status: event === 'PAYMENT_RECEIVED' ? 'RECEIVED' : 'CONFIRMED',
          subscription: 'sub_demo_1',
          dueDate: '2026-12-01'
        }
      }
    }, res);
    return res;
  };

  try {
    const demoDetailsResponse = response();
    await MoradiaController.show({
      params: { id: String(moradia.id) },
      session: { usuarioId: locatario.id, usuarioNome: locatario.nome, usuarioTipo: locatario.tipo }
    }, demoDetailsResponse);
    assert.equal(demoDetailsResponse.view, 'moradia_detalhes');
    assert.equal(demoDetailsResponse.data.stagingDemoRentalAvailable, true);
    assert.equal(JSON.stringify(demoDetailsResponse.data).includes(sandboxDemoWalletId), false);

    const selfRentalResponse = response();
    await LocacaoController.createRental({
      session: { usuarioId: testOwner.id },
      params: { moradiaId: String(moradia.id) },
      body: { cpfCnpj: '529.982.247-25' }
    }, selfRentalResponse);
    assert.equal(selfRentalResponse.statusCode, 400);
    assert.equal(requests.length, 0);

    const rentalResponse = response();
    await LocacaoController.createRental({
      session: { usuarioId: locatario.id },
      params: { moradiaId: String(moradia.id) },
      body: { cpfCnpj: '529.982.247-25' }
    }, rentalResponse);
    assert.match(rentalResponse.location, /^\/alugueis\/\d+$/);

    const subscriptionRequest = requests.find(({ url, options }) =>
      new URL(url).pathname === '/v3/subscriptions' && options.method === 'POST');
    assert.ok(subscriptionRequest);
    const subscriptionBody = JSON.parse(subscriptionRequest.options.body);
    assert.equal(subscriptionBody.value, 101);
    assert.equal(subscriptionBody.billingType, 'PIX');
    assert.equal(subscriptionBody.cycle, 'MONTHLY');
    assert.equal(subscriptionBody.split[0].walletId, sandboxDemoWalletId);
    assert.equal(subscriptionBody.split[0].percentualValue, 99);

    const persistedHousing = await BancoDeDados.getRepository(Moradia).findOneByOrFail({ id: moradia.id });
    assert.equal(persistedHousing.proprietarioId, null);
    const persistedOwner = await BancoDeDados.getRepository(Usuario).findOneByOrFail({ id: testOwner.id });
    assert.equal(persistedOwner.tipo, 'COMUM');
    const rental = await BancoDeDados.getRepository(Locacao).findOneByOrFail({
      asaasSubscriptionId: 'sub_demo_1'
    });
    assert.equal(rental.proprietarioId, testOwner.id);
    assert.equal(rental.status, 'AGUARDANDO_PAGAMENTO');

    const payment = await BancoDeDados.getRepository(PagamentoAluguel).findOneByOrFail({
      asaasPaymentId: 'pay_demo_1'
    });
    const pixResponse = response();
    await LocacaoController.pix({
      session: { usuarioId: locatario.id },
      params: { paymentId: String(payment.id) }
    }, pixResponse);
    assert.equal(pixResponse.data.pix.payload, 'mock-demo-pix');

    const confirmedResponse = await webhook('evt_demo_confirmed', 'PAYMENT_CONFIRMED');
    assert.equal(confirmedResponse.statusCode, 200);
    let refreshedRental = await BancoDeDados.getRepository(Locacao).findOneByOrFail({ id: rental.id });
    assert.equal(refreshedRental.status, 'AGUARDANDO_PAGAMENTO');

    const receivedResponse = await webhook('evt_demo_received', 'PAYMENT_RECEIVED');
    assert.equal(receivedResponse.statusCode, 200);
    refreshedRental = await BancoDeDados.getRepository(Locacao).findOneByOrFail({ id: rental.id });
    assert.equal(refreshedRental.status, 'ATIVA');
    assert.ok(requests.some(({ url }) =>
      new URL(url).pathname === '/v3/payments/pay_demo_1/pixQrCode'));
  } finally {
    global.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.ASAAS_STAGING_DEMO_RENTALS;
    else process.env.ASAAS_STAGING_DEMO_RENTALS = originalFlag;
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
