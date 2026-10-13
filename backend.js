// Carnet de dépenses : connexion et synchronisation avec Supabase (version GitHub Pages).
// Seule la clé publique du projet est utilisée ici. Chaque personne ne voit que ses propres
// données grâce aux règles de sécurité (Row Level Security) créées par supabase.sql.
(function () {
  "use strict";
  var cfg = window.CARNET_CONFIG || {};
  var CACHE_KEYS = ["carnet-depenses-v2", "carnet-depenses-v2-ui", "carnet-depenses-v2-view", "carnet-depenses-v1"];
  var OWNER_KEY = "carnet-depenses-owner";
  var $ = function (id) { return document.getElementById(id); };

  var configured = typeof cfg.supabaseUrl === "string" && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl)
    && typeof cfg.supabaseKey === "string" && cfg.supabaseKey.length > 20 && !/^COLLE/.test(cfg.supabaseKey);
  // Garde-fou : la clé secrète (service_role ou sb_secret_) ne doit jamais être dans une page web.
  var secretKey = typeof cfg.supabaseKey === "string" && (/^sb_secret_/.test(cfg.supabaseKey) || keyRole(cfg.supabaseKey) === "service_role");

  function keyRole(k) {
    try { return JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; } catch (e) { return null; }
  }
  function clearCache() { try { CACHE_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }

  // ---------- Écran de connexion ----------
  var mode = "login";
  function setMode(m, msg) {
    mode = m;
    var titles = { login: "Connexion", signup: "Créer mon compte", reset: "Mot de passe oublié", newpass: "Nouveau mot de passe" };
    var buttons = { login: "Se connecter", signup: "Créer mon compte", reset: "M'envoyer un lien", newpass: "Enregistrer le mot de passe" };
    $("authTitle").textContent = titles[m];
    $("authSubmit").textContent = buttons[m];
    $("authEmailRow").hidden = m === "newpass";
    $("authPassRow").hidden = m === "reset";
    $("authPass").autocomplete = m === "login" ? "current-password" : "new-password";
    $("authToSignup").hidden = m !== "login";
    $("authToReset").hidden = m !== "login";
    $("authToLogin").hidden = m === "login" || m === "newpass";
    say(msg || "");
  }
  function say(msg, bad) { var el = $("authMsg"); el.textContent = msg; el.dataset.bad = bad ? "1" : ""; }
  function showAuth(show) {
    document.body.classList.toggle("auth-on", !!show);
    $("authScreen").hidden = !show;
  }
  function frenchError(e) {
    var m = (e && (e.message || e.error_description)) || "";
    if (/invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/email not confirmed/i.test(m)) return "Confirmez d'abord votre adresse avec le lien reçu par e-mail.";
    if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cette adresse. Connectez-vous.";
    if (/signups? not allowed|signup is disabled/i.test(m)) return "La création de comptes est fermée sur cette appli.";
    if (/rate limit|too many/i.test(m)) return "Trop d'essais. Patientez quelques minutes puis réessayez.";
    if (/password/i.test(m) && /least|short|weak/i.test(m)) return "Ce mot de passe est trop simple. Choisissez-en un plus long.";
    if (/fetch|network/i.test(m)) return "Pas de connexion à Internet. Réessayez quand vous êtes en ligne.";
    return "Ça n'a pas marché. Réessayez dans un instant.";
  }

  var sb = null;
  var sessionWaiters = [];
  var currentUser = null;
  var here = location.origin + location.pathname;

  function onSession(session) {
    if (!session || !session.user) return;
    currentUser = session.user;
    // Un autre compte s'était servi de cet appareil : on repart d'un cache vide
    var prev = null;
    try { prev = localStorage.getItem(OWNER_KEY); } catch (e) {}
    if (prev && prev !== currentUser.id) { clearCache(); try { localStorage.setItem(OWNER_KEY, currentUser.id); } catch (e) {} location.reload(); return; }
    try { localStorage.setItem(OWNER_KEY, currentUser.id); } catch (e) {}
    if (mode !== "newpass") showAuth(false);
    $("accountEmail").textContent = currentUser.email || "";
    var w = sessionWaiters; sessionWaiters = [];
    w.forEach(function (fn) { fn(currentUser); });
  }

  function init() {
    $("authForm").addEventListener("submit", submit);
    $("authToSignup").addEventListener("click", function () { setMode("signup", "Choisissez un mot de passe d'au moins 8 caractères."); });
    $("authToReset").addEventListener("click", function () { setMode("reset", "Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe."); });
    $("authToLogin").addEventListener("click", function () { setMode("login"); });
    $("logoutBtn").addEventListener("click", logout);
    setMode("login");

    if (secretKey) { showAuth(true); $("authForm").hidden = true; say("La clé copiée dans config.js est la clé secrète. Ne la publiez jamais : remplacez-la par la clé publique (publishable ou anon), puis changez la clé secrète dans Supabase.", true); return; }
    if (!configured || !window.supabase) { showAuth(true); $("authForm").hidden = true; say("L'appli n'est pas encore reliée à Supabase. Ouvrez config.js et collez l'adresse et la clé publique de votre projet.", true); return; }

    sb = window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/, ""), cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "carnet-depenses-auth" },
    });
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === "PASSWORD_RECOVERY") { showAuth(true); setMode("newpass", "Choisissez votre nouveau mot de passe (8 caractères minimum)."); return; }
      if (event === "SIGNED_OUT") { showAuth(true); return; }
      if (session) setTimeout(function () { onSession(session); }, 0);
    });
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (s) onSession(s); else showAuth(true);
      if (location.hash && /access_token|error/.test(location.hash)) history.replaceState(null, "", location.pathname);
    }, function () { showAuth(true); });
  }

  var busy = false;
  function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    var email = $("authEmail").value.trim(), pass = $("authPass").value;
    if (mode !== "newpass" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say("Indiquez une adresse e-mail valide.", true); return; }
    if ((mode === "signup" || mode === "newpass") && pass.length < 8) { say("Le mot de passe doit faire au moins 8 caractères.", true); return; }
    if (mode === "login" && !pass) { say("Indiquez votre mot de passe.", true); return; }
    busy = true; $("authSubmit").disabled = true; say("Un instant…");
    var p;
    if (mode === "login") p = sb.auth.signInWithPassword({ email: email, password: pass });
    else if (mode === "signup") p = sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: here } });
    else if (mode === "reset") p = sb.auth.resetPasswordForEmail(email, { redirectTo: here });
    else p = sb.auth.updateUser({ password: pass });
    p.then(function (r) {
      if (r && r.error) throw r.error;
      $("authPass").value = "";
      if (mode === "signup") {
        if (r.data && r.data.session) return; // confirmation désactivée : déjà connecté
        setMode("login", "Compte créé. Ouvrez le mail de confirmation reçu, touchez le lien, puis revenez ici pour vous connecter.");
      } else if (mode === "reset") {
        setMode("login", "Si un compte existe avec cette adresse, un lien vient d'être envoyé. Ouvrez-le pour choisir un nouveau mot de passe.");
      } else if (mode === "newpass") {
        setMode("login"); showAuth(false);
        if (window.toast) window.toast("Mot de passe changé");
      }
    }).catch(function (e) { say(frenchError(e), true); })
      .then(function () { busy = false; $("authSubmit").disabled = false; });
  }

  function logout() {
    if (!sb) return;
    sb.auth.signOut({ scope: "local" }).catch(function () {}).then(function () {
      clearCache();
      try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
      location.reload();
    });
  }

  // ---------- Stockage : même interface que le stockage de claude.ai ----------
  // Une ligne par document : « settings » et un document par mois « m-AAAA-MM ».
  function collection(uid) {
    var last = null;
    function fetchAll() {
      return sb.from("carnet_docs").select("doc_id, body").eq("user_id", uid).then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
    }
    return {
      doc: function (id) {
        return {
          set: function (body) {
            return sb.from("carnet_docs").upsert({ user_id: uid, doc_id: id, body: body, updated_at: new Date().toISOString() }, { onConflict: "user_id,doc_id" })
              .then(function (r) { if (r.error) throw r.error; });
          },
          delete: function () {
            return sb.from("carnet_docs").delete().eq("user_id", uid).eq("doc_id", id)
              .then(function (r) { if (r.error) throw r.error; });
          },
        };
      },
      onSnapshot: function (cb, onError) {
        var first = true;
        function pull() {
          fetchAll().then(function (rows) {
            rows.sort(function (a, b) { return a.doc_id < b.doc_id ? -1 : 1; });
            var sig = JSON.stringify(rows);
            if (!first && sig === last) return; // rien n'a changé : pas de nouveau rendu
            first = false; last = sig;
            var docs = rows.map(function (row) { return { id: row.doc_id, data: function () { return row.body; } }; });
            cb({ docs: docs, empty: docs.length === 0, metadata: { hasPendingWrites: false } });
          }).catch(function (e) { if (onError) onError(e); });
        }
        pull();
        // Récupère les changements faits sur un autre appareil
        setInterval(function () { if (!document.hidden) pull(); }, 20000);
        document.addEventListener("visibilitychange", function () { if (!document.hidden) pull(); });
        window.addEventListener("online", pull);
      },
    };
  }

  window.CARNET_BACKEND = {
    hint: "Vos opérations sont enregistrées dans votre compte, en privé. Connectez-vous avec le même e-mail sur votre téléphone pour les retrouver.",
    collection: function () {
      if (!sb) return Promise.resolve(null);
      return new Promise(function (resolve) {
        if (currentUser) resolve(currentUser); else sessionWaiters.push(resolve);
      }).then(function (u) { return collection(u.id); });
    },
  };

  try { init(); } catch (e) { if (window.reportError) window.reportError(e); }
})();
