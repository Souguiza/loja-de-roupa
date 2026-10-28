# AGAPE — Streetwear de MS

Loja Next.js + API NestJS/Prisma + PostgreSQL para a marca Agape Streetwear. A identidade usa a linguagem do perfil: “Espalhando a palavra através da moda”, com peças exclusivas, estilo e propósito, de Dourados/Maracaju, MS. Instagram: [@agape.streetwearr](https://www.instagram.com/agape.streetwearr/). Atendimento divulgado no perfil: WhatsApp [67 98161-7997](https://wa.me/5567981617997). A vitrine de demonstração usa ilustrações e produtos/preços fictícios: não representam estoque real.

## Situação honesta do projeto

- Vitrine mobile-first com busca, categorias, tamanho disponível, ordenação, lista de desejos local, detalhe rápido e página SEO por produto. A campanha editorial tem imagem própria; as fotos e ilustrações dos cards continuam sem representar mercadoria real.
- Painel `/admin` com login e início rápido com resumo agregado de pedidos, estoque e avaliações; carrega somente quatro pedidos recentes. A lista completa é paginada em blocos de 50. O dono chega pelo atalho **PAINEL** no cabeçalho da loja ou por **ACESSO DO LOJISTA** no rodapé; depois da publicação, basta salvar `seudominio.com/admin` nos favoritos. Inclui cadastro e edição de dados/imagens/categorias/dimensões dos produtos, envio de fotos do celular/computador com conversão para WebP e prévia, inclusão, edição e pausa de variações, gestão de preço e estoque, cadastro/renomeação/pausa de categorias, clientes, código de rastreio manual e conexão OAuth do Melhor Envio.
- Cupons de porcentagem ou valor fixo no painel `/admin`, com limite de uso/validade, validação no servidor e desconto refletido nos itens enviados ao Mercado Pago.
- Avaliações vinculadas a pedidos entregues: o token privado do pedido prova a compra, cada produto por pedido recebe uma avaliação, e a equipe aprova antes da publicação. A média e as avaliações aprovadas aparecem na página da peça e a média entra no Product JSON-LD.
- API NestJS e modelo Prisma/PostgreSQL compilam.
- A cotação Melhor Envio selecionada permanece associada ao pedido. No painel, a expedição agora tem etapas separadas para preparar o frete no carrinho, confirmar a compra com saldo da loja, gerar a etiqueta, pedir o link privado de impressão e consultar o rastreio. O checkout da loja segue **desabilitado** até existirem contas, credenciais, banco atualizado e teste sandbox.
- A emissão de etiqueta exige CNPJ/endereço do remetente no `.env`, CPF do destinatário e chave NF-e digitados no momento da preparação. CPF e chave da nota são enviados ao Melhor Envio, mas não persistidos nesta loja. A compra usa o saldo da carteira Melhor Envio e pede confirmação explícita no painel. Se a resposta de uma etapa financeira/externa for incerta, o painel bloqueia repetição automática e orienta conferir a conta do Melhor Envio. Cotações com vários volumes e Azul Cargo continuam exigindo expedição manual.
- O painel só permite cancelar pedidos que ainda aguardam pagamento. Um pedido pago exige um fluxo de estorno; pedidos que já iniciaram expedição também exigem tratar a etiqueta no Melhor Envio. O estorno iniciado manualmente no Mercado Pago e o cancelamento de etiquetas ainda não têm fluxo de reconciliação no painel.
- Atualizações transacionais de pagamento, envio e entrega usam uma fila persistente com retentativas. E-mail usa Resend; WhatsApp só é enviado se o cliente marcar a opção no checkout e houver template aprovado configurado. As credenciais ainda não existem e nenhum envio real está ativo.
- A página `/privacidade` documenta a demonstração e mostra claramente os campos empresariais pendentes. Ela é um rascunho operacional e requer revisão pelo responsável da loja antes da venda.
- O projeto está em demonstração até a base de dados, o estoque real, os dados legais/contato e os provedores estarem configurados.

## Direção de marca

Público definido até aqui: jovens de Mato Grosso do Sul com estilo streetwear; operação informada: estoque próprio. O perfil indicado, `@agape.streetwearr`, se apresenta como moda streetwear cristã em Dourados e Maracaju, que espalha a palavra através da moda e oferece peças exclusivas com estilo e propósito. Essa linguagem foi aplicada à capa e ao manifesto da loja.

1. **Palavra na rua — aplicada.** Preto e branco como base do feed, azul claro das listras das peças e âmbar das fotos ao entardecer; monograma A cursivo em círculo branco; tipografia condensada para as estampas e assinatura cursiva no nome. A capa usa a mensagem do perfil: “Espalhando a palavra através da moda”.
2. **Drop de missão.** Preto e osso com laranja de sinalização; tipografia de cartaz e grafismos de serigrafia; voz mais urgente e ligada a lançamentos limitados. Boa para drops frequentes, porém menos atemporal.
3. **Cerrado urbano.** Verde profundo, areia e ferrugem; textura de concreto, vegetação do Centro-Oeste e fotografia natural; voz de pertencimento regional. Reforça MS, mas deixa a relação com a fé menos imediata.

A direção 1 está aplicada no site sob o nome Agape. Fotos, estampas e produto devem vir do estoque real antes da publicação comercial; as ilustrações atuais servem como demonstração visual.

## Requisitos no Windows

- Node.js 20 ou superior e npm.
- WSL 2 e Docker Desktop iniciado no modo Linux containers para PostgreSQL local; ou um PostgreSQL compatível acessível.
- PowerShell.

Se o Docker Desktop indicar **“WSL not installed”**, abra o PowerShell como administrador, execute `wsl --install` e reinicie o Windows. Consulte também o [guia oficial do WSL](https://learn.microsoft.com/windows/wsl/install). Depois da reinicialização, abra o Docker Desktop e espere o motor ficar pronto antes de iniciar o banco.

## Instalação limpa

Abra três terminais PowerShell na pasta do projeto.

### 1. Banco de dados

```powershell
docker compose up -d
docker compose ps
```

Espere o serviço `db` ficar saudável antes de rodar as migrações.

### 2. API

```powershell
cd backend
Copy-Item .env.example .env
```

Edite `backend/.env`: defina uma `JWT_SECRET` longa e aleatória, o e-mail real do responsável em `SEED_ADMIN_EMAIL` e uma senha forte em `SEED_ADMIN_PASSWORD` (mínimo de 16 caracteres e até 72 bytes UTF-8, limite do bcrypt usado pela API). O seed não cria uma conta de demonstração quando esses dados faltam. Confira também se `DATABASE_URL` corresponde ao banco local. Em seguida:

```powershell
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

A API fica em `http://localhost:3001/api`.

### 3. Vitrine

```powershell
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:3000`; painel: `http://localhost:3000/admin`. No desenvolvimento, se a API ou banco estiverem indisponíveis, o site mostra o catálogo ilustrativo com aviso e checkout inativo. Em produção, catálogo fictício não é exibido: se a API estiver fora do ar, a vitrine informa a indisponibilidade. As compras ficam desligadas até a configuração completa dos provedores.

Se a porta 3000 já estiver ocupada, inicie a vitrine em outra porta:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3002
```

Nesse caso, abra `http://localhost:3002` e o painel em `http://localhost:3002/admin`. Mantenha esse terminal aberto enquanto usar a prévia.

## Implantação e atualização

Ainda não foi escolhido um provedor de hospedagem. Estas etapas servem para um host Node.js que mantenha a API e o frontend ativos, com PostgreSQL 16 (ou compatível), HTTPS e armazenamento persistente para `MEDIA_ROOT`; não representam um deploy já realizado.

1. Crie o banco de produção e configure `DATABASE_URL`, `JWT_SECRET`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `FRONTEND_URL`, `MEDIA_ROOT`, `MEDIA_PUBLIC_URL` e `TRUST_PROXY_HOPS` no ambiente privado da API. Gere `INTEGRATION_TOKEN_KEY` com 32 bytes aleatórios em Base64. Configure os segredos dos provedores somente no servidor.
2. Configure no ambiente do frontend, antes do build, `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_SITE_URL` com as origens HTTPS públicas corretas. Se usar Google Search Console, informe `GOOGLE_SITE_VERIFICATION` no frontend.
3. Na primeira instalação, aplique migrações e crie a conta administrativa:

   ```powershell
   cd backend
   npm ci --include=dev
   npx prisma generate
   npx prisma migrate deploy
   npx prisma db seed
   npm run build
   npm run start:prod
   ```

4. Em outro processo do mesmo host, compile e inicie o frontend:

   ```powershell
   cd frontend
   npm ci --include=dev
   npm run build
   npm run start
   ```

   O frontend atende na porta 3000; a API usa `PORT` (3001 por padrão). Configure o proxy HTTPS para essas portas e permita no CORS apenas a origem real em `FRONTEND_URL`. Reinicie os dois processos com um supervisor da hospedagem e monitore `GET /api/health`, que também verifica a conexão com o banco.

5. Em atualizações, faça backup primeiro, publique o novo código, rode `npx prisma migrate deploy` antes de iniciar a nova versão da API e faça o build do frontend com as variáveis públicas de produção. Mantenha `backend/uploads` ou `MEDIA_ROOT` em volume persistente; configure backups externos para banco e imagens e teste a restauração.

Mantenha `CHECKOUT_ENABLED=false` e `NEXT_PUBLIC_CHECKOUT_ENABLED=false` durante a implantação inicial. Só ligue o checkout após credenciais, políticas, catálogo e compra completa em sandbox terem sido verificados. A senha e o e-mail de seed devem ser os dados reais do responsável e não podem entrar no Git.

## Configuração e caminhos

- Identidade e textos: `frontend/lib/brand.ts`.
- Identidade visual com base no perfil Agape: logotipo cursivo em círculo, base preta, branco, azul-claro e tons quentes; consentimento de Analytics: `frontend/components/AnalyticsConsent.tsx`.
- Cabeçalhos de segurança da vitrine: `frontend/next.config.mjs` (HSTS é enviado apenas em produção; a API também define seus cabeçalhos em `backend/src/main.ts`).
- Layout, cores, responsividade e movimento reduzido: `frontend/app/globals.css`.
- Vitrine: `frontend/components/Rack.tsx`.
- Página de produto: `frontend/app/produto/[slug]/page.tsx` e `frontend/components/ProductPurchase.tsx`.
- Gestão: `frontend/app/admin/page.tsx`.
- Modelo de dados: `backend/prisma/schema.prisma`.
- Configuração do Prisma CLI, diretório de migrações e seed administrativo: `backend/prisma.config.ts`; o arquivo carrega o `.env` local explicitamente.
- Backup local do PostgreSQL e fotos: `scripts/backup-db.ps1` cria o dump `.dump`, o pacote de mídia `.media.zip` e checksums SHA-256 pareados por data em `backups/`; a pasta é ignorada pelo Git porque pode conter dados pessoais e imagens da loja.
- Variáveis locais: `backend/.env` e `frontend/.env.local` (não versionar segredos).
- Fotos enviadas pela administração são salvas em `backend/uploads` por padrão (relativo à pasta de execução da API) ou no caminho absoluto de `MEDIA_ROOT`. Em produção, monte uma pasta/volume persistente neste caminho, configure `MEDIA_PUBLIC_URL` com a origem HTTPS pública da API, inclua o volume no backup e nunca apague os arquivos enquanto houver produtos usando suas URLs. O upload requer login e só aceita conteúdo WebP; a interface converte JPEG/PNG/WebP no navegador, redimensiona para até 2400 px e limita o arquivo final a 6 MB.
- A API limita tentativas por IP em login, criação de pedido, cálculo de frete, validação de cupom e início de OAuth; para manter essa proteção consistente entre várias instâncias, substitua o limitador em memória por Redis antes de escalar. `TRUST_PROXY_HOPS` fica em `0` por padrão; configure o número exato de proxies confiáveis somente quando a API estiver atrás de proxy reverso, para que o limite use o IP correto.
- Dados legais públicos opcionais: `NEXT_PUBLIC_COMPANY_LEGAL_NAME`, `NEXT_PUBLIC_COMPANY_CNPJ` e `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` no `frontend/.env.local`; preencha com dados confirmados antes de publicar.
- Google Analytics 4 e Meta Pixel são opcionais: defina `NEXT_PUBLIC_GA_MEASUREMENT_ID` e/ou `NEXT_PUBLIC_META_PIXEL_ID` em `frontend/.env.local`. As tags só são carregadas após consentimento explícito; a escolha pode ser alterada na página de privacidade. Sem IDs, nenhum banner nem script de marketing é carregado.
- Google Search Console: configure o domínio real em `NEXT_PUBLIC_SITE_URL` e, se verificar uma propriedade de prefixo de URL pelo método de tag HTML, coloque o token em `GOOGLE_SITE_VERIFICATION`. O sitemap fica em `/sitemap.xml`; a propriedade ainda precisa ser adicionada no Search Console e o sitemap enviado manualmente.

## API resumida

- Catálogo público: `GET /api/products`, `GET /api/products/:slug`, `GET /api/categories`.
- Login administrativo: `POST /api/auth/admin/login`.
- Cupons: `POST /api/coupons/validate` valida no servidor; `/api/admin/coupons` lista e cadastra; `PATCH /api/admin/coupons/:id` ativa/desativa (requer owner/staff).
- Produtos/categorias/variações administrativos: `/api/admin/products`, `/api/admin/categories` (POST cria; PATCH renomeia ou pausa/reativa) e `/api/admin/variants` (requer Bearer token de owner/staff). Pausar uma categoria oculta seus produtos na vitrine sem apagar pedidos ou registros históricos.
- Mídia administrativa: `POST /api/admin/media/images` recebe uma imagem WebP (Bearer token de owner/staff); o arquivo é servido publicamente em `/media/:arquivo`.
- Pedidos/clientes administrativos: `GET /api/admin/orders?page=N` (50 por página), `GET /api/admin/orders/summary` (contagens e 4 pedidos recentes), `GET /api/admin/orders/customers`, `PATCH /api/admin/orders/:id`.
- `POST /api/shipping/quote` cotação pelo Melhor Envio; `GET /api/admin/shipping/authorize` inicia OAuth e `GET /api/admin/shipping/status` mostra conexão.
- Rotas administrativas protegidas: `POST /api/admin/shipping/orders/:id/label` prepara a etiqueta; `/label/purchase` debita o saldo do Melhor Envio; `/label/generate` gera a etiqueta; `/label/print` obtém um link privado de impressão; `/label/tracking` atualiza o código de rastreio. A integração só solicita `cart-write`, `shipping-checkout`, `shipping-generate`, `shipping-print` e `shipping-tracking` além da cotação.
- `POST /api/orders` cria pedido e preferência do Mercado Pago somente quando CHECKOUT_ENABLED=true e todos os segredos/URLs HTTPS estiverem configurados; `POST /api/orders/webhook/mercado-pago` valida a assinatura e confirma o estado consultado ao provedor.
- `GET /api/orders/status/:token` retorna acompanhamento público com token aleatório, sem dados pessoais.
- `GET /api/products/:slug/reviews` mostra avaliações aprovadas; `POST` no mesmo caminho recebe nota e comentário somente com token de pedido entregue que contenha o produto. O painel usa `GET /api/admin/reviews?status=PENDING` e `PATCH /api/admin/reviews/:id` para moderação.

## Validação local

Na pasta `backend`, `npx prisma validate` valida o schema sem se conectar ao banco e `npx prisma generate` gera o cliente. `npm test` compila a API e valida login/cadastro, hash de senha, limite do bcrypt, autorização por perfil, checkout fechado, catálogo e categorias pausadas, resumo/paginação e minimização dos dados do painel, cálculo do pedido/preferência, reserva e expiração do estoque/cupom, disputa de pagamento com a expiração e assinatura/confirmação do webhook com provedores simulados. A fila de notificações também é testada com provedores simulados para consentimento de WhatsApp, escape HTML, entrega, retentativa e falha terminal. Isso não substitui uma operação com PostgreSQL nem uma compra de ponta a ponta no sandbox. Na pasta `frontend`, `npx tsc --noEmit` confere tipos e `npm run build` gera a versão de produção. Para compilar enquanto o servidor de desenvolvimento estiver aberto, use no PowerShell:

```powershell
$env:NEXT_DIST_DIR = '.next-production'
npm run build
Remove-Item Env:\NEXT_DIST_DIR
```

Para criar um backup manual do banco local, com o Docker Desktop ativo e o container saudável, execute na raiz do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
```

O arquivo `.dump` contém pedidos e dados de clientes; o `.media.zip` guarda as fotos locais do catálogo. Cada arquivo tem seu próprio checksum `.sha256`. Mantenha o conjunto em local protegido e criptografe antes de copiá-lo para outro dispositivo. Em produção, configure cópias automáticas fora do servidor e teste a restauração periodicamente; o script local não substitui esse processo.

Para verificar um backup sem alterar o banco usado pela aplicação, restaure-o em um banco isolado. O destino precisa ser novo; o script confere os checksums do banco e das fotos, restaura a base e extrai as imagens para uma pasta separada `backups/<banco>-media`. Ele recusa destinos que já existam:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-db-test.ps1 -BackupPath .\backups\agape-postgres-AAAAMMDD-HHMMSS-fff.dump
```

Se precisar repetir a verificação, escolha outro destino, por exemplo `-TargetDatabase loja_roupas_restore_test_2`. A restauração não muda `loja_roupas`; após conferir, remova manualmente o banco de teste com `docker compose exec -T db dropdb -U loja loja_roupas_restore_test` e a pasta `backups/loja_roupas_restore_test-media` (use o nome que você passou no comando).

## Fases para lançar

### MVP de marca e catálogo — entregue para demonstração

Direção Agape, vitrine responsiva, busca/categoria/ordenação, detalhe de produto, sitemap, robots, metadados e Product JSON-LD; admin de catálogo e esqueleto de API.

### Lançamento transacional — integração escrita, falta ambiente e validação sandbox

1. Criar conta/aplicação de vendedor no Mercado Pago; configurar token de teste, segredo do webhook e URLs HTTPS.
2. Criar conta/app no Melhor Envio; configurar OAuth, CEP de origem, User-Agent, dimensões e pesos dos produtos. Reconectar a conta para aprovar os escopos de carrinho, compra, geração, impressão e rastreio; testar cada etapa no sandbox.
3. Definir regras reais de parcelamento, política de frete, trocas/devoluções, privacidade, razão social/CNPJ e canais de atendimento.
4. Validar expiração de pedido não pago, reservas, callbacks, duplicidade de webhook e estados no sandbox; configurar e-mails e WhatsApp transacionais.
5. Inserir somente fotos, descrições, preços e estoque verificados; revisar acessibilidade, privacidade e operação de ponta a ponta.

Para conectar o Melhor Envio localmente, preencha `MELHOR_ENVIO_CLIENT_ID`, `MELHOR_ENVIO_CLIENT_SECRET`, `MELHOR_ENVIO_REDIRECT_URI`, `MELHOR_ENVIO_FROM_CEP`, `MELHOR_ENVIO_USER_AGENT` e `INTEGRATION_TOKEN_KEY` no `.env` do backend. Gere uma chave base64 aleatória de 32 bytes para criptografar os tokens. Cadastre no aplicativo do Melhor Envio a mesma URL de retorno, abra `/admin`, entre em **ENTREGA** e autorize a conta. Para emissão de etiquetas comerciais, preencha também `MELHOR_ENVIO_SENDER_NAME`, `MELHOR_ENVIO_SENDER_EMAIL`, `MELHOR_ENVIO_SENDER_PHONE`, `MELHOR_ENVIO_SENDER_CNPJ`, `MELHOR_ENVIO_SENDER_STATE_REGISTER`, `MELHOR_ENVIO_SENDER_ADDRESS`, `MELHOR_ENVIO_SENDER_NUMBER`, `MELHOR_ENVIO_SENDER_DISTRICT`, `MELHOR_ENVIO_SENDER_CITY` e `MELHOR_ENVIO_SENDER_STATE`; use `MELHOR_ENVIO_SENDER_COMPLEMENT` e `MELHOR_ENVIO_SENDER_CNAE` quando aplicável. Os valores devem corresponder aos dados fiscais e ao endereço reais da loja. Para produção, use domínio HTTPS público e `MELHOR_ENVIO_ENV=production`.

Para testar o pagamento, configure no `.env` do backend o token de teste, segredo do webhook e URLs HTTPS acessíveis do site e da API; configure a URL do webhook na aplicação Mercado Pago. Rode o banco com `npx prisma migrate deploy` e cadastre no painel produtos com peso, dimensões, preço e estoque reais de teste. Só depois do teste completo em sandbox habilite `CHECKOUT_ENABLED=true` na API e `NEXT_PUBLIC_CHECKOUT_ENABLED=true` no frontend.

Para ativar e-mails transacionais, configure `RESEND_API_KEY` e um `NOTIFICATION_FROM_EMAIL` verificado no Resend. Para WhatsApp, configure `WHATSAPP_MESSAGES_URL` (Graph API HTTPS com versão e ID do número), `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME` e `WHATSAPP_TEMPLATE_LANGUAGE`. O template aprovado deve ter quatro parâmetros no corpo, nesta ordem: número do pedido, status, rastreio e URL pública de acompanhamento. O cliente precisa consentir no checkout. A prontidão dos provedores aparece em `/api/admin/notifications/status` para usuários autenticados da administração.

### Melhorias pós-lançamento e pendências de produto

- **Programa de fidelidade — não implementado.** Antes de criar pontos, definir como acumular, expirar e resgatar, e se o benefício pode ser combinado com cupons. A API, o painel e o checkout precisam compartilhar as mesmas regras.
- **Recuperação de carrinho — não implementada.** Definir canal, tempo de espera, limite de mensagens, consentimento, descadastro e base legal antes de enviar e-mail ou WhatsApp. A preferência de atualizações de pedido não equivale a consentimento de marketing.
- **Nota fiscal — emissão não implementada.** O responsável informa a chave da NF-e ao preparar uma etiqueta do Melhor Envio; a loja não emite nem cancela notas. Definir o emissor fiscal e validar o fluxo com o contador antes de vender.
- **Lista de desejos — apenas neste navegador.** Sincronização entre dispositivos exige uma conta de cliente e uma decisão de produto sobre cadastro e retenção de dados.
- **Crescimento e operação — ainda pendentes:** conteúdo editorial contínuo, integração Google Merchant Center, envio do sitemap ao Search Console, monitoramento/alertas e teste periódico de restauração de backups.

As avaliações verificadas já estão implementadas e moderadas no painel; a compra sandbox e a operação real ainda precisam ser validadas conforme o checklist abaixo.

Conteúdo inicial recomendado para busca local: páginas e textos sobre streetwear cristão em Mato Grosso do Sul, como escolher caimento/tamanho de camisetas streetwear, significado e cuidado das estampas, bastidores dos drops e guia de entrega/trocas. Use termos locais apenas quando o texto trouxer informação útil para Dourados, Maracaju e região; não criar páginas repetidas de cidade sem conteúdo próprio.

## Checklist antes de vender

- [ ] Criar credenciais de produção do Mercado Pago e configurar webhook HTTPS.
- [ ] Criar e autorizar app do Melhor Envio; cadastrar origem e pacotes reais.
- [ ] Implementar e testar pagamento aprovado, recusado, duplicado, webhook repetido e estorno em sandbox.
- [ ] Validar cotação/etiqueta/rastreio por CEP e política de frete.
- [ ] Trocar ilustrações e exemplos por fotos e dados reais, com estoque por variação revisado.
- [ ] Configurar domínio HTTPS, segredo JWT, CORS, banco de produção, backups, logs e alertas.
- [ ] Publicar política de privacidade/trocas, dados empresariais e atendimento; definir retenção e processo de direitos LGPD.
- [x] Criar testes automatizados de pedidos, estoque, webhook e autenticação; a compra completa em sandbox continua pendente.
- [ ] Fazer compra real controlada, conferir e-mail/rastreio e validar celular, teclado e leitor de tela; medir Core Web Vitals em ambiente publicado.
- [ ] Definir regras e implementar o programa de fidelidade antes de anunciá-lo.
- [ ] Definir consentimento, canal e política de descadastro antes de implementar recuperação de carrinho.
- [ ] Escolher e validar o emissor fiscal; a chave NF-e informada para o frete não significa emissão pela loja.
- [x] Auditoria de produção com npm concluída: `npm audit --omit=dev --audit-level=moderate` encontrou zero vulnerabilidades no frontend e no backend. O lockfile fixa PostCSS 8.5.23; o backend fixa Multer 2.5.0 e `deepmerge-ts` 8.0.2 nas dependências transitivas afetadas.
- [ ] A auditoria completa do backend mantém três alertas baixos de `deepmerge` transitivo do Nest CLI, restritos às ferramentas de desenvolvimento. O npm só oferece correção forçada que rebaixa `@nestjs/cli` para 7.2.0; essa troca foi evitada. Reauditar quando Nest CLI publicar uma correção compatível.

**Não defina `CHECKOUT_ENABLED=true` antes de rodar as migrações, configurar ambos os provedores e validar uma compra completa em sandbox.** Sem esses itens, o servidor bloqueia a criação de pedidos.
