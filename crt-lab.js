(function () {
  var lab = document.querySelector(".lab");
  if (!lab) return;
  var canvas = lab.querySelector("canvas");
  var img = lab.querySelector("img.lab-src");
  var gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) { lab.classList.add("no-gl"); return; }
  var halfFloat = !!gl.getExtension("EXT_color_buffer_float");

  var VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
void main() { gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;

  // beam + mask + persistence, written into a history buffer
  var FS_EMIT = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uScene, uPrev;
uniform vec2 uRes, uFocus;
uniform float uZoom, uUnit, uStage, uMask, uBeamRate, uTime, uDt, uTau;
uniform vec3 uCam;

vec3 scene(vec2 uv) {
  uv = (uv - .5) / uCam.z + .5 + uCam.xy;
  return pow(texture(uScene, vec2(uv.x, 1. - uv.y)).rgb, vec3(2.2));
}

vec3 tri(float x) { float i = mod(floor(x), 3.); return vec3(i == 0., i == 1., i == 2.); }

vec3 phosphorMask(vec2 p) {
  float s = uUnit / 3.;
  if (uMask < .5) return tri(p.x / s);
  if (uMask < 1.5) {
    float h = uUnit * .866;
    float row = floor(p.y / h);
    float x = p.x / s + mod(row, 2.) * 1.5;
    vec2 f = vec2(fract(x), fract(p.y / h)) - .5;
    return tri(x) * smoothstep(.5, .25, length(f));
  }
  float col = floor(p.x / uUnit);
  float y = p.y / (uUnit * 2.) + mod(col, 2.) * .5;
  return tri(p.x / s) * step(.15, fract(y));
}

void main() {
  vec2 p = (gl_FragCoord.xy - uFocus) / uZoom + uFocus;
  float row = floor(p.y / uUnit);
  vec2 suv = vec2(p.x / uRes.x, (row + .5) * uUnit / uRes.y);
  vec3 src = scene(suv);
  vec3 e = uStage < 2. ? scene(p / uRes) : src;

  if (uStage >= 2.) {
    float lum = dot(src, vec3(.3, .59, .11));
    float w = mix(.18, .34, sqrt(lum));
    float d = fract(p.y / uUnit) - .5;
    e *= exp(-d * d / (2. * w * w)) * 1.5;
    if (uBeamRate < 59.) {
      float beam = 1. - fract(uTime * 60.);
      float age = fract(p.y / uRes.y - beam);
      e *= exp(-age * 40.) * 1.6;
    }
  }
  if (uStage >= 3.) e *= phosphorMask(p) * 2.8;

  vec3 o3 = e;
  if (uStage >= 4.) {
    vec3 tau = uTau * vec3(1., .8, .55);
    vec3 fast = exp(-uDt / (tau * .25)), slow = exp(-uDt / tau);
    vec3 h = texture(uPrev, gl_FragCoord.xy / uRes).rgb * mix(fast, slow, .35);
    o3 = max(e, h * step(.002, h));
  }
  o = vec4(o3, 1.);
}`;

  // tube geometry, convergence, halation, output
  var FS_SHOW = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uBuf;
uniform vec2 uRes;
uniform float uStage, uBlur;

// what the eye does at viewing distance: stripes blend into glow
vec3 tap(vec2 uv) {
  if (uBlur < .01) return texture(uBuf, uv).rgb;
  vec2 d = uBlur * 1.2 / uRes;
  vec3 c = texture(uBuf, uv).rgb * 4.;
  c += (texture(uBuf, uv + vec2(d.x, 0.)).rgb + texture(uBuf, uv - vec2(d.x, 0.)).rgb
      + texture(uBuf, uv + vec2(0., d.y)).rgb + texture(uBuf, uv - vec2(0., d.y)).rgb) * 2.;
  c += texture(uBuf, uv + d).rgb + texture(uBuf, uv - d).rgb
     + texture(uBuf, uv + vec2(d.x, -d.y)).rgb + texture(uBuf, uv + vec2(-d.x, d.y)).rgb;
  return c / 16.;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 g = uv;
  if (uStage >= 5.) {
    vec2 c = uv * 2. - 1.;
    c *= .96 + vec2(.05, .07) * dot(c, c);
    g = c * .5 + .5;
  }
  vec3 col = tap(g);
  if (uStage >= 6.) {
    vec2 r = (g - .5) * .012 * length(g - .5);
    col = vec3(tap(g + r).r, col.g, tap(g - r).b);
  }
  if (uStage >= 7.) {
    vec3 glow = vec3(0.);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * .5236;
      vec2 d = vec2(cos(a), sin(a)) / uRes;
      glow += max(tap(g + d * 9.) - .25, 0.) + max(tap(g + d * 22.) - .25, 0.) * .6;
    }
    col += glow / 12. * vec3(1., .72, .48) * .55;
  }
  col = 1. - exp(-col * (uStage >= 2. ? 3.4 : 1.6));
  if (uStage >= 5.) {
    vec2 v = g * (1. - g);
    col *= pow(clamp(v.x * v.y * 18., 0., 1.), .22);
    vec2 q = abs(g - .5) * 2. - (1. - .08);
    float edge = length(max(q, 0.)) - .08;
    col *= smoothstep(.006, -.006, edge);
  }
  o = vec4(pow(col, vec3(1. / 2.2)), 1.);
}`;

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    var u = {};
    for (var i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      var name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  var emit, show;
  try { emit = program(FS_EMIT); show = program(FS_SHOW); }
  catch (e) { lab.classList.add("no-gl"); return; }
  gl.bindVertexArray(gl.createVertexArray());

  function tex(w, h, float) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  var sceneTex = tex();
  var hist = [], W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (w === W && h === H) return;
    W = canvas.width = w;
    H = canvas.height = h;
    hist.forEach(function (b) { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); });
    hist = [0, 1].map(function () {
      var t = tex(w, h, halfFloat), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { t: t, f: f };
    });
    focus = null;
  }

  var STAGES = [
    ["Scene", "This is the engine's raw output: the game, lit and tonemapped, before any of the CRT. Everything after this step is the display, not the game."],
    ["Beam", "A CRT doesn't show a frame, it draws one, line by line. Each scanline gets a beam profile, and brighter content widens the beam, which is why highlights bleed into the dark gaps. Slow the beam down to watch it scan."],
    ["Phosphor mask", "The beam lights colored phosphors through a mask. RetroEngine has three: aperture grille, shadow mask, and slot mask. This stage zooms in so you can see the stripes, dots, or slots; zoom back out and your eye blends them into a smooth picture."],
    ["Persistence", "Phosphors keep glowing after the beam moves on, and each color fades at its own rate. New light and old glow combine by taking the brighter of the two, so motion leaves trails but a still image never builds up."],
    ["Tube", "The picture lands on curved glass: barrel distortion, darker corners, and a rounded tube edge."],
    ["Convergence", "The three electron guns never line up perfectly. Red and blue drift apart toward the edges while green stays put."],
    ["Halation", "Bright light scatters inside the thick front glass and comes back as a warm glow around highlights."]
  ];
  var MASKS = ["Aperture grille", "Shadow mask", "Slot mask"];

  var stage = 7, rate = 60, maskType = 0, tau = 0.12, zoom = 1, focus = null, pointer = null;
  var stageBtns = lab.querySelectorAll("[data-stage]");
  var title = lab.querySelector(".lab-copy h3"), copy = lab.querySelector(".lab-copy p");

  var zoomInput = lab.querySelector('[name="zoom"]');
  function setStage(n) {
    if (n === 3 && stage !== 3 && zoom < 4) {
      zoomInput.value = 4;
      zoomInput.dispatchEvent(new Event("input"));
    }
    stage = n;
    stageBtns.forEach(function (b) { b.classList.toggle("on", +b.dataset.stage <= n); });
    title.textContent = n + " · " + STAGES[n - 1][0];
    copy.textContent = STAGES[n - 1][1];
  }
  stageBtns.forEach(function (b) { b.addEventListener("click", function () { setStage(+b.dataset.stage); }); });

  function bind(name, fn) {
    var input = lab.querySelector('[name="' + name + '"]'), out = lab.querySelector('output[for="' + name + '"]');
    function update() { var label = fn(+input.value); if (out) out.textContent = label; }
    input.addEventListener("input", update);
    update();
  }
  bind("beam", function (v) {
    rate = v >= 100 ? 60 : 0.25 * Math.pow(240, v / 100);
    return v >= 100 ? "60 Hz (real time)" : (rate < 10 ? rate.toFixed(1) : Math.round(rate)) + " frames/s";
  });
  bind("mask", function (v) { maskType = v; return MASKS[v]; });
  bind("persistence", function (v) { tau = v / 1000; return v + " ms"; });
  bind("zoom", function (v) { zoom = v; return v + "×"; });

  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    pointer = [(e.clientX - r.left) * dpr, (r.bottom - e.clientY) * dpr];
  });
  canvas.addEventListener("pointerleave", function () { pointer = null; });

  var pan = [0, 0], vel = [0, 0], drag = null;
  canvas.addEventListener("pointerdown", function (e) {
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", function () { drag = null; });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var r = canvas.getBoundingClientRect();
    vel = [-(e.clientX - drag[0]) / r.width / zoom, (e.clientY - drag[1]) / r.height / zoom];
    pan[0] = Math.max(-0.12, Math.min(0.12, pan[0] + vel[0]));
    pan[1] = Math.max(-0.1, Math.min(0.1, pan[1] + vel[1]));
    drag = [e.clientX, e.clientY];
  });

  var visible = false, running = false, prev = 0, ping = 0, simTime = 0, uploaded = false;

  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    var dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    resize();

    if (!uploaded && img.complete && img.naturalWidth) {
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      uploaded = true;
    }

    var target = zoom > 1 && pointer ? pointer : [W / 2, H / 2];
    focus = focus || target.slice();
    focus[0] += (target[0] - focus[0]) * Math.min(1, dt * 6);
    focus[1] += (target[1] - focus[1]) * Math.min(1, dt * 6);

    var src = hist[ping], dst = hist[1 - ping];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, W, H);
    gl.useProgram(emit.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(emit.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.uniform1i(emit.u.uPrev, 1);
    gl.uniform2f(emit.u.uRes, W, H);
    gl.uniform2f(emit.u.uFocus, focus[0], focus[1]);
    gl.uniform1f(emit.u.uZoom, zoom);
    gl.uniform1f(emit.u.uUnit, 3 * Math.max(1, Math.round(dpr)));
    gl.uniform1f(emit.u.uStage, stage);
    gl.uniform1f(emit.u.uMask, maskType);
    gl.uniform1f(emit.u.uBeamRate, rate);
    var slow = Math.min(1, rate / 60);
    simTime += dt * slow;
    gl.uniform1f(emit.u.uTime, simTime);
    gl.uniform1f(emit.u.uDt, dt * slow);
    gl.uniform1f(emit.u.uTau, tau);
    if (!drag) {
      pan[0] = Math.max(-0.12, Math.min(0.12, pan[0] + vel[0]));
      pan[1] = Math.max(-0.1, Math.min(0.1, pan[1] + vel[1]));
      vel[0] *= 0.92; vel[1] *= 0.92;
    }
    gl.uniform3f(emit.u.uCam, pan[0] + Math.sin(simTime * 0.5) * 0.05, pan[1] + Math.sin(simTime * 0.37 + 1) * 0.035, 1.3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ping = 1 - ping;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(show.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.t);
    gl.uniform1i(show.u.uBuf, 0);
    gl.uniform2f(show.u.uRes, W, H);
    gl.uniform1f(show.u.uStage, stage);
    gl.uniform1f(show.u.uBlur, stage >= 3 ? 1.6 * dpr * Math.max(0, Math.min(1, (3 - zoom) / 2)) : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    prev = performance.now();
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }).observe(canvas);
  document.addEventListener("visibilitychange", start);
  setStage(7);
})();
