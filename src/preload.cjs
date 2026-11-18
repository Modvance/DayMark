const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  call: (action, payload) => ipcRenderer.invoke('daymark', action, payload),
  onState: callback => ipcRenderer.on('state', (_event, data) => callback(data)),
  onAdd: callback => ipcRenderer.on('quick-add', () => callback()),
  onEdit: callback => ipcRenderer.on('edit-task', (_event, id) => callback(id)),
  onGoal: callback => ipcRenderer.on('open-goal', (_event, id) => callback(id)),
  onMessage: callback => ipcRenderer.on('message', (_event, message) => callback(message))
});
