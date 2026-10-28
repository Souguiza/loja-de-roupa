import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { PrivacyPreferencesLink } from '@/components/PrivacyPreferencesLink';
import { ANALYTICS_CONFIGURED } from '@/lib/analytics-config';

export const metadata: Metadata = {
  title: 'Privacidade e dados pessoais',
  description: 'Como a Agape trata dados pessoais na loja online.',
  alternates: { canonical: '/privacidade' },
};

const legalName = process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME;
const companyId = process.env.NEXT_PUBLIC_COMPANY_CNPJ;
const privacyEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL;
const operatorReady = Boolean(legalName?.trim() && companyId?.trim() && privacyEmail?.trim());

export default function PrivacyPage() {
  return <main className="legal-page">
    <p className="eyebrow">AGAPE / TRANSPARÊNCIA</p>
    <h1>PRIVACIDADE<br /><em>NO CORRE.</em></h1>
    <p className="legal-updated">Rascunho operacional · revisão e dados empresariais pendentes antes da abertura das vendas</p>
    {!operatorReady && <aside className="legal-prelaunch-note" role="note"><strong>LOJA EM PREPARAÇÃO</strong><p>Antes de vender, a Agape precisa publicar a identificação da pessoa ou empresa responsável, o CNPJ/CPF aplicável e um canal de privacidade dedicado. Esses dados não foram fornecidos e não serão inventados.</p></aside>}

    <section><h2>QUEM CUIDA DOS DADOS</h2>{operatorReady ? <p>{legalName} · CNPJ {companyId}. Contato de privacidade: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</p> : <p>Responsável legal: <strong>{legalName || '[preencher nome ou razão social]'}</strong>. Identificação: <strong>{companyId || '[preencher CNPJ ou CPF aplicável]'}</strong>. Canal de privacidade: <strong>{privacyEmail || '[preencher e-mail de atendimento a dados pessoais]'}</strong>.</p>}<p>A Agape é uma marca de streetwear cristão de Dourados e Maracaju, Mato Grosso do Sul. O canal público informado pela loja é o WhatsApp <a href={BRAND.whatsappUrl}>67 98161-7997</a>.</p></section>
    <section><h2>O QUE A DEMONSTRAÇÃO ARMAZENA</h2><p>A sacola e a lista de desejos podem guardar no armazenamento local deste navegador as peças e variações escolhidas. Esses dados não são sincronizados entre aparelhos e a lista de desejos não exige cadastro.</p><p>O checkout da demonstração está desativado. Quando a loja estiver habilitada, o formulário de pedido poderá coletar nome, e-mail, telefone opcional, endereço e CEP para processar pedido, pagamento, entrega e atendimento. O backend registra os dados necessários para cumprir o pedido e manter seu histórico.</p></section>
    <section><h2>COM QUEM OS DADOS SERÃO COMPARTILHADOS</h2><p>Na versão atual, o checkout continua desabilitado e a demonstração não envia pedidos ao Mercado Pago ou ao Melhor Envio. Quando a expedição comercial for habilitada, a equipe enviará ao Melhor Envio os dados de endereço/contato do pedido, o CPF do destinatário e a chave da NF-e para preparar a etiqueta. O CPF e a chave da nota são usados na requisição de expedição e não são armazenados por esta aplicação; os dados do pedido e endereço continuam no histórico da loja. A operação depende de contas, avisos e contratos configurados.</p>{ANALYTICS_CONFIGURED ? <p>Google Analytics e/ou Meta Pixel estão configurados e só carregam se você aceitar cookies opcionais. Você pode alterar sua escolha em <PrivacyPreferencesLink />.</p> : <p>A Agape não usa Analytics, Meta Pixel ou publicidade comportamental nesta demonstração. Se esses serviços forem configurados, só serão carregados após sua autorização para cookies opcionais.</p>}</section>
    <section><h2>FINALIDADES, BASES E PRAZOS</h2><p>Quando o checkout estiver ativo, os dados de contato e entrega serão usados para preparar e cumprir o pedido, responder solicitações, prevenir fraude e atender obrigações legais. A base legal deve ser definida para cada finalidade pelo responsável da loja. Os prazos de retenção serão publicados após a definição dos requisitos fiscais, consumeristas e operacionais.</p></section>
    <section><h2>SEUS DIREITOS E COMO PEDIR AJUDA</h2><p>A legislação brasileira prevê direitos de acesso, confirmação, correção e outras solicitações sobre dados pessoais. Consulte a <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares" target="_blank" rel="noreferrer">orientação da ANPD sobre direitos dos titulares</a> e a <a href="https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noreferrer">Lei Geral de Proteção de Dados</a>. Para exercer seus direitos, escreva para <a href={BRAND.whatsappUrl}>o atendimento da Agape no WhatsApp</a> e peça encaminhamento ao responsável por privacidade. Evite enviar documentos ou dados sensíveis sem que sejam necessários para verificar sua solicitação.</p></section>
    <section><h2>SEGURANÇA E ATUALIZAÇÕES</h2><p>As credenciais de integração ficam no servidor, não no navegador. Nenhum sistema conectado à internet oferece risco zero; a loja deve manter acesso administrativo restrito, segredos fortes, backups e um processo de resposta a incidentes antes de operar.</p><p>Esta página descreve o comportamento da demonstração em 28 de outubro de 2026. Ela precisa ser revisada pelo responsável da loja e atualizada antes da ativação do checkout ou da inclusão de novas integrações.</p></section>
    <a className="legal-back" href="/">← VOLTAR À LOJA</a>
  </main>;
}
