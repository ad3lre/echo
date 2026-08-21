import tls from 'tls';
import net from 'net';
import { Agent } from 'undici';
import { lookup } from 'dns/promises';
import { isPrivateOrLocalIpLiteral } from './linkUnfurlFetch';

export const safeFetchAgent = new Agent({
  connect: (opts, callback) => {
    if (!opts.host) {
      return callback(new Error('No host provided'), null);
    }
    lookup(opts.host, { all: true, verbatim: true })
      .then((res) => {
        const results = res as unknown as { address: string; family: number }[];
        if (!results || !results.length) {
          return callback(new Error('No DNS records'), null);
        }
        if (!results.every((r) => !isPrivateOrLocalIpLiteral(r.address))) {
          return callback(
            new Error('DNS rebinding or private IP detected'),
            null,
          );
        }

        const ip = results[0].address;
        const port = Number(opts.port);
        let socket: net.Socket | tls.TLSSocket;

        if (opts.protocol === 'https:') {
          socket = tls.connect({
            host: ip,
            port,
            servername: opts.host,
          });
          socket.on('secureConnect', () => callback(null, socket));
        } else {
          socket = net.connect({
            host: ip,
            port,
          });
          socket.on('connect', () => callback(null, socket));
        }

        socket.on('error', (err) => callback(err, null));
      })
      .catch((err) => callback(err, null));
  },
});
