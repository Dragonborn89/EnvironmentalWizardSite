(function () {
  var demo = document.querySelector(".rv-demo");
  if (!demo) return;
  var svg = demo.querySelector("svg");
  var table = document.querySelector(".rules table");
  var buttons = demo.querySelectorAll("[data-region]");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var RULES = {
    building: { A: "base", B: "b", C: "c", D: "base" },
    stall: { A: "base", B: "base", C: "none", D: "cart" },
    rock: { A: "base", B: "base", C: "base", D: "base" }
  };
  var PALETTE = {
    A: ["#1b2a20", "#2b3b2f", "#cfd8c8"],
    B: ["#2d2517", "#3e3220", "#ecc98e"],
    C: ["#1a2230", "#283141", "#aec6ea"],
    D: ["#2b1c1c", "#3c2828", "#f2a88f"]
  };

  var current = null;
  function setRegion(r) {
    if (r === current) return;
    current = r;
    var p = PALETTE[r];
    svg.style.setProperty("--ground", p[0]);
    svg.style.setProperty("--road", p[1]);
    svg.style.setProperty("--build", p[2]);
    svg.querySelectorAll(".obj").forEach(function (obj) {
      var want = RULES[obj.dataset.kind][r];
      obj.querySelectorAll("[data-v]").forEach(function (v) {
        v.classList.toggle("on", v.dataset.v === want);
      });
      obj.classList.toggle("changed", want !== "base");
    });
    buttons.forEach(function (b) { b.classList.toggle("on", b.dataset.region === r); });
    if (table) table.dataset.region = r;
  }

  var auto = null, picked = false, order = ["A", "B", "C", "D"], i = 0;
  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      picked = true;
      clearInterval(auto);
      setRegion(b.dataset.region);
    });
  });

  setRegion("A");
  if (reduced) return;
  new IntersectionObserver(function (entries) {
    clearInterval(auto);
    if (entries[0].isIntersecting && !picked)
      auto = setInterval(function () { i = (i + 1) % 4; setRegion(order[i]); }, 2600);
  }).observe(demo);
})();

document.querySelectorAll("[data-reveal]").forEach(function (el) {
  new IntersectionObserver(function (entries, obs) {
    if (!entries[0].isIntersecting) return;
    el.classList.add("in");
    obs.disconnect();
  }, { threshold: 0.4 }).observe(el);
});
