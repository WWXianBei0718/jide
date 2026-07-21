// Supabase Realtime requires an explicit WebSocket transport on Node.js 20.
// `ws` is already a runtime dependency of this project. Using `require` here
// avoids shipping Node-only transport code through the browser Supabase client.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeWebSocket = require('ws');

export const serverRealtimeOptions = {
  realtime: {
    transport: NodeWebSocket,
  },
};
