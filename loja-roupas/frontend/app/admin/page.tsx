'use client';

import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
import NextImage from 'next/image';
import { brl } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
type Order = {
  id: string; number: number; status: string; totalCents: number; shippingAddress: Record<string, string>;
  trackingCode: string | null; createdAt: string; shippingLabelId: string | null; shippingLabelStatus: string | null;
  shippingQuote: { companyName: string; serviceName: string; priceCents: number; deliveryDays: number } | null;
  customer: { name: string; email: string; phone: string | null };
  items: { productName: string; size: string; color: string; quantity: number }[];
};
type AdminOrderPage = { items: Order[]; total: number; page: number; pageSize: number; pageCount: number };
type RecentOrder = { id: string; number: number; status: string; createdAt: string; customer: { name: string }; items: { quantity: number }[] };
type OverviewSummary = { activeOrderCount: number; waitingPaymentCount: number; lowStockVariantCount: number; pendingReviewCount: number; recentOrders: RecentOrder[] };
type Variant = { id: string; size: string; color: string; colorHex: string; priceCents: number; stockQty: number; active: boolean };
type Product = {
  id: string; name: string; slug: string; description: string | null; shape: 'tee' | 'long' | 'tank'; hasPrint: boolean; active: boolean;
  shippingWeightGrams: number | null; shippingWidthCm: number | null; shippingHeightCm: number | null; shippingLengthCm: number | null;
  categoryId: string; category: { id: string; name: string; active: boolean };
  variants: Variant[]; images: { url: string }[];
};
type Category = { id: string; name: string; slug: string; active: boolean };
type Customer = { id: string; name: string; email: string; phone: string | null; createdAt: string; _count: { orders: number } };
type Coupon = { id: string; code: string; type: 'PERCENT' | 'FIXED'; value: number; minSubtotalCents: number; usageLimit: number | null; usedCount: number; startsAt: string; expiresAt: string | null; active: boolean };
type Review = { id: string; rating: number; comment: string; status: string; createdAt: string; product: { name: string; slug: string }; order: { number: number } };
type View = 'overview' | 'orders' | 'products' | 'customers' | 'shipping' | 'coupons' | 'notifications' | 'reviews';
type VariantDraft = { size: string; color: string; colorHex: string; price: string; stock: string };
type ProductEditDraft = { name: string; description: string; categoryId: string; shape: Product['shape']; hasPrint: boolean; weight: string; width: string; height: string; length: string; images: string };
type ShippingLabelDraft = { recipientCpf: string; invoiceKey: string };

async function toWebp(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Cada foto deve ter até 20 MB antes da conversão.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Não foi possível abrir ${file.name}.`)); });
    if (image.naturalWidth > 12000 || image.naturalHeight > 12000) throw new Error('A foto precisa ter no máximo 12.000 px em cada lado.');
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') throw new Error('Seu navegador não conseguiu converter a foto para WebP.');
    if (blob.size > 6 * 1024 * 1024) throw new Error('A foto ficou maior que 6 MB mesmo após a conversão.');
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
  } finally { URL.revokeObjectURL(source); }
}

function ProductImagesInput({ token, value, onChange }: { token: string; value: string; onChange: (value: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const urls = value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setUploadError('');
    try {
      const selectedFiles = Array.from(files);
      if (urls.length + selectedFiles.length > 20) throw new Error('Cada peça pode ter até 20 fotos.');
      let completedUrls = [...urls];
      for (const [index, sourceFile] of selectedFiles.entries()) {
        setUploadProgress(`PREPARANDO ${index + 1} DE ${selectedFiles.length}…`);
        if (!/^image\/(jpeg|png|webp)$/.test(sourceFile.type)) throw new Error('Escolha fotos JPEG, PNG ou WebP.');
        const image = await toWebp(sourceFile);
        const form = new FormData(); form.append('image', image);
        setUploadProgress(`ENVIANDO ${index + 1} DE ${selectedFiles.length}…`);
        const response = await fetch(`${API}/admin/media/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const data = await response.json().catch(() => null);
        if (response.status === 401) window.dispatchEvent(new Event('loja:admin-session-expired'));
        if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? `Falha ao enviar ${sourceFile.name}.`);
        if (typeof data?.url !== 'string') throw new Error('A API não retornou o endereço da foto.');
        completedUrls = [...completedUrls, data.url];
        onChange(completedUrls.join('\n'));
      }
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Não foi possível enviar as fotos.'); }
    finally { setUploading(false); setUploadProgress(''); }
  };

  return <div className="admin-image-field">
    <label>URLs das fotos <small>Uma URL HTTPS por linha (HTTP só em localhost); ou envie fotos do celular/computador.</small><textarea rows={2} value={value} disabled={uploading} onChange={(event) => onChange(event.target.value)} /></label>
    <label className="admin-image-upload">{uploading ? uploadProgress : 'ESCOLHER FOTOS'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || !token} onChange={(event) => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} /></label>
    <small>JPEG, PNG ou WebP · convertidas para WebP, até 2400 px e 6 MB · máximo 20 fotos.</small>
    {uploadError && <p role="alert" className="checkout-error">{uploadError}</p>}
    {urls.length > 0 && <div className="admin-image-previews">{urls.map((url, index) => <div key={`${url}-${index}`}><img src={url} alt={`Prévia da foto ${index + 1}`} loading="lazy" /><button type="button" disabled={uploading} aria-label={`Remover foto ${index + 1}`} onClick={() => onChange(urls.filter((_, current) => current !== index).join('\n'))}>REMOVER</button></div>)}</div>}
  </div>;
}

