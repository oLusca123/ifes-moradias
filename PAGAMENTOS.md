# Configuração de pagamentos de aluguel

O fluxo usa a API do Asaas para criar cobranças Pix mensais e aplicar split. O servidor precisa de uma conta Asaas da plataforma, permissão para usar split e credenciais válidas. A aplicação inicia em sandbox por padrão e não simula pagamento quando não há credencial.

## Configuração da plataforma

1. Crie e valide a conta Asaas da plataforma e confirme com o provedor a habilitação do split para a operação.
2. Crie uma chave de API de sandbox para testes. Nunca inclua a chave no código, no navegador ou em commits. Se uma chave real foi compartilhada em conversa, revogue-a e gere outra antes de usar.
3. Configure estas variáveis no ambiente do servidor:

   - `ASAAS_API_KEY`: chave de API do Asaas da plataforma.
   - `ASAAS_ENVIRONMENT`: `sandbox` para testes ou `production` para cobranças reais.
   - `ASAAS_WEBHOOK_TOKEN`: token aleatório forte definido também no cadastro do webhook no Asaas.

   Para desenvolvimento local, copie `.env.example` para `.env`, preencha os valores e mantenha `.env` fora do Git. O projeto carrega esse arquivo ao iniciar:

   ```powershell
   Copy-Item .env.example .env
   # Edite .env com sua chave de sandbox e um token forte para o webhook.
   npm run dev
   ```

   Em produção, configure os valores no gerenciador de segredos/variáveis do provedor de hospedagem. Não use credenciais reais em ambiente local compartilhado.

4. Cadastre no Asaas um webhook para `https://SEU-DOMINIO/webhooks/asaas`, configurando o mesmo token em `ASAAS_WEBHOOK_TOKEN`. Habilite, no mínimo, `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED` e `PAYMENT_PARTIALLY_REFUNDED`.
5. Teste o fluxo completo no sandbox com uma conta de teste para a plataforma e outra para o proprietário. Só depois de validar o webhook, a cobrança e o split, mude `ASAAS_ENVIRONMENT` para `production` e configure uma chave de produção nova.

## Webhook de pagamentos

A rota `POST /webhooks/asaas` valida `asaas-access-token` com `ASAAS_WEBHOOK_TOKEN`. Eventos autenticados são registrados em `asaas_webhook_event`, com identificador do evento, tipo, pagamento associado, horário da primeira recepção e resultado. O ID do evento tem restrição única no SQLite; duplicatas concluídas são reconhecidas e concorrentes recebem HTTP 503 para que o Asaas possa reenviá-las. Falhas de processamento são registradas como `FAILED` e retornam HTTP 500 para permitir retry. Tipos desconhecidos, pagamentos sem vínculo e transições antigas são registrados como `IGNORED`, com motivo, e confirmados com HTTP 200 para não repetir eventos que não podem ser aplicados.

A entidade é criada na inicialização pelo `synchronize: true` do TypeORM. Eventos só são marcados `PROCESSED` na mesma transação que atualiza o pagamento; estados não retrocedem de recebido para pendente/atrasado, nem de reembolsado para um estado anterior.

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
