const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('nApi', {
  send: (ch, ...a) => ipcRenderer.send(ch, ...a),
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  on: (ch, f) => ipcRenderer.on(ch, (_, ...a) => f(...a)),
  pathOf: f => webUtils.getPathForFile(f),
  stats: () => ipcRenderer.sendSync('stats')
});
