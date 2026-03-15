// Shared Set of currently connected user IDs.
// Populated by the Socket.io connection/disconnect handlers in server.js
// and read by the analytics controller.
export const onlineUsers = new Set();
