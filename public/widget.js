/**
 * Scheduling Widget — universal embed script.
 * Usage:
 *   <script src="https://<host>/widget.js" async></script>
 *
 *   Modal popup on button click:
 *     <button data-schedule="https://<host>/embed/b/<slug>">予約する</button>
 *
 *   Inline embed (calendar rendered into the div):
 *     <div data-schedule-inline="https://<host>/embed/b/<slug>"
 *          data-schedule-height="700"></div>
 *
 *   Programmatic:
 *     Scheduler.popup('https://<host>/embed/b/<slug>');
 *     Scheduler.inline(document.querySelector('#target'), 'https://.../embed/b/xxx');
 *
 * A single <script> is enough for a page with any number of buttons and
 * inline mounts — the widget auto-scans and reruns when the DOM changes.
 */
(function () {
  if (window.Scheduler) return; // no double-inject

  function openModal(url) {
    if (!url) return;
    var overlay = document.createElement("div");
    overlay.setAttribute("data-schedule-modal", "");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });

    var frame = document.createElement("iframe");
    frame.src = url;
    frame.setAttribute("allow", "camera; microphone; fullscreen");
    frame.style.cssText =
      "width:100%;max-width:960px;height:85vh;border:0;border-radius:12px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.3);";

    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "閉じる");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;top:24px;right:24px;font-size:24px;background:#fff;border:0;border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
    close.addEventListener("click", function () {
      overlay.remove();
    });

    overlay.appendChild(frame);
    overlay.appendChild(close);
    document.body.appendChild(overlay);

    // ESC to close
    function esc(e) {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", esc);
      }
    }
    document.addEventListener("keydown", esc);
  }

  function mountInline(el, url, height) {
    if (!url || !el) return;
    var h = (height || el.getAttribute("data-schedule-height") || "700") + "";
    var iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.setAttribute("allow", "camera; microphone; fullscreen");
    iframe.style.cssText =
      "width:100%;height:" +
      h +
      "px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;";
    el.innerHTML = "";
    el.appendChild(iframe);
  }

  function scan(root) {
    var scope = root || document;
    var popups = scope.querySelectorAll("[data-schedule]");
    for (var i = 0; i < popups.length; i++) {
      var el = popups[i];
      if (el.__scheduleAttached) continue;
      el.__scheduleAttached = true;
      (function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          openModal(btn.getAttribute("data-schedule"));
        });
      })(el);
    }
    var inlines = scope.querySelectorAll("[data-schedule-inline]");
    for (var j = 0; j < inlines.length; j++) {
      var slot = inlines[j];
      if (slot.__scheduleAttached) continue;
      slot.__scheduleAttached = true;
      mountInline(slot, slot.getAttribute("data-schedule-inline"));
    }
  }

  window.Scheduler = {
    popup: openModal,
    inline: function (el, url, height) {
      mountInline(el, url, height);
    },
    scan: scan,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      scan();
    });
  } else {
    scan();
  }

  // Re-scan when new elements are added dynamically (e.g. SPA rendering)
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(function () {
      scan();
    });
    obs.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
