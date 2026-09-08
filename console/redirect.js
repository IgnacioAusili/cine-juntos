const params = new URLSearchParams(window.location.search);
params.set("console", "1");
window.location.replace(`../index.html?${params.toString()}`);