const labels: Record<string, string> = {
  AWAITING_PAYMENT: 'Aguardando pagamento', PAID: 'Pago', PROCESSING: 'Em preparação',
  SHIPPED: 'Enviado', DELIVERED: 'Entregue', CANCELED: 'Cancelado',
};
const nextStatuses: Record<string, string[]> = { AWAITING_PAYMENT: ['CANCELED'], PAID: ['PROCESSING'], PROCESSING: ['SHIPPED'], SHIPPED: ['DELIVERED'] };
const emptyVariant = (): VariantDraft => ({ size: 'M', color: 'Preto', colorHex: '#20221d', price: '', stock: '0' });
const productEditDraft = (product: Product): ProductEditDraft => ({
  name: product.name, description: product.description ?? '', categoryId: product.categoryId, shape: product.shape, hasPrint: product.hasPrint,
  weight: String(product.shippingWeightGrams ?? ''), width: String(product.shippingWidthCm ?? ''), height: String(product.shippingHeightCm ?? ''),
  length: String(product.shippingLengthCm ?? ''), images: product.images.map((image) => image.url).join('\n'),
});

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    window.dispatchEvent(new Event('loja:admin-session-expired'));
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  }
  if (!response.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message ?? 'Não foi possível concluir a operação');
  return data as T;
}

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [view, setView] = useState<View>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPageCount, setOrderPageCount] = useState(1);
  const [overviewSummary, setOverviewSummary] = useState<OverviewSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [shippingLabelDrafts, setShippingLabelDrafts] = useState<Record<string, ShippingLabelDraft>>({});
  const [shippingPrintUrls, setShippingPrintUrls] = useState<Record<string, string>>({});
  const [shippingTrackingStatuses, setShippingTrackingStatuses] = useState<Record<string, string>>({});
  const [shippingWorking, setShippingWorking] = useState<Record<string, string>>({});
  const [variantEdits, setVariantEdits] = useState<Record<string, { price: string; stock: string }>>({});
  const [newVariantDrafts, setNewVariantDrafts] = useState<Record<string, VariantDraft>>({});
  const [productEdits, setProductEdits] = useState<Record<string, ProductEditDraft>>({});
  const [newProductImages, setNewProductImages] = useState('');
  const [shippingStatus, setShippingStatus] = useState<{ appReady: boolean; connected: boolean; expiresAt: string | null; originCepConfigured: boolean; senderDataConfigured: boolean } | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<{ email: { configured: boolean; provider: string }; whatsapp: { configured: boolean; provider: string; template: string | null } } | null>(null);
  const [drafts, setDrafts] = useState<VariantDraft[]>([emptyVariant()]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { setToken(sessionStorage.getItem('loja:admin-token') ?? ''); setReady(true); }, []);
  useEffect(() => {
    const expireSession = () => {
      sessionStorage.removeItem('loja:admin-token');
      setToken('');
      setOrders([]); setOrderPage(1); setOrderTotal(0); setOrderPageCount(1); setOverviewSummary(null); setProducts([]); setCategories([]); setCustomers([]); setCoupons([]); setReviews([]);
      setShippingLabelDrafts({}); setShippingPrintUrls({}); setShippingTrackingStatuses({});
      setShippingStatus(null); setNotificationStatus(null);
      setError('Sua sessão expirou. Entre novamente para continuar.');
    };
    window.addEventListener('loja:admin-session-expired', expireSession);
    return () => window.removeEventListener('loja:admin-session-expired', expireSession);
  }, []);

  const loadOrders = useCallback(async (auth: string, page = 1) => {
    setLoading(true); setError('');
    try {
      const data = await api<AdminOrderPage>(`/admin/orders?page=${page}`, auth);
      setOrders(data.items); setOrderPage(data.page); setOrderTotal(data.total); setOrderPageCount(data.pageCount);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar pedidos'); }
    finally { setLoading(false); }
  }, []);

  const loadProducts = useCallback(async (auth: string) => {
    setLoading(true); setError('');
    try {
      const [productData, categoryData] = await Promise.all([
        api<Product[]>('/admin/products', auth), api<Category[]>('/admin/categories', auth),
      ]);
      setProducts(productData); setCategories(categoryData);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar catálogo'); }
    finally { setLoading(false); }
  }, []);

  const loadCustomers = useCallback(async (auth: string) => {
    setLoading(true); setError('');
    try { setCustomers(await api<Customer[]>('/admin/orders/customers', auth)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar clientes'); }
    finally { setLoading(false); }
  }, []);

  const loadShipping = useCallback(async (auth: string) => {
    setLoading(true); setError('');
    try { setShippingStatus(await api<{ appReady: boolean; connected: boolean; expiresAt: string | null; originCepConfigured: boolean; senderDataConfigured: boolean }>('/admin/shipping/status', auth)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao verificar Melhor Envio'); }
    finally { setLoading(false); }
  }, []);

  const loadReviews = useCallback(async (auth: string) => {
    setLoading(true); setError('');
    try { setReviews(await api<Review[]>('/admin/reviews?status=PENDING', auth)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar avaliações'); }
    finally { setLoading(false); }
  }, []);

  const loadOverview = useCallback(async (auth: string) => {
    setLoading(true); setError('');
    try { setOverviewSummary(await api<OverviewSummary>('/admin/orders/summary', auth)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar o resumo da loja'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    if (view === 'overview') void loadOverview(token);
    if (view === 'orders') void loadOrders(token);
    if (view === 'products') void loadProducts(token);
    if (view === 'customers') void loadCustomers(token);
    if (view === 'shipping') void loadShipping(token);
    if (view === 'notifications') { setLoading(true); setError(''); void api<typeof notificationStatus>('/admin/notifications/status', token).then(setNotificationStatus).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao verificar notificações')).finally(() => setLoading(false)); }
    if (view === 'reviews') void loadReviews(token);
    if (view === 'coupons') { setLoading(true); setError(''); void api<Coupon[]>('/admin/coupons', token).then(setCoupons).catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar cupons')).finally(() => setLoading(false)); }
  }, [ready, token, view, loadOverview, loadOrders, loadProducts, loadCustomers, loadShipping, loadReviews]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/auth/admin/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message ?? 'E-mail ou senha inválidos');
      sessionStorage.setItem('loja:admin-token', data.accessToken); setToken(data.accessToken);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entrar'); }
    finally { setLoading(false); }
  };

  const signOut = () => {
    sessionStorage.removeItem('loja:admin-token'); setToken('');
    setOrders([]); setOrderPage(1); setOrderTotal(0); setOrderPageCount(1); setOverviewSummary(null); setProducts([]); setCategories([]); setCustomers([]); setCoupons([]); setReviews([]);
    setShippingLabelDrafts({}); setShippingPrintUrls({}); setShippingTrackingStatuses({});
    setShippingStatus(null); setNotificationStatus(null); setError(''); setNotice('');
  };

  const updateStatus = async (order: Order, status: string, trackingCode?: string) => {
    setError(''); setNotice('');
    try {
      await api(`/admin/orders/${order.id}`, token, {
        method: 'PATCH', body: JSON.stringify({ status, ...((trackingCode ?? order.trackingCode) ? { trackingCode: (trackingCode ?? order.trackingCode)?.trim() } : {}) }),
      });
      setNotice(`Pedido #${order.number} atualizado.`); await loadOrders(token, orderPage);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar pedido'); }
  };

  const prepareShippingLabel = async (order: Order) => {
    const draft = shippingLabelDrafts[order.id] ?? { recipientCpf: '', invoiceKey: '' };
    const recipientCpf = draft.recipientCpf.replace(/\D/g, '');
    const invoiceKey = draft.invoiceKey.replace(/\D/g, '');
    if (!/^\d{11}$/.test(recipientCpf) || !/^\d{44}$/.test(invoiceKey)) { setError('Confira o CPF do destinatário e os 44 dígitos da chave da NF-e.'); return; }
    setError(''); setNotice(''); setShippingWorking((state) => ({ ...state, [order.id]: 'PREPARING' }));
    try {
      await api(`/admin/shipping/orders/${order.id}/label`, token, { method: 'POST', body: JSON.stringify({ recipientCpf, invoiceKey }) });
      setNotice(`Envio do pedido #${order.number} adicionado ao carrinho do Melhor Envio.`);
      setShippingLabelDrafts((state) => { const next = { ...state }; delete next[order.id]; return next; });
      await loadOrders(token, orderPage);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível preparar a etiqueta'); }
    finally { setShippingWorking((state) => { const next = { ...state }; delete next[order.id]; return next; }); }
  };

  const purchaseShippingLabel = async (order: Order) => {
    if (!window.confirm('O Melhor Envio vai cobrar este frete do saldo da carteira da loja. Confirme que o valor e o pedido estão corretos no carrinho do Melhor Envio. Deseja continuar?')) return;
    setError(''); setNotice(''); setShippingWorking((state) => ({ ...state, [order.id]: 'PURCHASING' }));
    try { await api(`/admin/shipping/orders/${order.id}/label/purchase`, token, { method: 'POST' }); setNotice(`Frete do pedido #${order.number} comprado.`); await loadOrders(token, orderPage); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível comprar o frete'); }
    finally { setShippingWorking((state) => { const next = { ...state }; delete next[order.id]; return next; }); }
  };

  const generateShippingLabel = async (order: Order) => {
    if (!window.confirm('Gerar a etiqueta comunica a transportadora sobre o envio. Confirme que a peça está separada e pronta para postagem.')) return;
    setError(''); setNotice(''); setShippingWorking((state) => ({ ...state, [order.id]: 'GENERATING' }));
    try { await api(`/admin/shipping/orders/${order.id}/label/generate`, token, { method: 'POST' }); setNotice(`Etiqueta do pedido #${order.number} gerada.`); await loadOrders(token, orderPage); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível gerar a etiqueta'); }
    finally { setShippingWorking((state) => { const next = { ...state }; delete next[order.id]; return next; }); }
  };

  const getShippingPrintLink = async (order: Order) => {
    setError(''); setShippingWorking((state) => ({ ...state, [order.id]: 'PRINTING' }));
    try { const result = await api<{ url: string }>(`/admin/shipping/orders/${order.id}/label/print`, token, { method: 'POST' }); setShippingPrintUrls((state) => ({ ...state, [order.id]: result.url })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível solicitar a impressão'); }
    finally { setShippingWorking((state) => { const next = { ...state }; delete next[order.id]; return next; }); }
  };

  const refreshShippingTracking = async (order: Order) => {
    setError(''); setShippingWorking((state) => ({ ...state, [order.id]: 'TRACKING' }));
    try {
      const result = await api<{ trackingCode: string | null; status: string | null }>(`/admin/shipping/orders/${order.id}/label/tracking`, token, { method: 'POST' });
      if (result.status) setShippingTrackingStatuses((state) => ({ ...state, [order.id]: result.status! }));
      setNotice(result.trackingCode ? `Rastreio atualizado: ${result.trackingCode}` : `Consulta concluída${result.status ? ` · ${result.status}` : ', ainda sem código de rastreio.'}`);
      await loadOrders(token, orderPage);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível consultar o rastreio'); }
    finally { setShippingWorking((state) => { const next = { ...state }; delete next[order.id]; return next; }); }
  };

  const moderateReview = async (review: Review, status: 'APPROVED' | 'REJECTED') => {
    setError(''); setNotice('');
    try { await api(`/admin/reviews/${review.id}`, token, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice(status === 'APPROVED' ? 'Avaliação publicada.' : 'Avaliação rejeitada.'); await loadReviews(token); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao moderar avaliação'); }
  };

  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      await api('/admin/categories', token, { method: 'POST', body: JSON.stringify({ name: form.get('categoryName') }) });
      target.reset(); setNotice('Categoria criada.'); await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar categoria'); }
  };

  const saveCategory = async (category: Category) => {
    const name = (categoryEdits[category.id] ?? category.name).trim();
    if (name.length < 2 || name.length > 120) { setError('O nome da categoria precisa ter de 2 a 120 caracteres.'); return; }
    setError(''); setNotice('');
    try {
      await api(`/admin/categories/${category.id}`, token, { method: 'PATCH', body: JSON.stringify({ name }) });
      setCategoryEdits((current) => { const next = { ...current }; delete next[category.id]; return next; });
      setNotice(`Categoria ${name} atualizada.`); await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a categoria'); }
  };

  const toggleCategory = async (category: Category) => {
    setError(''); setNotice('');
    try {
      await api(`/admin/categories/${category.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !category.active }) });
      setNotice(category.active ? `Categoria ${category.name} pausada; os produtos dela foram ocultados da vitrine.` : `Categoria ${category.name} reativada.`);
      await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a categoria'); }
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const target = event.currentTarget;
    const form = new FormData(target);
    const variants = drafts.map((variant) => ({
      size: variant.size.trim().toUpperCase(), color: variant.color.trim(), colorHex: variant.colorHex,
      priceCents: Math.round(Number(variant.price.replace(',', '.')) * 100), stockQty: Number(variant.stock),
    }));
    if (variants.some((variant) => !variant.size || !variant.color || !Number.isFinite(variant.priceCents) || variant.priceCents <= 0 || !Number.isInteger(variant.stockQty) || variant.stockQty < 0)) {
      setError('Revise tamanho, cor, preço e estoque de cada variação.'); return;
    }
    const images = String(form.get('images') ?? '').split(/\r?\n/).map((url) => url.trim()).filter(Boolean).map((url, position) => ({ url, position }));
    try {
      await api('/admin/products', token, { method: 'POST', body: JSON.stringify({
        name: form.get('name'), description: form.get('description'), categoryId: form.get('categoryId'),
        shape: form.get('shape'), hasPrint: form.get('hasPrint') === 'on', images, variants,
        shippingWeightGrams: Number(form.get('shippingWeightGrams')), shippingWidthCm: Number(form.get('shippingWidthCm')),
        shippingHeightCm: Number(form.get('shippingHeightCm')), shippingLengthCm: Number(form.get('shippingLengthCm')),
      }) });
      target.reset(); setDrafts([emptyVariant()]); setNewProductImages(''); setNotice('Produto cadastrado.'); await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível cadastrar produto'); }
  };

  const toggleProduct = async (product: Product) => {
    setError('');
    try { await api(`/admin/products/${product.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) }); await loadProducts(token); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar produto'); }
  };

  const saveVariant = async (variant: Variant) => {
    const edit = variantEdits[variant.id] ?? { price: (variant.priceCents / 100).toFixed(2).replace('.', ','), stock: String(variant.stockQty) };
    const priceCents = Math.round(Number(edit.price.replace(',', '.')) * 100);
    const stockQty = Number(edit.stock);
    if (!Number.isSafeInteger(priceCents) || priceCents < 1 || !Number.isSafeInteger(stockQty) || stockQty < 0) { setError('Informe preço positivo e estoque igual ou maior que zero.'); return; }
    setError(''); setNotice('');
    try {
      await api(`/admin/variants/${variant.id}`, token, { method: 'PATCH', body: JSON.stringify({ priceCents, stockQty }) });
      setVariantEdits((current) => { const next = { ...current }; delete next[variant.id]; return next; });
      setNotice('Preço e estoque atualizados.'); await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar a variação'); }
  };

  const toggleVariant = async (variant: Variant) => {
    setError(''); setNotice('');
    try {
      await api(`/admin/variants/${variant.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !variant.active }) });
      setNotice(`Variação ${variant.color} / ${variant.size} ${variant.active ? 'pausada' : 'reativada'}.`);
      await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a variação'); }
  };

  const addProductVariant = async (event: FormEvent<HTMLFormElement>, product: Product) => {
    event.preventDefault(); setError(''); setNotice('');
    const draft = newVariantDrafts[product.id] ?? emptyVariant();
    const size = draft.size.trim().toUpperCase();
    const color = draft.color.trim();
    const priceCents = Math.round(Number(draft.price.replace(',', '.')) * 100);
    const stockQty = Number(draft.stock);
    if (!/^[A-Z0-9]{1,12}$/.test(size) || !color || color.length > 40 || !/^#[0-9a-fA-F]{6}$/.test(draft.colorHex) || !Number.isSafeInteger(priceCents) || priceCents < 1 || !Number.isSafeInteger(stockQty) || stockQty < 0) {
      setError('Revise tamanho, cor, preço e estoque da nova variação.'); return;
    }
    if (product.variants.some((variant) => variant.size.toUpperCase() === size && variant.color.toLocaleLowerCase('pt-BR') === color.toLocaleLowerCase('pt-BR'))) {
      setError('Essa combinação de tamanho e cor já existe nesta peça.'); return;
    }
    try {
      await api(`/admin/products/${product.id}/variants`, token, { method: 'POST', body: JSON.stringify({ size, color, colorHex: draft.colorHex, priceCents, stockQty }) });
      setNewVariantDrafts((current) => ({ ...current, [product.id]: emptyVariant() }));
      setNotice(`Variação ${color} / ${size} adicionada a ${product.name}.`);
      await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível adicionar a variação'); }
  };

  const saveProduct = async (product: Product) => {
    const edit = productEdits[product.id] ?? productEditDraft(product);
    const dimensions = [edit.weight, edit.width, edit.height, edit.length].map((value) => Number(value));
    const imageUrls = edit.images.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (edit.name.trim().length < 2 || !edit.categoryId || dimensions.some((value) => !Number.isSafeInteger(value) || value < 1) || dimensions[0] > 30000 || dimensions.slice(1).some((value) => value > 200)) {
      setError('Revise nome, categoria, peso e dimensões do produto.'); return;
    }
    if (imageUrls.length > 20 || imageUrls.some((url) => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })) {
      setError('Use até 20 URLs de imagem válidas com HTTPS.'); return;
    }
    setError(''); setNotice('');
    try {
      const originalImages = product.images.map((image) => image.url).join('\n');
      await api(`/admin/products/${product.id}`, token, { method: 'PATCH', body: JSON.stringify({
        name: edit.name.trim(), description: edit.description.slice(0, 3000), categoryId: edit.categoryId,
        shape: edit.shape, hasPrint: edit.hasPrint, shippingWeightGrams: dimensions[0], shippingWidthCm: dimensions[1],
        shippingHeightCm: dimensions[2], shippingLengthCm: dimensions[3], ...(edit.images !== originalImages ? { images: imageUrls.map((url, position) => ({ url, position })) } : {}),
      }) });
      setProductEdits((current) => { const next = { ...current }; delete next[product.id]; return next; });
      setNotice(`Produto ${product.name} atualizado.`); await loadProducts(token);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao atualizar o produto'); }
  };

  const connectShipping = async () => {
    setError(''); setLoading(true);
    try { const result = await api<{ url: string }>('/admin/shipping/authorize', token); window.location.assign(result.url); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar a conexão'); setLoading(false); }
  };

  const createCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    const target = event.currentTarget; const form = new FormData(target);
    const type = String(form.get('type')) as Coupon['type'];
    const rawValue = Number(String(form.get('value')).replace(',', '.'));
    const value = type === 'FIXED' ? Math.round(rawValue * 100) : Math.round(rawValue);
    const minimum = Math.round(Number(String(form.get('minimum') || '0').replace(',', '.')) * 100);
    const limit = String(form.get('limit') || ''); const expiry = String(form.get('expiry') || '');
    if (!Number.isSafeInteger(value) || value < 1 || (type === 'PERCENT' && value > 90) || (type === 'FIXED' && value > 100000000) || !Number.isSafeInteger(minimum) || minimum < 0) { setError('Revise o valor do cupom e o mínimo do pedido.'); return; }
    try {
      await api('/admin/coupons', token, { method: 'POST', body: JSON.stringify({ code: form.get('code'), type, value, minSubtotalCents: minimum, ...(limit ? { usageLimit: Number(limit) } : {}), ...(expiry ? { expiresAt: new Date(`${expiry}T23:59:59.000Z`).toISOString() } : {}) }) });
      target.reset(); setNotice('Cupom criado.'); setLoading(true); setCoupons(await api<Coupon[]>('/admin/coupons', token));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar cupom'); }
    finally { setLoading(false); }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setError(''); setNotice('');
    try { await api(`/admin/coupons/${coupon.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !coupon.active }) }); setCoupons(await api<Coupon[]>('/admin/coupons', token)); setNotice(`Cupom ${coupon.code} atualizado.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar cupom'); }
  };

  if (!ready) return <main className="admin-page"><section className="admin-card admin-loading-card" aria-busy="true">
    <p className="eyebrow">AGAPE / PAINEL DA LOJA</p>
    <p role="status">Verificando seu acesso…</p>
  </section></main>;
  if (!token) return <main className="admin-page"><section className="admin-card">
    <a className="logo" href="/" aria-label="Voltar para a Agape"><span className="logo-mark" aria-hidden="true"><NextImage src="/agape-logo.png" alt="" width={44} height={44} /></span><span className="logo-word">Agape</span><small>MS</small></a>
    <h1>ÁREA DA LOJA</h1><p className="mute">Entre para cuidar do catálogo e dos pedidos.</p>
    <form className="admin-form" onSubmit={login}>
      <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="checkout-error">{error}</p>}
      <button type="submit" disabled={loading}>{loading ? 'ENTRANDO…' : 'ENTRAR'}</button>
    </form>
  </section></main>;

  return <main className="admin-page">
    <header className="admin-header"><a className="logo" href="/" aria-label="Voltar à loja"><span className="logo-mark" aria-hidden="true"><NextImage src="/agape-logo.png" alt="" width={44} height={44} /></span><span className="logo-word">Agape</span><small>MS</small></a><button type="button" onClick={signOut}>SAIR</button></header>
    <div className="admin-title"><div><p className="eyebrow">AGAPE / PAINEL DA LOJA</p><h1>{view === 'overview' ? 'Visão geral' : view === 'orders' ? 'Pedidos' : view === 'products' ? 'Catálogo' : view === 'customers' ? 'Clientes' : view === 'coupons' ? 'Cupons' : view === 'notifications' ? 'Notificações' : view === 'reviews' ? 'Avaliações' : 'Entrega'}</h1></div><a className="admin-store-link" href="/">VER A LOJA ↗</a></div>
    <nav className="admin-tabs" aria-label="Seções do painel">
      {([['overview', 'INÍCIO'], ['orders', 'PEDIDOS'], ['products', 'PRODUTOS'], ['customers', 'CLIENTES'], ['coupons', 'CUPONS'], ['reviews', 'AVALIAÇÕES'], ['shipping', 'ENTREGA'], ['notifications', 'AVISOS']] as [View, string][]).map(([value, label]) => <button key={value} type="button" aria-current={view === value ? 'page' : undefined} onClick={() => { setView(value); setError(''); setNotice(''); }}>{label}</button>)}
    </nav>
    {error && <p role="alert" className="checkout-error">{error}</p>}
    {notice && <p role="status" className="admin-notice">{notice}</p>}
    {loading && <p role="status" className="admin-message">Carregando…</p>}

    {!loading && view === 'overview' && overviewSummary && (() => {
      const summary = overviewSummary;
      return <div className="admin-overview">
        <section className="admin-overview-intro"><div><p className="eyebrow">BEM-VINDE À OPERAÇÃO</p><h2>O que precisa da sua atenção hoje?</h2><p>Pedidos, estoque e avaliações reunidos em um só lugar.</p></div><button type="button" onClick={() => void loadOverview(token)}>ATUALIZAR RESUMO ↻</button></section>
        <section className="admin-overview-metrics" aria-label="Resumo da loja">
          <article><span>PEDIDOS EM ANDAMENTO</span><strong>{summary.activeOrderCount}</strong><small>Pedidos pagos, em preparo ou enviados</small></article>
          <article><span>AGUARDANDO PAGAMENTO</span><strong>{summary.waitingPaymentCount}</strong><small>Pedidos que ainda não foram confirmados</small></article>
          <article><span>ESTOQUE BAIXO</span><strong>{summary.lowStockVariantCount}</strong><small>Variações ativas com 2 unidades ou menos</small></article>
          <article><span>AVALIAÇÕES PENDENTES</span><strong>{summary.pendingReviewCount}</strong><small>Comentários aguardando sua revisão</small></article>
        </section>
        <section className="admin-overview-grid">
          <div className="admin-panel"><div className="admin-overview-section-head"><div><p className="eyebrow">OPERAÇÃO</p><h2>PEDIDOS RECENTES</h2></div><button type="button" className="small-action" onClick={() => setView('orders')}>VER TODOS</button></div>
            {summary.recentOrders.length === 0 ? <p className="mute">Ainda não há pedidos. Quando uma compra for confirmada, ela aparecerá aqui.</p> : <ul className="admin-overview-orders">{summary.recentOrders.map((order) => <li key={order.id}><div><strong>#{order.number} · {order.customer.name}</strong><small>{new Date(order.createdAt).toLocaleDateString('pt-BR')} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} peça(s)</small></div><span>{labels[order.status] ?? order.status}</span></li>)}</ul>}
          </div>
          <div className="admin-panel"><p className="eyebrow">ATALHOS</p><h2>ACESSO RÁPIDO</h2><div className="admin-overview-actions">
            <button type="button" onClick={() => setView('products')}><strong>Gerenciar produtos</strong><span>Fotos, preços e estoque ↗</span></button>
            <button type="button" onClick={() => setView('orders')}><strong>Preparar pedidos</strong><span>Separação, envio e rastreio ↗</span></button>
            <button type="button" onClick={() => setView('coupons')}><strong>Criar um cupom</strong><span>Ofereça um incentivo de compra ↗</span></button>
            <a href="https://wa.me/5567981617997" target="_blank" rel="noreferrer"><strong>Atender no WhatsApp</strong><span>Falar com clientes ↗</span></a>
          </div></div>
        </section>
      </div>;
    })()}

    {!loading && view === 'orders' && (orders.length === 0 ? <p className="admin-message">Ainda não há pedidos.</p> : <div className="admin-order-list">{orders.map((order) => <article className="admin-order-card" key={order.id}>
      <header className="admin-order-head"><div><p>PEDIDO <strong>#{order.number}</strong></p><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString('pt-BR')}</time></div><strong className="admin-order-total">{brl(order.totalCents)}</strong></header>
      <div className="admin-order-details">
        <section><h2>CLIENTE</h2><strong>{order.customer.name}</strong><a href={`mailto:${order.customer.email}`}>{order.customer.email}</a>{order.customer.phone && <a href={`tel:${order.customer.phone.replace(/\D/g, '')}`}>{order.customer.phone}</a>}</section>
        <section><h2>ITENS · {order.items.reduce((total, item) => total + item.quantity, 0)}</h2><ul>{order.items.map((item, index) => <li key={index}>{item.quantity}× {item.productName} · {item.color} / {item.size}</li>)}</ul></section>
        <section><h2>ENTREGA</h2><address>{order.shippingAddress.street}, {order.shippingAddress.number}{order.shippingAddress.complement ? ` · ${order.shippingAddress.complement}` : ''}<br />{order.shippingAddress.neighborhood}<br />{order.shippingAddress.city} / {order.shippingAddress.state} · CEP {order.shippingAddress.cep}</address></section>
        <section><h2>FRETE CONTRATADO</h2>{order.shippingQuote ? <><strong>{order.shippingQuote.companyName} · {order.shippingQuote.serviceName}</strong><p>{brl(order.shippingQuote.priceCents)} · prazo estimado de {order.shippingQuote.deliveryDays} {order.shippingQuote.deliveryDays === 1 ? 'dia útil' : 'dias úteis'}</p></> : <p>Dados da cotação indisponíveis.</p>}</section>
      </div>
      <div className="admin-order-ops"><label>Status<select aria-label={`Status do pedido ${order.number}`} value={order.status} onChange={(event) => void updateStatus(order, event.target.value)} disabled={order.status === 'CANCELED'}>
        {[order.status, ...(nextStatuses[order.status] ?? [])].map((value) => <option key={value} value={value}>{labels[value]}</option>)}
      </select></label>{(order.status === 'PROCESSING' || order.status === 'SHIPPED') && <form className="tracking-form" onSubmit={(event) => { event.preventDefault(); void updateStatus(order, 'SHIPPED', trackingDrafts[order.id] ?? order.trackingCode ?? ''); }}>
        <label className="sr-only" htmlFor={`tracking-${order.id}`}>Código de rastreio do pedido {order.number}</label>
        <input id={`tracking-${order.id}`} minLength={3} maxLength={80} value={trackingDrafts[order.id] ?? order.trackingCode ?? ''} onChange={(event) => setTrackingDrafts((drafts) => ({ ...drafts, [order.id]: event.target.value }))} placeholder="Código de rastreio" required />
        <button type="submit" className="small-action">{order.status === 'SHIPPED' ? 'SALVAR CÓDIGO' : 'MARCAR ENVIADO'}</button>
      </form>}{order.trackingCode && <p className="admin-order-tracking">Rastreio: <strong>{order.trackingCode}</strong></p>}</div>
      {(order.status === 'PAID' || order.status === 'PROCESSING' || order.shippingLabelStatus) && <section className="shipping-label-tools" aria-label={`Expedição do pedido ${order.number}`}>
        <div><h2>ETIQUETA E RASTREIO</h2><p>{order.shippingLabelStatus ? `Etapa: ${({ PREPARING: 'adicionando ao carrinho', CARTED: 'no carrinho do Melhor Envio', PURCHASING: 'compra em andamento', PURCHASED: 'frete pago', GENERATING: 'geração em andamento', GENERATED: 'etiqueta gerada', CART_REVIEW: 'conferência manual necessária', PAYMENT_REVIEW: 'confira a compra na conta Melhor Envio', GENERATION_REVIEW: 'confira a geração na conta Melhor Envio' } as Record<string, string>)[order.shippingLabelStatus] ?? order.shippingLabelStatus}` : 'Preparar a etiqueta envia a chave da NF-e e o CPF diretamente ao Melhor Envio; esses dados não são salvos nesta loja.'}</p></div>
        {!order.shippingLabelStatus && (order.status === 'PAID' || order.status === 'PROCESSING') && <form className="shipping-label-form" onSubmit={(event) => { event.preventDefault(); void prepareShippingLabel(order); }}>
          <label>CPF do destinatário<input inputMode="numeric" autoComplete="off" value={shippingLabelDrafts[order.id]?.recipientCpf ?? ''} onChange={(event) => setShippingLabelDrafts((state) => ({ ...state, [order.id]: { ...(state[order.id] ?? { recipientCpf: '', invoiceKey: '' }), recipientCpf: event.target.value.replace(/\D/g, '').slice(0, 11) } }))} pattern="[0-9]{11}" minLength={11} maxLength={11} required /></label>
          <label>Chave de acesso NF-e<input inputMode="numeric" autoComplete="off" value={shippingLabelDrafts[order.id]?.invoiceKey ?? ''} onChange={(event) => setShippingLabelDrafts((state) => ({ ...state, [order.id]: { ...(state[order.id] ?? { recipientCpf: '', invoiceKey: '' }), invoiceKey: event.target.value.replace(/\D/g, '').slice(0, 44) } }))} pattern="[0-9]{44}" minLength={44} maxLength={44} required /></label>
          <button type="submit" className="small-action" disabled={Boolean(shippingWorking[order.id]) || Boolean(shippingStatus && (!shippingStatus.connected || !shippingStatus.senderDataConfigured))}>{shippingWorking[order.id] === 'PREPARING' ? 'PREPARANDO…' : 'ADICIONAR AO CARRINHO'}</button>
        </form>}
        {order.shippingLabelStatus === 'CARTED' && <button type="button" className="small-action" disabled={Boolean(shippingWorking[order.id])} onClick={() => void purchaseShippingLabel(order)}>{shippingWorking[order.id] === 'PURCHASING' ? 'COMPRANDO…' : 'COMPRAR FRETE · USA SALDO DA LOJA'}</button>}
        {order.shippingLabelStatus === 'PURCHASED' && <button type="button" className="small-action" disabled={Boolean(shippingWorking[order.id])} onClick={() => void generateShippingLabel(order)}>{shippingWorking[order.id] === 'GENERATING' ? 'GERANDO…' : 'GERAR ETIQUETA'}</button>}
        {order.shippingLabelStatus === 'GENERATED' && <div className="shipping-label-actions">
          <button type="button" className="small-action" disabled={Boolean(shippingWorking[order.id])} onClick={() => void getShippingPrintLink(order)}>{shippingWorking[order.id] === 'PRINTING' ? 'PREPARANDO…' : 'SOLICITAR IMPRESSÃO'}</button>
          {shippingPrintUrls[order.id] && <a className="small-action" href={shippingPrintUrls[order.id]} target="_blank" rel="noreferrer">ABRIR ETIQUETA PRIVADA ↗</a>}
          <p>O link de impressão é privado e pode pedir uma sessão ativa do Melhor Envio no navegador.</p>
          <button type="button" className="small-action" disabled={Boolean(shippingWorking[order.id])} onClick={() => void refreshShippingTracking(order)}>{shippingWorking[order.id] === 'TRACKING' ? 'CONSULTANDO…' : 'ATUALIZAR RASTREIO'}</button>
          {(shippingTrackingStatuses[order.id] || order.trackingCode) && <p className="admin-order-tracking">{shippingTrackingStatuses[order.id] ? `Transportadora: ${shippingTrackingStatuses[order.id]} · ` : ''}Código: <strong>{order.trackingCode ?? 'aguardando'}</strong></p>}
        </div>}
        {['CART_REVIEW', 'PAYMENT_REVIEW', 'GENERATION_REVIEW'].includes(order.shippingLabelStatus ?? '') && <p role="alert" className="shipping-label-review">A operação pode ter sido concluída no Melhor Envio apesar da resposta incerta. Confira o pedido na conta do Melhor Envio antes de repetir qualquer etapa. O código de rastreio também pode ser informado manualmente acima.</p>}
        {shippingStatus && !shippingStatus.senderDataConfigured && !order.shippingLabelStatus && <p className="mute">Configure os dados fiscais e o endereço do remetente no backend para habilitar etiquetas.</p>}
      </section>}
    </article>)}</div>)}

    {!loading && view === 'orders' && orderTotal > 0 && <nav className="admin-pagination" aria-label="Páginas de pedidos"><span>Mostrando {(orderPage - 1) * 50 + 1}–{Math.min(orderPage * 50, orderTotal)} de {orderTotal} pedidos</span><div><button type="button" disabled={orderPage <= 1} onClick={() => void loadOrders(token, orderPage - 1)}>ANTERIOR</button><span>Página {orderPage} de {orderPageCount}</span><button type="button" disabled={orderPage >= orderPageCount} onClick={() => void loadOrders(token, orderPage + 1)}>PRÓXIMA</button></div></nav>}

    {!loading && view === 'products' && <div className="admin-catalog">
      <section className="admin-panel"><h2>NOVO PRODUTO</h2>
        {!categories.some((category) => category.active) && <p className="mute">Crie ou reative uma categoria antes de cadastrar produtos.</p>}
        <form className="admin-form product-admin-form" onSubmit={createProduct}>
          <label>Nome da peça<input name="name" minLength={2} required /></label>
          <label>Descrição<textarea name="description" rows={3} /></label>
          <div className="admin-form-row">
            <label>Categoria<select name="categoryId" required>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Silhueta<select name="shape"><option value="tee">Camiseta</option><option value="long">Manga longa</option><option value="tank">Regata</option></select></label>
          </div>
          <label className="admin-check"><input type="checkbox" name="hasPrint" /> A peça tem estampa</label>
          <div className="admin-form-row">
            <label>Peso (g)<input name="shippingWeightGrams" type="number" min="1" required placeholder="300" /></label>
            <label>Largura (cm)<input name="shippingWidthCm" type="number" min="1" required placeholder="25" /></label>
            <label>Altura (cm)<input name="shippingHeightCm" type="number" min="1" required placeholder="5" /></label>
            <label>Comprimento (cm)<input name="shippingLengthCm" type="number" min="1" required placeholder="30" /></label>
          </div>
          <input type="hidden" name="images" value={newProductImages} readOnly />
          <ProductImagesInput token={token} value={newProductImages} onChange={setNewProductImages} />
          <div className="admin-variants-heading"><h3>VARIAÇÕES</h3><button type="button" onClick={() => setDrafts((items) => [...items, emptyVariant()])}>+ ADICIONAR TAMANHO/COR</button></div>
          {drafts.map((variant, index) => <div className="variant-draft" key={index}>
            <label>Tamanho<input value={variant.size} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, size: event.target.value } : item))} required /></label>
            <label>Cor<input value={variant.color} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, color: event.target.value } : item))} required /></label>
            <label>Hex<input type="color" value={variant.colorHex} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, colorHex: event.target.value } : item))} /></label>
            <label>Preço R$<input inputMode="decimal" value={variant.price} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} placeholder="89,90" required /></label>
            <label>Estoque<input type="number" min="0" step="1" value={variant.stock} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, stock: event.target.value } : item))} required /></label>
            {drafts.length > 1 && <button className="remove-variant" type="button" aria-label={`Remover variação ${index + 1}`} onClick={() => setDrafts((items) => items.filter((_, i) => i !== index))}>×</button>}
          </div>)}
          <button type="submit" disabled={!categories.some((category) => category.active) || loading}>CADASTRAR PEÇA</button>
        </form>
      </section>
      <section className="admin-panel"><h2>CATEGORIAS</h2>
        {categories.length === 0 ? <p className="mute">Nenhuma categoria cadastrada.</p> : <div className="admin-category-list">{categories.map((category) => <div className="admin-category-item" key={category.id}>
          <label><span>{category.active ? 'ATIVA' : 'PAUSADA'} · /{category.slug}</span><input aria-label={`Nome da categoria ${category.name}`} maxLength={120} value={categoryEdits[category.id] ?? category.name} onChange={(event) => setCategoryEdits((current) => ({ ...current, [category.id]: event.target.value }))} /></label>
          <div><button type="button" className="small-action" disabled={loading} onClick={() => void saveCategory(category)}>SALVAR NOME</button><button type="button" className="small-action" disabled={loading} aria-pressed={category.active} onClick={() => void toggleCategory(category)}>{category.active ? 'PAUSAR' : 'REATIVAR'}</button></div>
        </div>)}</div>}
        <form className="admin-category-form" onSubmit={createCategory}><label>Nova categoria<input name="categoryName" minLength={2} maxLength={120} required /></label><button type="submit" disabled={loading}>CRIAR</button></form>
      </section>
      <section className="admin-panel"><h2>PEÇAS CADASTRADAS <span>{products.length}</span></h2>
        {products.length === 0 ? <p className="admin-message">Cadastre seu estoque real para liberar o catálogo público. Os exemplos da vitrine não são enviados ao banco.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Peça</th><th>Variações</th><th>Preço inicial</th><th>Estoque</th><th>Visibilidade</th></tr></thead><tbody>
          {products.map((product) => { const prices = product.variants.filter((variant) => variant.active).map((variant) => variant.priceCents); const stock = product.variants.reduce((total, variant) => total + variant.stockQty, 0); const productEdit = productEdits[product.id] ?? productEditDraft(product); const setProductField = (key: keyof ProductEditDraft, value: string | boolean) => setProductEdits((current) => ({ ...current, [product.id]: { ...productEdit, [key]: value } as ProductEditDraft })); return <Fragment key={product.id}><tr>
            <td><b>{product.name}</b><br /><small>{product.category.name} · /produto/{product.slug}</small></td>
            <td>{product.variants.filter((variant) => variant.active).length} ativas</td><td>{prices.length ? brl(Math.min(...prices)) : '—'}</td><td>{stock}</td>
            <td><button type="button" className="small-action" onClick={() => void toggleProduct(product)}>{product.active ? 'ATIVO · OCULTAR' : 'INATIVO · PUBLICAR'}</button></td>
          </tr><tr className="admin-product-edit-row"><td colSpan={5}><details><summary>EDITAR PRODUTO, PREÇO E ESTOQUE</summary><div className="admin-product-fields">
            <label>Nome<input maxLength={120} value={productEdit.name} onChange={(event) => setProductField('name', event.target.value)} /></label>
            <label>Descrição<textarea rows={3} maxLength={3000} value={productEdit.description} onChange={(event) => setProductField('description', event.target.value)} /></label>
            <div className="admin-form-row"><label>Categoria<select value={productEdit.categoryId} onChange={(event) => setProductField('categoryId', event.target.value)}>{!product.category.active && <option value={product.categoryId} disabled>{product.category.name} · PAUSADA</option>}{categories.filter((category) => category.active && category.id !== product.categoryId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>Silhueta<select value={productEdit.shape} onChange={(event) => setProductField('shape', event.target.value as Product['shape'])}><option value="tee">Camiseta</option><option value="long">Manga longa</option><option value="tank">Regata</option></select></label>
              <label className="admin-check"><input type="checkbox" checked={productEdit.hasPrint} onChange={(event) => setProductField('hasPrint', event.target.checked)} /> Estampada</label></div>
            <div className="admin-form-row"><label>Peso (g)<input type="number" min="1" max="30000" value={productEdit.weight} onChange={(event) => setProductField('weight', event.target.value)} /></label><label>Largura (cm)<input type="number" min="1" max="200" value={productEdit.width} onChange={(event) => setProductField('width', event.target.value)} /></label><label>Altura (cm)<input type="number" min="1" max="200" value={productEdit.height} onChange={(event) => setProductField('height', event.target.value)} /></label><label>Comprimento (cm)<input type="number" min="1" max="200" value={productEdit.length} onChange={(event) => setProductField('length', event.target.value)} /></label></div>
            <ProductImagesInput token={token} value={productEdit.images} onChange={(value) => setProductField('images', value)} />
            <button type="button" className="small-action" onClick={() => void saveProduct(product)}>SALVAR DADOS DA PEÇA</button>
          </div><div className="admin-inline-variants">{product.variants.map((variant) => {
            const edit = variantEdits[variant.id] ?? { price: (variant.priceCents / 100).toFixed(2).replace('.', ','), stock: String(variant.stockQty) };
            return <div className="admin-inline-variant" key={variant.id}><strong>{variant.color} / {variant.size}{!variant.active && <small> · PAUSADA</small>}</strong><label>Preço R$<input inputMode="decimal" value={edit.price} onChange={(event) => setVariantEdits((current) => ({ ...current, [variant.id]: { ...edit, price: event.target.value } }))} /></label><label>Estoque<input type="number" min="0" step="1" value={edit.stock} onChange={(event) => setVariantEdits((current) => ({ ...current, [variant.id]: { ...edit, stock: event.target.value } }))} /></label><button type="button" className="small-action" onClick={() => void saveVariant(variant)}>SALVAR</button><button type="button" className="small-action" onClick={() => void toggleVariant(variant)}>{variant.active ? 'PAUSAR' : 'REATIVAR'}</button></div>;
          })}</div><form className="admin-inline-variants" onSubmit={(event) => void addProductVariant(event, product)}>
            <div className="admin-variants-heading"><h3>ADICIONAR VARIAÇÃO</h3><span className="mute">Tamanho + cor</span></div>
            {(() => { const draft = newVariantDrafts[product.id] ?? emptyVariant(); const update = (key: keyof VariantDraft, value: string) => setNewVariantDrafts((current) => ({ ...current, [product.id]: { ...draft, [key]: value } })); return <div className="variant-draft">
              <label>Tamanho<input maxLength={12} value={draft.size} onChange={(event) => update('size', event.target.value)} required /></label>
              <label>Cor<input maxLength={40} value={draft.color} onChange={(event) => update('color', event.target.value)} required /></label>
              <label>Hex<input type="color" value={draft.colorHex} onChange={(event) => update('colorHex', event.target.value)} /></label>
              <label>Preço R$<input inputMode="decimal" value={draft.price} onChange={(event) => update('price', event.target.value)} placeholder="89,90" required /></label>
              <label>Estoque<input type="number" min="0" step="1" value={draft.stock} onChange={(event) => update('stock', event.target.value)} required /></label>
              <button type="submit" className="small-action">ADICIONAR</button>
            </div>; })()}
          </form></details></td></tr></Fragment>; })}
        </tbody></table></div>}
      </section>
    </div>}

    {!loading && view === 'customers' && (customers.length === 0 ? <p className="admin-message">Os clientes aparecem aqui quando houver pedidos.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Pedidos</th><th>Cadastro</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}>
      <td>{customer.name}</td><td>{customer.email}</td><td>{customer.phone ?? '—'}</td><td>{customer._count.orders}</td><td>{new Date(customer.createdAt).toLocaleDateString('pt-BR')}</td>
    </tr>)}</tbody></table></div>)}

    {!loading && view === 'coupons' && <div className="admin-catalog"><section className="admin-panel"><h2>NOVO CUPOM</h2><form className="admin-form" onSubmit={createCoupon}><label>Código<input name="code" minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" required placeholder="BANDO10" /></label><div className="admin-form-row"><label>Tipo<select name="type"><option value="PERCENT">Porcentagem</option><option value="FIXED">Valor em reais</option></select></label><label>Valor<input name="value" type="number" min="0.01" step="0.01" required placeholder="10" /></label></div><div className="admin-form-row"><label>Pedido mínimo (R$)<input name="minimum" type="number" min="0" step="0.01" defaultValue="0" /></label><label>Limite de usos<input name="limit" type="number" min="1" step="1" placeholder="Sem limite" /></label></div><label>Válido até<input name="expiry" type="date" /></label><p className="mute">Descontos percentuais são limitados a 90%. Cupons são aplicados aos produtos; frete fica fora do desconto.</p><button type="submit">CRIAR CUPOM</button></form></section><section className="admin-panel"><h2>CUPONS CADASTRADOS · {coupons.length}</h2>{coupons.length === 0 ? <p className="mute">Nenhum cupom cadastrado.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Código</th><th>Desconto</th><th>Usos</th><th>Validade</th><th>Status</th></tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id}><td><strong>{coupon.code}</strong></td><td>{coupon.type === 'PERCENT' ? `${coupon.value}%` : brl(coupon.value)}<br /><small>Mínimo {brl(coupon.minSubtotalCents)}</small></td><td>{coupon.usedCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}</td><td>{coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('pt-BR') : 'Sem expiração'}</td><td><button type="button" className="small-action" onClick={() => void toggleCoupon(coupon)}>{coupon.active ? 'ATIVO · DESATIVAR' : 'INATIVO · ATIVAR'}</button></td></tr>)}</tbody></table></div>}</section></div>}

    {!loading && view === 'shipping' && <section className="admin-panel admin-shipping-panel"><p className="eyebrow">INTEGRAÇÃO DE FRETE</p><h2>MELHOR ENVIO</h2>
      <p className="mute">{shippingStatus?.connected ? `Conta conectada${shippingStatus.expiresAt ? ` · token válido até ${new Date(shippingStatus.expiresAt).toLocaleString('pt-BR')}` : ''}.` : 'Conta ainda não conectada.'}</p>
      <ul><li>Aplicativo OAuth: {shippingStatus?.appReady ? 'configurado' : 'faltam credenciais no backend'}</li><li>CEP de origem: {shippingStatus?.originCepConfigured ? 'configurado' : 'não configurado'}</li><li>Dados fiscais e endereço do remetente: {shippingStatus?.senderDataConfigured ? 'configurados' : 'pendentes'}</li><li>Peso e dimensões: exigidos ao cadastrar cada produto</li></ul>
      <button type="button" disabled={!shippingStatus?.appReady || loading} onClick={() => void connectShipping()}>{shippingStatus?.connected ? 'CONECTAR NOVAMENTE' : 'CONECTAR MELHOR ENVIO'}</button>
      <p className="mute">Para proteger sua conta, os segredos OAuth ficam somente no servidor. Nos pedidos pagos, prepare a etiqueta com CPF e NF-e, confirme a compra do saldo, gere a etiqueta e solicite o link privado de impressão. Se uma operação perder a resposta, confira a conta Melhor Envio antes de tentar novamente.</p>
    </section>}
    {!loading && view === 'notifications' && <section className="admin-panel admin-shipping-panel"><p className="eyebrow">ATUALIZAÇÕES DE PEDIDO</p><h2>CANAIS TRANSACIONAIS</h2>
      <ul><li>E-mail · {notificationStatus?.email.configured ? 'Resend configurado' : 'credenciais do Resend pendentes'}</li><li>WhatsApp · {notificationStatus?.whatsapp.configured ? `Cloud API configurada${notificationStatus.whatsapp.template ? ` · template ${notificationStatus.whatsapp.template}` : ''}` : 'credenciais ou template do WhatsApp pendentes'}</li></ul>
      <p className="mute">Os avisos são enfileirados quando o pagamento é confirmado e quando o pedido é enviado ou entregue. WhatsApp só é usado se o cliente marcar a opção de atualizações no checkout. As credenciais permanecem no backend.</p>
    </section>}
    {!loading && view === 'reviews' && <section className="admin-panel"><p className="eyebrow">PROVA SOCIAL COM COMPRA VERIFICADA</p><h2>AVALIAÇÕES PENDENTES · {reviews.length}</h2>
      {reviews.length === 0 ? <p className="mute">Nenhuma avaliação aguarda revisão.</p> : <div className="admin-review-list">{reviews.map((review) => <article key={review.id}><p><strong>{review.product.name}</strong> · pedido #{review.order.number}</p><p aria-label={`${review.rating} de 5 estrelas`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p><blockquote>{review.comment}</blockquote><small>{new Date(review.createdAt).toLocaleString('pt-BR')}</small><div><button type="button" className="small-action" onClick={() => void moderateReview(review, 'APPROVED')}>PUBLICAR</button><button type="button" className="small-action" onClick={() => void moderateReview(review, 'REJECTED')}>REJEITAR</button></div></article>)}</div>}
    </section>}
  </main>;
}
