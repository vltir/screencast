import { defineConfig, loadEnv } from 'vite'
import legacy from '@vitejs/plugin-legacy'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    legacy({
      targets: ['chrome 53'],
      modernPolyfills: true,
      renderLegacyChunks: true,
      polyfills: [
        'es.global-this',
        'web.queue-microtask',
        'es.array.iterator',
        'es.promise',
        'es.object.assign'
      ]
    }),
    {
      name: 'html-dom-tv-polyfills',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>
    <script>
      // 1. globalThis Absicherung im Hauptfenster
      if (typeof globalThis === 'undefined') { window.globalThis = window; }
      
      // 2. queueMicrotask Absicherung
      if (typeof queueMicrotask !== 'function') { window.queueMicrotask = function(cb) { Promise.resolve().then(cb); }; }
      
      // 3. String.prototype.replaceAll Absicherung
      if (!String.prototype.replaceAll) {
        String.prototype.replaceAll = function(str, newStr) {
          if (Object.prototype.toString.call(str) === '[object RegExp]') { return this.replace(str, newStr); }
          return this.replace(new RegExp(str.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), newStr);
        };
      }

      // 4. String.prototype.padStart Absicherung (NEU!)
      if (!String.prototype.padStart) {
        String.prototype.padStart = function padStart(targetLength, padString) {
          targetLength = targetLength >> 0;
          padString = String(typeof padString !== 'undefined' ? padString : ' ');
          if (this.length > targetLength) { return String(this); }
          else {
            targetLength = targetLength - this.length;
            if (targetLength > padString.length) {
              padString += padString.repeat(targetLength / padString.length);
            }
            return padString.slice(0, targetLength) + String(this);
          }
        };
      }

      // 5. Object.entries Absicherung (NEU!)
      if (!Object.entries) {
        Object.entries = function(obj) {
          var ownProps = Object.keys(obj),
              i = ownProps.length,
              resArray = new Array(i);
          while (i--) resArray[i] = [ownProps[i], obj[ownProps[i]]];
          return resArray;
        };
      }

      // 6. Genialer Worker-Hack: Schuggelt globalThis in isolierte Web-Worker-Blobs (NEU!)
      (function() {
        if (typeof Worker !== 'undefined' && !Worker.__patched) {
          var OriginalWorker = Worker;
          var patchCode = "if(typeof globalThis==='undefined'){self.globalThis=self;}\\n";
          
          window.Worker = function(scriptURL, options) {
            if (typeof scriptURL === 'string' && scriptURL.indexOf('blob:') === 0) {
              // Wenn es ein Blob-Worker aus einer Bibliothek (wie MQTT) ist, holen wir den Text ab
              var xhr = new XMLHttpRequest();
              xhr.open('GET', scriptURL, false); // Synchroner Fetch, da der Worker sofort starten muss
              xhr.send();
              var originalSource = xhr.responseText;
              
              // Wir injizieren das globalThis Polyfill an die allererste Stelle des Workers
              var newBlob = new Blob([patchCode + originalSource], { type: 'application/javascript' });
              var newURL = URL.createObjectURL(newBlob);
              return new OriginalWorker(newURL, options);
            }
            return new OriginalWorker(scriptURL, options);
          };
          window.Worker.__patched = true;
        }
      })();

      // 7. Helferfunktion für DOM-Fragmente
      function nodesToFragment(args) {
        var docFrag = document.createDocumentFragment();
        Array.prototype.slice.call(args).forEach(function(arg) {
          var isNode = arg && typeof arg === 'object' && arg.nodeType !== undefined;
          docFrag.appendChild(isNode ? arg : document.createTextNode(String(arg)));
        });
        return docFrag;
      }

      // 8. DOM-Mutation-Paket (append, prepend, before, after)
      var prototypesToPatch = [];
      if (typeof Element !== 'undefined') prototypesToPatch.push(Element.prototype);
      if (typeof CharacterData !== 'undefined') prototypesToPatch.push(CharacterData.prototype);

      prototypesToPatch.forEach(function(proto) {
        if (!proto.before) { proto.before = function() { if (this.parentNode) { this.parentNode.insertBefore(nodesToFragment(arguments), this); } }; }
        if (!proto.after) { proto.after = function() { if (this.parentNode) { this.parentNode.insertBefore(nodesToFragment(arguments), this.nextSibling); } }; }
        if (!proto.append) { proto.append = function() { this.appendChild(nodesToFragment(arguments)); }; }
        if (!proto.prepend) { proto.prepend = function() { this.insertBefore(nodesToFragment(arguments), this.firstChild); }; }
      });

      if (typeof DocumentFragment !== 'undefined') {
        if (!DocumentFragment.prototype.append) { DocumentFragment.prototype.append = function() { this.appendChild(nodesToFragment(arguments)); }; }
        if (!DocumentFragment.prototype.prepend) { DocumentFragment.prototype.prepend = function() { this.insertBefore(nodesToFragment(arguments), this.firstChild); }; };
      }
    </script>`
        );
      }
    }
  ]
})