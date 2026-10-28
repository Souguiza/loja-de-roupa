export type JwtPayload = {
  sub: string;
  email: string;
  // 'customer' para clientes; 'owner' ou 'staff' para o painel
  role: 'customer' | 'owner' | 'staff';
};
