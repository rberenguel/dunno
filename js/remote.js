// WebSocket event bridge for dunno.
// Opens a connection to a server and forwards all events as JSON.

let _ws = null;
let _url = null;
let _timer = null;
let _retry = 3000;

export function remoteConnect(url) {
  _url = url;
  _retry = 3000;
  _connect();
}

function _connect() {
  if (!_url) return;
  if (!window.WebSocket) return;
  try {
    _ws = new WebSocket(_url);
    _ws.onopen = () => { _retry = 3000; };
    _ws.onmessage = e => {
      // Reserved for future server→client commands.
      try { console.log('remote msg:', JSON.parse(e.data)); } catch {}
    };
    _ws.onclose = () => { _ws = null; _timer = setTimeout(_connect, _retry); _retry = Math.min(_retry * 2, 30000); };
    _ws.onerror = () => { _ws?.close(); _ws = null; };
  } catch { _timer = setTimeout(_connect, _retry); }
}

export function remoteSend(obj) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(obj));
  }
}

export function remoteDisconnect() {
  clearTimeout(_timer);
  _ws?.close();
  _ws = null;
  _url = null;
}
