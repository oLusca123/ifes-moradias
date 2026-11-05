# Configuração de pagamentos de aluguel

O fluxo usa a API do Asaas para criar cobranças Pix mensais e aplicar split. O servidor precisa de uma conta Asaas da plataforma, permissão para usar split e credenciais válidas. A aplicação inicia em sandbox por padrão e não simula pagamento quando não há credencial.

## Configuração da plataforma

1. Crie e valide a conta Asaas da plataforma e confirme com o provedor a habilitação do split para a operação.
2. Crie uma chave de API de sandbox para testes. Nunca inclua a chave no código, no navegador ou em commits. Se uma chave real foi compartilhada em conversa, revogue-a e gere outra antes de usar.
3. Configure estas variáveis no ambiente do servidor:

   - `ASAAS_API_KEY`: chave de API do Asaas da plataforma.
   - `ASAAS_ENVIRONMENT`: `sandbox` para testes ou `production` para cobranças reais.
   - `ASAAS_WEBHOOK_TOKEN`: token aleatório forte definido também no cadastro do webhook no Asaas.
   - `SESSION_SECRET`: segredo aleatório forte para assinar sessões em produção.
   - `DATABASE_URL`: conexão do banco do ambiente. Para sandbox, use um branch Neon isolado, nunca o branch com dados de produção.

   Para desenvolvimento local, copie `.env.example` para `.env`, preencha os valores e mantenha `.env` fora do Git. O projeto carrega esse arquivo ao iniciar:

   ```powershell
   Copy-Item .env.example .env
   # Edite .env com sua chave de sandbox e um token forte para o webhook.
   npm run dev
   ```

   No Render, configure estas variáveis no serviço de staging. Use uma `DATABASE_URL` do branch Neon de teste, `ASAAS_ENVIRONMENT=sandbox`, uma chave da conta sandbox e um `ASAAS_WEBHOOK_TOKEN` de teste. Configure também `SESSION_SECRET`. Defina o comando de build como `npm run build` e o comando de start como `npm start`; o script de start define `NODE_ENV=production` e o Render fornece `PORT`. Não copie credenciais Asaas ou conexão do Neon de produção para o serviço de staging.

4. Cadastre no Asaas sandbox um webhook para `https://SEU-SERVICO-STAGING.onrender.com/webhooks/asaas`, configurando o mesmo token de teste em `ASAAS_WEBHOOK_TOKEN`. Habilite os eventos `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED`.
5. Teste o fluxo completo no sandbox com uma conta de teste para a plataforma e outra para o proprietário. Não altere o serviço de staging para `ASAAS_ENVIRONMENT=production`; produção deve ser configurada separadamente, após autorização e revisão operacional.

## Webhook de pagamentos

A rota `POST /webhooks/asaas` valida `asaas-access-token` comparando-o com `ASAAS_WEBHOOK_TOKEN` em tempo constante. Antes de processar, persiste o identificador único do evento, tipo, referências, valor quando aplicável, horário de recebimento, tentativas e uma projeção mínima do payload (sem dados pessoais do pagador). Entrega simultânea do mesmo ID não aplica o evento duas vezes.

Os resultados possíveis ficam registrados em `asaas_webhook_event`: `PENDING`, `PROCESSING`, `PROCESSED`, `PENDING_LINK`, `FAILED` e `IGNORED`, sempre com motivo/resultado. Eventos sem locação vinculada permanecem em `PENDING_LINK`; um worker periódico os tenta novamente depois da criação/reconciliação da locação. Falhas durante a transação deixam o evento recuperável e retornam HTTP 500 ao Asaas. Um evento já persistido pode receber HTTP 200 mesmo enquanto aguarda reprocessamento: o servidor assumiu a responsabilidade durável de tentá-lo novamente. ID ou tipo inválido retorna HTTP 400; token inválido retorna HTTP 401; token não configurado retorna HTTP 503.

`PAYMENT_CONFIRMED` é diferente de `PAYMENT_RECEIVED`: o primeiro registra confirmação sem ativar o contrato. A locação só passa de `AGUARDANDO_PAGAMENTO` para `ATIVA` em `PAYMENT_RECEIVED`/estado recebido válido. Atualizações condicionais de status e uma máquina explícita de transições impedem regressões por eventos atrasados ou snapshots concorrentes. Eventos desconhecidos, sem vínculo definitivo ou com transição inválida são guardados com o motivo; não alteram a cobrança.

O Asaas gera cobranças da assinatura conforme a recorrência; uma cobrança futura que ainda não foi gerada não aparece na listagem. A aplicação consulta `GET /subscriptions/{id}/payments` após criar a assinatura e também depende dos webhooks para sincronizar cobranças que surjam depois. Portanto, no sandbox, aguarde `PAYMENT_CREATED`/a sincronização antes de esperar que o QR Pix apareça na locação.

## Contratação recuperável

Antes de qualquer chamada externa, a aplicação persiste uma operação em `locacao_operacao`, com uma referência interna única e uma etapa (`CUSTOMER_READY`, `CUSTOMER_CREATE_UNKNOWN`, `SUBSCRIPTION_READY`, `SUBSCRIPTION_CREATE_UNKNOWN`, `LOCAL_PERSIST` ou `COMPLETE`). A restrição única por locatário/imóvel e um lease de processamento impedem duas solicitações concorrentes de iniciar o mesmo fluxo.

