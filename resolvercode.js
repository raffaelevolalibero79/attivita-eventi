// resolvercode.js — il piccolo "lettore dei link di Google Maps".
// Questo testo si copia dalle Impostazioni e si incolla in Google Apps Script (gratis, con il tuo account Google).
// Il lettore segue il link breve fino alla pagina vera di Google Maps e restituisce la posizione (latitudine e longitudine).
// Legge solo link di Google Maps, non salva nulla e non conosce nessun dato dell'app.
export const RESOLVER_CODE = String.raw`// Lettore dei link di Google Maps per l'app "Attività ed eventi" (v2)
// Segue il link breve (maps.app.goo.gl/...) e restituisce la posizione vera.
// Legge solo link di Google Maps e non salva nulla.

function doGet(e) {
  var out = { ok: false };
  try {
    var p = (e && e.parameter) || {};
    if (p.ping) return send_({ ok: true, ping: true, v: 2 });
    var u = String(p.u || '');
    if (!allowed_(u)) throw new Error('Link non ammesso');
    var url = u, html = '', hops = [u], pos = null;
    for (var i = 0; i < 8; i++) {
      var r = UrlFetchApp.fetch(url, {
        followRedirects: false,
        muteHttpExceptions: true,
        headers: {
          'Accept-Language': 'it-IT,it;q=0.9',
          'Cookie': 'CONSENT=YES+cb',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        }
      });
      var code = r.getResponseCode();
      var h = r.getHeaders();
      var loc = h['Location'] || h['location'];
      if (code >= 300 && code < 400 && loc) {
        var next = absolute_(String(loc), url);
        if (!allowed_(next)) break;
        url = next;
        hops.push(url);
        if (!pos) pos = findPos_(url);
        continue;
      }
      if (code === 200) html = String(r.getContentText()).slice(0, 900000);
      break;
    }
    if (!pos) pos = findPosInPage_(html);
    out = { ok: true, url: url };
    if (pos) { out.lat = pos.lat; out.lng = pos.lng; out.from = pos.from; }
    var title = findTitle_(html);
    if (title) out.title = title;
    out.hops = hops.length;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err).slice(0, 200) };
  }
  return send_(out);
}

function send_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function allowed_(u) {
  var m = /^https:\/\/([^\/?#:]+)(\/[^?#]*)?/i.exec(String(u));
  if (!m) return false;
  var host = m[1].toLowerCase();
  var path = m[2] || '/';
  if (host === 'maps.app.goo.gl') return true;
  if (host === 'goo.gl') return /^\/maps/.test(path);
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  if (/^(www\.)?google\.[a-z.]+$/.test(host)) return /^\/maps/.test(path);
  return false;
}

function absolute_(loc, base) {
  if (/^https?:\/\//i.test(loc)) return loc;
  var m = /^(https?:\/\/[^\/?#]+)/i.exec(base);
  return m ? m[1] + (loc.charAt(0) === '/' ? '' : '/') + loc : loc;
}

// Il centro degli Stati Uniti è la vista di partenza di Google Maps: non è mai un posto vero.
function okPos_(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat - 37.0625) < 0.01 && Math.abs(lng + 95.677) < 0.05) return false;
  return true;
}

function findPos_(text) {
  var s = String(text || '');
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (x) {}
  var m = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(s);
  if (m && okPos_(+m[1], +m[2])) return { lat: +m[1], lng: +m[2], from: 'url-punto' };
  m = /[?&](?:q|ll|query|center|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)(?:[&#]|$)/.exec(s);
  if (m && okPos_(+m[1], +m[2])) return { lat: +m[1], lng: +m[2], from: 'url-q' };
  // "@lat,lng,17z" vale solo se la vista è molto ingrandita
  m = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+),(\d+(?:\.\d+)?)([zma])/.exec(s);
  if (m && okPos_(+m[1], +m[2]) && !(m[4] === 'z' && +m[3] < 12)) return { lat: +m[1], lng: +m[2], from: 'url-vista' };
  return null;
}

function findPosInPage_(html) {
  var h = String(html || '');
  if (!h) return null;
  var m = /APP_INITIALIZATION_STATE\s*=\s*\[\[\[\s*-?[\d.]+\s*,\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\]/.exec(h);
  if (m && okPos_(+m[2], +m[1])) return { lat: +m[2], lng: +m[1], from: 'pagina-stato' };
  var metas = h.match(/<meta[^>]+>/gi) || [];
  for (var i = 0; i < metas.length; i++) {
    var t = metas[i].replace(/&amp;/g, '&');
    if (t.indexOf('center=') < 0) continue;
    var c = /center=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i.exec(t);
    if (c && okPos_(+c[1], +c[2])) return { lat: +c[1], lng: +c[2], from: 'pagina-immagine' };
  }
  var n = /\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/.exec(h);
  if (n && okPos_(+n[1], +n[2])) return { lat: +n[1], lng: +n[2], from: 'pagina-dati' };
  return null;
}

function findTitle_(html) {
  var metas = String(html || '').match(/<meta[^>]+>/gi) || [];
  for (var i = 0; i < metas.length; i++) {
    if (!/(property|itemprop)=["'](og:title|name)["']/i.test(metas[i])) continue;
    var m = /content=["']([^"']{1,300})["']/i.exec(metas[i]);
    if (m) return clean_(m[1]);
  }
  var t = /<title>([^<]{1,300})<\/title>/i.exec(String(html || ''));
  return t ? clean_(t[1]).replace(/\s*[-–]\s*Google Maps\s*$/i, '') : '';
}

function clean_(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').slice(0, 200);
}
`;
