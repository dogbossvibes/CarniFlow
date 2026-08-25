/*
 * ANYVO – Auth-Bestätigungsseite (/auth/confirmed)
 *
 * Wertet die Redirect-Parameter von Supabase aus und schaltet die passende
 * Statusansicht frei. Läuft im Browser (hängt sich an `window.AnyvoAuthConfirm`)
 * und ist gleichzeitig als CommonJS-Modul testbar (Node/Jest).
 *
 * WICHTIG:
 * - Die eigentliche E-Mail-Bestätigung passiert serverseitig bei Supabase
 *   (/auth/v1/verify) BEVOR hierher weitergeleitet wird. Diese Seite ist nur
 *   das Endziel und darf Erfolg NICHT blind behaupten.
 * - Kein Token/Code wird gespeichert, geloggt oder ausgetauscht.
 * - Das Öffnen der App nutzt ausschliesslich das feste ANYVO-Scheme; es wird
 *   niemals ein Redirect-Ziel aus der URL übernommen (kein Open-Redirect).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AnyvoAuthConfirm = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Einziges erlaubtes Ziel zum Öffnen der App. Bewusst konstant – niemals aus
  // der URL ableiten (verhindert Open-Redirect / beliebige externe Ziele).
  var ANYVO_APP_LINK = 'anyvo://';

  function getOpenAppTarget() {
    return ANYVO_APP_LINK;
  }

  function parseParams(search, hash) {
    var out = {};
    var add = function (str) {
      if (!str) return;
      var cleaned = String(str).replace(/^[#?]/, '');
      // Fragmente können selbst noch "?" enthalten (z. B. "#/foo?error=..").
      if (cleaned.indexOf('?') !== -1) cleaned = cleaned.split('?').slice(1).join('?');
      if (!cleaned) return;
      var pairs = cleaned.split('&');
      for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i]) continue;
        var kv = pairs[i].split('=');
        var key = decodeURIComponent(kv[0] || '').trim();
        if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
        out[key] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      }
    };
    add(search);
    add(hash);
    return out;
  }

  /**
   * Löst den anzuzeigenden Status aus Query- und Hash-Parametern auf.
   * @returns {'success'|'expired'|'error'|'neutral'}
   */
  function resolveConfirmStatus(search, hash) {
    var p = parseParams(search, hash);
    var error = (p.error || '').toLowerCase();
    var errorCode = (p.error_code || '').toLowerCase();

    if (error || errorCode || p.error_description) {
      // Abgelaufen / bereits verwendet / verweigert → neutral behandeln,
      // damit bereits bestätigte Nutzer nicht unnötig erschrecken.
      if (
        errorCode === 'otp_expired' ||
        errorCode === 'access_denied' ||
        error === 'access_denied' ||
        error === 'expired_token'
      ) {
        return 'expired';
      }
      return 'error';
    }

    // Erfolgskontext von Supabase: PKCE-Redirect trägt `code`, Implicit-Flow
    // `access_token`, Token-Hash-Templates `token_hash`/`type`.
    if (p.code || p.access_token || p.token_hash || p.type) {
      return 'success';
    }

    // Direktaufruf ohne erkennbaren Callback → KEIN Erfolg vortäuschen.
    return 'neutral';
  }

  function applyStatus(doc, status) {
    if (!doc) return;
    var states = doc.querySelectorAll('[data-state]');
    for (var i = 0; i < states.length; i++) {
      var el = states[i];
      var match = el.getAttribute('data-state') === status;
      el.hidden = !match;
    }
  }

  function init(win, doc) {
    win = win || (typeof window !== 'undefined' ? window : undefined);
    doc = doc || (win && win.document);
    if (!win || !doc) return;

    var loc = win.location || {};
    var status = resolveConfirmStatus(loc.search, loc.hash);
    applyStatus(doc, status);

    var openBtn = doc.querySelector('[data-open-app]');
    if (openBtn) {
      openBtn.setAttribute('href', getOpenAppTarget());
    }
  }

  return {
    ANYVO_APP_LINK: ANYVO_APP_LINK,
    getOpenAppTarget: getOpenAppTarget,
    parseParams: parseParams,
    resolveConfirmStatus: resolveConfirmStatus,
    applyStatus: applyStatus,
    init: init,
  };
});
