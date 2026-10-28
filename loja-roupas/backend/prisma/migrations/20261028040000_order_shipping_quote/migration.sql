ALTER TABLE "orders" ADD COLUMN "shipping_quote_id" TEXT;

CREATE UNIQUE INDEX "orders_shipping_quote_id_key" ON "orders"("shipping_quote_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_quote_id_fkey"
FOREIGN KEY ("shipping_quote_id") REFERENCES "shipping_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
