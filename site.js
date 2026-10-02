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
