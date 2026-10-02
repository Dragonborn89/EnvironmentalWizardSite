document.querySelectorAll("[data-since]").forEach(function (el) {
  var days = Math.floor((Date.now() - new Date(el.dataset.since + "T00:00:00")) / 864e5);
  el.textContent = days;
});

document.querySelectorAll("[data-viewer]").forEach(function (viewer) {
  var img = viewer.querySelector(".viewer-frame img");
  var caption = viewer.querySelector(".viewer-caption");
  var buttons = viewer.querySelectorAll("[data-src]");
  var warmed = false;

  function show(btn) {
    buttons.forEach(function (b) { b.classList.toggle("on", b === btn); });
    img.src = btn.dataset.src;
    caption.textContent = btn.dataset.caption;
    if (!warmed) {
      warmed = true;
      buttons.forEach(function (b) { new Image().src = b.dataset.src; });
    }
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () { show(b); });
  });
  var current = Array.prototype.find.call(buttons, function (b) { return b.dataset.src === img.getAttribute("src"); });
  if (current) {
    current.classList.add("on");
    caption.textContent = current.dataset.caption;
  }
});

// youtube player only loads on click
document.querySelectorAll(".video[data-yt]").forEach(function (box) {
  var link = box.querySelector("a");
  if (!link) return;
  link.addEventListener("click", function (e) {
    e.preventDefault();
    var f = document.createElement("iframe");
    f.src = "https://www.youtube-nocookie.com/embed/" + box.dataset.yt + "?autoplay=1&rel=0";
    f.title = box.dataset.title || "Video";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    box.innerHTML = "";
    box.appendChild(f);
  });
});
