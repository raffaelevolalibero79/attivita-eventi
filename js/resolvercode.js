// resolvercode.js — il piccolo "lettore dei link di Google Maps".
// Questo testo si copia dalle Impostazioni e si incolla in Google Apps Script (gratis, con il tuo account Google).
// Il lettore segue il link breve fino alla pagina vera di Google Maps e restituisce la posizione (latitudine e longitudine).
// Legge solo link di Google Maps, non salva nulla e non conosce nessun dato dell'app.
export const RESOLVER_CODE = String.raw`// Lettore dei link di Google Maps per l'app "Attività ed eventi" (v1)
// Segue il link breve (maps.app.goo.gl/...) e restituisce la posizione vera.
// Legge solo link di Google Maps e non salva nulla.

function doGet(e) {
  var out = { ok: false };
  try {
    var p = (e && e.parameter) || {};
    if (p.ping) return send_({ ok: true, ping: true, v: 1 });
    var u = String(p.u || '');
    if (!allowed_(u)) throw new Error('Link non ammesso');
    var url = u, html = '';
    for (var i = 0; i < 8; i++) {
      var r = UrlFetchApp.fetch(url, {
        followRedirects: false,
        muteHttpExceptions: true,
        headers: {
          'Accept-Language': 'it-IT,it;q=0.9',
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
        continue;
      }
      if (code === 200) html = String(r.getContentText()).slice(0, 600000);
      break;
    }
    var pos = findPos_(url) || findPosInPage_(html);
    out = { ok: true, url: url };
    if (pos) { out.lat = pos.lat; out.lng = pos.lng; }
    var title = findTitle_(html);
    if (title) out.title = title;
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

function okPos_(lat, lng) {
  return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function findPos_(text) {
  var s = String(text || '');
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (x) {}
  var m = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(s) || /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(s);
  if (m && okPos_(+m[1], +m[2])) return { lat: +m[1], lng: +m[2] };
  return null;
}

function findPosInPage_(html) {
  var metas = String(html || '').match(/<meta[^>]+>/gi) || [];
  for (var i = 0; i < metas.length; i++) {
    var t = metas[i].replace(/&amp;/g, '&');
    if (t.indexOf('staticmap') < 0 && t.indexOf('center=') < 0) continue;
    var m = /center=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i.exec(t);
    if (m && okPos_(+m[1], +m[2])) return { lat: +m[1], lng: +m[2] };
  }
  return null;
}

function findTitle_(html) {
  var metas = String(html || '').match(/<meta[^>]+>/gi) || [];
  for (var i = 0; i < metas.length; i++) {
    if (!/property=["']og:title["']/i.test(metas[i])) continue;
    var m = /content=["']([^"']{1,300})["']/i.exec(metas[i]);
    if (m) return m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').slice(0, 200);
  }
  return '';
}
`;
