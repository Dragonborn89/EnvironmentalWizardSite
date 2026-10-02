(function () {
  var tube = document.querySelector(".tube");
  var canvas = tube && tube.querySelector("canvas");
  if (!canvas) return;

  var gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) { tube.classList.add("no-gl"); return; }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var halfFloat = !!gl.getExtension("EXT_color_buffer_float");

  var VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
out vec2 vUv;
void main() { vec2 p = P[gl_VertexID]; vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

  // phosphor buffer: decays per channel, beam + cursor add energy
  var FS_PHOSPHOR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uA, uB;
uniform float uAspect, uDt, uEmit, uBeamY, uBeam;

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return length(pa - ba * h);
}

void main() {
  vec3 keep = exp(-uDt / vec3(.55, .32, .16));
  vec2 s = vec2(uAspect, 1.);
  float d = seg(vUv * s, uA * s, uB * s);
  float e = uEmit * exp(-d * d / .0009);
  float b = uBeam * exp(-pow((vUv.y - uBeamY) * 260., 2.));
  o = vec4(texture(uPrev, vUv).rgb * keep + (e + b) * vec3(1., .62, .22) * uDt * 60., 1.);
}`;

  var FS_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uPower, uDpr;

vec2 bulge(vec2 uv) {
  uv = uv * 2. - 1.;
  vec2 k = abs(uv.yx) / vec2(5.5, 4.5);
  return (uv + uv * k * k) * .5 + .5;
}

void main() {
  vec2 uv = bulge(vUv);
  if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) { o = vec4(0., 0., 0., 1.); return; }

  vec3 c = 1. - exp(-texture(uTex, uv).rgb * 1.6);
  c += vec3(1., .7, .35) * max(.035 * (1. - length(uv - .5) * 1.2), 0.);

  float line = uv.y * uRes.y / (3. * uDpr);
  c *= .64 + .36 * pow(sin(line * 3.14159), 2.);
  float m = mod(gl_FragCoord.x / uDpr, 3.);
  c *= mix(vec3(1.), vec3(m < 1. ? 1. : .7, m >= 1. && m < 2. ? 1. : .7, m >= 2. ? 1. : .7), .45);
  vec2 v = uv * (1. - uv);
  c *= pow(v.x * v.y * 16., .18) * (1. + .012 * sin(uTime * 110.));

  // power-on: bright line, picture opens vertically, overbright settle
  float open = smoothstep(.18, .6, uPower);
  float yd = abs(uv.y - .5);
  float lit = smoothstep(mix(.0015, .5, open) + .002, mix(.0015, .5, open), yd);
  float warm = smoothstep(0., .18, uPower);
  float flash = warm * (1. - open) * smoothstep(.006, 0., yd) * smoothstep(.5 * warm, 0., abs(uv.x - .5) - .02);
  float over = 1. + 1.2 * (1. - smoothstep(.55, 1., uPower)) * step(.18, uPower);
  o = vec4(c * over * lit + vec3(1., .85, .6) * flash * 2., 1.);
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

  var phosphor, display;
  try {
    phosphor = program(FS_PHOSPHOR);
    display = program(FS_DISPLAY);
  } catch (e) {
    tube.classList.add("no-gl");
    return;
  }
  gl.bindVertexArray(gl.createVertexArray());

  var buffers = [], W = 0, H = 0, dpr = 1;

  function target(w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, halfFloat ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { t: t, f: f };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (w === W && h === H) return;
    W = canvas.width = w;
    H = canvas.height = h;
    buffers.forEach(function (b) { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); });
    buffers = [target(w >> 1, h >> 1), target(w >> 1, h >> 1)];
  }

  var cursor = null, lastCursor = null, movedAt = 0;
  window.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    cursor = x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1 ? null : [x, y];
    movedAt = performance.now();
  });

  var power = 1, bootStart = -1;
  var booted = false;
  try { booted = sessionStorage.getItem("crt-booted") === "1"; } catch (e) {}
  if (!reduced && !booted) {
    power = 0;
    bootStart = performance.now();
    tube.classList.add("booting");
    try { sessionStorage.setItem("crt-booted", "1"); } catch (e) {}
  }

  var fpsEl = tube.querySelector(".fps");
  var visible = true, running = false, prev = 0, frames = 0, fpsAt = 0, ping = 0;

  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    var dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    resize();

    if (bootStart >= 0) {
      power = Math.min(1, (now - bootStart) / 1600);
      if (power > 0.6) tube.classList.remove("booting");
      if (power >= 1) bootStart = -1;
    }

    var active = cursor && now - movedAt < 120 && !reduced;
    var a = lastCursor || cursor;
    var src = buffers[ping], dst = buffers[1 - ping];

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
    gl.viewport(0, 0, W >> 1, H >> 1);
    gl.useProgram(phosphor.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.uniform1i(phosphor.u.uPrev, 0);
    gl.uniform2f(phosphor.u.uA, a ? a[0] : -9, a ? a[1] : -9);
    gl.uniform2f(phosphor.u.uB, cursor ? cursor[0] : -9, cursor ? cursor[1] : -9);
    gl.uniform1f(phosphor.u.uAspect, W / H);
    gl.uniform1f(phosphor.u.uDt, dt);
    gl.uniform1f(phosphor.u.uEmit, active ? 0.09 : 0);
    gl.uniform1f(phosphor.u.uBeamY, 1 - (now / 7000) % 1);
    gl.uniform1f(phosphor.u.uBeam, reduced ? 0 : 0.042);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ping = 1 - ping;
    lastCursor = active ? cursor : null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(display.p);
    gl.bindTexture(gl.TEXTURE_2D, dst.t);
    gl.uniform1i(display.u.uTex, 0);
    gl.uniform2f(display.u.uRes, W, H);
    gl.uniform1f(display.u.uTime, now / 1000);
    gl.uniform1f(display.u.uPower, power);
    gl.uniform1f(display.u.uDpr, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    frames++;
    if (now - fpsAt > 500) {
      if (fpsEl) fpsEl.textContent = Math.round(frames * 1000 / (now - fpsAt)) + " fps · webgl2";
      frames = 0;
      fpsAt = now;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    prev = fpsAt = performance.now();
    frames = 0;
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    start();
  }).observe(canvas);
  document.addEventListener("visibilitychange", start);
  start();
})();
