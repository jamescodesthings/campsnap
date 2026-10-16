(function () {
  var root = document.documentElement;
  var theme = 'dark';
  var motion = null;
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') theme = saved;
  } catch (e) {}
  try {
    motion = localStorage.getItem('motion');
  } catch (e) {}
  if (theme === 'system') {
    var light = false;
    try {
      light = window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch (e) {}
    theme = light ? 'light' : 'dark';
  }
  root.setAttribute('data-theme', theme);
  // One theme-color tag for the theme showing, in place of head.ejs's two media-query tags.
  try {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].remove();
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = theme === 'light' ? '#faf8f4' : '#090b12';
    document.head.appendChild(meta);
  } catch (e) {}
  if (motion === 'reduce' || motion === 'full') root.setAttribute('data-motion', motion);
  root.setAttribute('data-js', '');
})();
