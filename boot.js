// Écrit en JavaScript ancien exprès : ce bloc doit marcher même si le navigateur ne comprend pas le script principal.
var booted = false;
function reportError(e) {
  var box = document.getElementById("errMsg");
  if (!box) return;
  var msg = e && e.message ? e.message : String(e || "erreur inconnue");
  box.querySelector("span").textContent = msg.slice(0, 160);
  box.hidden = false;
}
window.addEventListener("error", function (ev) { reportError(ev.error || ev.message); });
