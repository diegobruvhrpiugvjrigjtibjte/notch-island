const render = (s) => { document.getElementById('s').className = s && s.connected ? 'ok' : 'bad'; document.getElementById('t').textContent = s && s.connected ? 'Collegato all\'isola' : 'Non collegato'; document.getElementById('e').textContent = (s && s.error) || ''; };
chrome.runtime.sendMessage('status', render);
document.getElementById('r').onclick = () => { chrome.runtime.sendMessage('reconnect'); setTimeout(() => chrome.runtime.sendMessage('status', render), 1200); };
