import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CheckoutController } from './checkout.controller';
import { CLOUD_CONFIG, loadConfig, type CloudConfig } from './config';
import { LicenseIssuer } from './licensing/license-issuer';
import { FileOrderStore, type OrderStore } from './orders/order.store';
import { OrdersService } from './orders/orders.service';
import { PaystackClient } from './payments/paystack';
import { PaystackWebhookController } from './paystack-webhook.controller';

const ORDER_STORE = 'ORDER_STORE';

@Module({
  controllers: [AppController, CheckoutController, PaystackWebhookController],
  providers: [
    AppService,
    { provide: CLOUD_CONFIG, useFactory: () => loadConfig() },
    {
      provide: ORDER_STORE,
      useFactory: (config: CloudConfig) => new FileOrderStore(config.orderStorePath),
      inject: [CLOUD_CONFIG],
    },
    {
      provide: OrdersService,
      useFactory: (store: OrderStore) => new OrdersService(store),
      inject: [ORDER_STORE],
    },
    {
      provide: PaystackClient,
      useFactory: (config: CloudConfig) => new PaystackClient(config.paystackSecretKey),
      inject: [CLOUD_CONFIG],
    },
    {
      provide: LicenseIssuer,
      useFactory: (config: CloudConfig) =>
        new LicenseIssuer(config.licensePrivateKeyPem, config.licenseDays),
      inject: [CLOUD_CONFIG],
    },
  ],
})
export class AppModule {}