As chamadas POST ao Asaas têm timeout. Se a conexão cair depois de uma criação e não houver confirmação da resposta, a operação muda para reconciliação e não envia outro POST automaticamente. A aplicação consulta os endpoints de clientes/assinaturas pelo `externalReference` único e só avança quando encontra um único resultado. Mais de um resultado, ou nenhum após um POST de resultado incerto, exige conferência — não se presume que `externalReference` seja uma chave de idempotência do Asaas.

Não há transação de banco aberta durante as chamadas HTTP. Se a assinatura for criada, mas a persistência local falhar, a próxima tentativa tenta localizar a assinatura existente antes de qualquer novo envio. Eventos de assinatura/pagamento que chegarem antes do vínculo local ficam pendentes e são reconciliados pelo worker.

## Banco e migrations

O SQLite local continua usando `synchronize` para facilitar o desenvolvimento. Em PostgreSQL/Neon, `synchronize` fica desativado; o servidor não executa migrations automaticamente.

No Neon informado para este projeto, as estruturas de `locacao`, `locacao_operacao`, `pagamento_aluguel` e `asaas_webhook_event` já existem, mas `public.migrations` não existe. Portanto, não execute a migration `AddReliableAsaasFlow` só para criar o histórico. Antes de qualquer regularização:

1. Compare tipos, nulabilidade, defaults, índices e constraints de todas as colunas com as entidades e com o SQL da migration.
2. Crie um branch Neon de staging e valide ali o procedimento, sem apontá-lo para a base de produção.
3. Faça backup e obtenha aprovação explícita antes de qualquer escrita em produção.
4. Se a estrutura for equivalente, planeje um baseline que registre a migration como refletida no schema, sem reaplicar seu `up`. Se houver divergência, prepare uma migration corretiva específica.
5. Execute o procedimento aprovado uma única vez e confira o histórico e o schema depois.

O projeto ainda não possui comando `migration:run` implementado em `package.json`; não use esse comando até existir um runner revisado que use uma conexão direta e mantenha `synchronize` desativado. Nenhum baseline é criado automaticamente. A migration não é reversível automaticamente.

## Quem precisa criar o quê?

- Plataforma / administrador: precisa da chave API do Asaas.
- Proprietário da moradia: não precisa criar chave API. Precisa ter uma conta Asaas validada e cadastrar o Wallet ID no perfil do site.
- Locatário / estudante: não precisa criar chave API. Basta pagar o QR Pix/ cobrança e confirmar o contrato.

## Passo a passo para o proprietário

O proprietário precisa concluir estes passos uma vez:

1. Criar uma conta Asaas própria, preencher os dados solicitados e aguardar a validação do provedor.
2. No Asaas, cadastre uma conta bancária ou chave Pix para movimentar os valores da sua conta, conforme as opções disponíveis para seu cadastro.
3. Obter o `walletId` da carteira (identificador da carteira; não é chave Pix nem chave de API). A documentação oficial explica como consultá-lo: [Recuperar Wallet ID](https://docs.asaas.com/reference/recuperar-walletid).
4. Entrar no Moradia IFES, abrir **Minha conta** e localizar **Configure seus recebimentos de aluguel**.
5. Colar o `walletId` no campo indicado e salvar. Nunca informar senha, chave API ou chave Pix no site.
6. Anunciar um imóvel real e disponível. Anúncios de demonstração e imóveis sem proprietário vinculado não aceitam contratação online.
7. Quando um locatário iniciar o aluguel, acompanhar os recebimentos em **Meus aluguéis**. A conta Asaas do proprietário deve continuar ativa e apta a receber split.

## Passo a passo para o anunciante antes de publicar

1. Acesse **Minha conta**.
2. Faça login no Asaas, conclua a validação e cadastre a conta bancária/chave Pix para movimentação dos recebimentos.
3. Obtenha o **Wallet ID** conforme a [documentação oficial do Asaas](https://docs.asaas.com/reference/recuperar-walletid).
4. No Moradia IFES, abra **Configure seus recebimentos de aluguel** no perfil.
5. Cole o Wallet ID no campo do site e salve.
6. Publique a moradia.

## Fluxo para o locatário

1. Entrar na página de um imóvel real elegível e selecionar **Alugar e pagar pelo site**.
2. Informar CPF ou CNPJ para o cadastro do pagador no Asaas. Esse documento é enviado ao provedor e não é persistido pelo Moradia IFES.
3. Pagar a primeira mensalidade com o QR Pix gerado pelo Asaas. O provedor gera as cobranças mensais seguintes.
4. Consultar vencimentos e status em **Meus aluguéis**. O status depende da entrega correta dos webhooks do Asaas.

## Divisão e tarifas

O split configurado envia 99% do valor líquido da cobrança à carteira Asaas do proprietário e deixa 1% do valor líquido na carteira Asaas da plataforma. O Asaas calcula split sobre o valor líquido após suas tarifas; isto não garante o recebimento de 99%/1% do valor bruto anunciado. O split não transfere automaticamente o saldo da plataforma para uma chave Pix; confirme com o Asaas as regras de split, tarifas e movimentação dos valores antes de usar em produção.
