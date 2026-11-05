/* "About this page" tab. Runs after app.js and leaves it untouched: it only shows or hides
   the About section and, to leave it, presses the explorer's own Wheel / Lanes buttons. */
(function () {
  'use strict';
  var about = document.getElementById('about');
  var btn = document.getElementById('aboutbtn');
  var views = document.getElementById('views');
  if (!about || !btn || !views) return;

  function viewButtons() { return views.querySelectorAll('button'); }

  function open() {
    about.hidden = false;
    document.body.classList.add('about-open');
    btn.setAttribute('aria-pressed', 'true');
    viewButtons().forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
  }

  function close() {
    about.hidden = true;
    document.body.classList.remove('about-open');
    btn.setAttribute('aria-pressed', 'false');
  }

  // Leave About through the explorer's own buttons, so app.js stays the only place that
  // decides which view is shown and how its switches look.
  function go(view) {
    close();
    var label = view === 'wheel' ? 'Wheel' : 'Lanes';
    var target = null;
    viewButtons().forEach(function (b) { if (b.textContent === label) target = b; });
    if (target) target.click();
    window.scrollTo(0, 0);
  }

  btn.addEventListener('click', function () {
    if (about.hidden) { open(); window.scrollTo(0, 0); }
  });
  // app.js re-renders its buttons on every switch, so listen on the container.
  views.addEventListener('click', function (e) {
    if (e.target.closest('button') && !about.hidden) close();
  }, true);
  about.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b) go(b.getAttribute('data-go'));
  });

  // A shared link opens on About; #lanes or #wheel opens the explorer directly.
  var h = (window.location.hash || '').replace('#', '');
  if (h === 'lanes' || h === 'wheel') go(h); else open();
})();
