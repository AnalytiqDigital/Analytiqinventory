import { readFileSync } from 'node:fs';
import { buildServer, startServer } from './server';

export { buildServer, startServer } from './server';

if (require.main === module) {
  const certPath = process.env.ANALYTIQ_TLS_CERT;
  const keyPath = process.env.ANALYTIQ_TLS_KEY;
  const tls =
    certPath && keyPath ? { cert: readFileSync(certPath), key: readFileSync(keyPath) } : undefined;
  const app = buildServer({ tls });
  void startServer(app).then((address) => {
    app.log.info(`AnalytIQ LAN server listening at ${address}`);
  });
}
