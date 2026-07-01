const { ipcRenderer } = require('electron');

// Direct window assignment works with contextIsolation: false
window.EA = {
  loadData:   ()  => ipcRenderer.invoke('load-data'),
  saveData:   (d) => ipcRenderer.invoke('save-data', d),
  openFiles:  ()  => ipcRenderer.invoke('open-files'),
  readFile:   (p) => ipcRenderer.invoke('read-file', p),
  getVersion: ()  => ipcRenderer.invoke('get-version'),
  createShortcut: () => ipcRenderer.invoke('create-shortcut'),
  printToPdf: (opts) => ipcRenderer.invoke('print-to-pdf', opts),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  selectFolder:   ()  => ipcRenderer.invoke('select-folder'),
  openFolder:     (p) => ipcRenderer.invoke('open-folder', p),
  writeBackup:    (path, content) => ipcRenderer.invoke('write-backup', path, content),
  fetchUrl:       (url) => ipcRenderer.invoke('fetch-url', url),
  fetchQuote:     (symbol, isin) => ipcRenderer.invoke('fetch-quote', symbol, isin),
  fetchSearch:    (query) => ipcRenderer.invoke('fetch-search', query),
  fetchQuoteAtDate: (symbol, date) => ipcRenderer.invoke('fetch-quote-at-date', symbol, date),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, d) => cb(d)),
  onUpdateProgress:  (cb) => ipcRenderer.on('update-progress', (_, d) => cb(d)),
};
