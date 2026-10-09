// This fresh process imports only the bundled public attacker. Its payload
// contains no private key, seeds, expected roots, or access to the simulator.
import { parentPort,workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
globalThis.self={postMessage:data=>parentPort.postMessage(data)};
await import(pathToFileURL(workerData.module).href);
parentPort.on('message',data=>globalThis.self.onmessage({data}));
