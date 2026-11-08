# Audit de sécurité — ExtractDBCollections

| Élément | Valeur |
|---|---|
| Périmètre | Code source du dépôt `ExtractDBCollections` (application Next.js 14 « MongoDB Collection Extractor » : `app/`, `components/`, `lib/`, `src/lib/auth/`, `middleware.ts`, `next.config.mjs`, `package.json` / `package-lock.json`, `.env.example`) et historique Git complet (toutes branches locales et distantes). Hors périmètre : infrastructure d'hébergement, CI, instances MongoDB réelles. |
| Date | 2026-11-04 |
| Commit audité | `309b20b` (branche `ccr-f9f6ef8d-r2mrqx`) |
| Méthode | Revue manuelle de tout le code serveur et client ; recherche de secrets dans l'historique (`git log --all -p`, `git log --all -S`, fichiers supprimés) ; lecture du lockfile et confrontation aux avis de sécurité connus ; vérifications dynamiques sur une copie locale (build `next start` avec identifiants de test, sans base MongoDB) : absence de limitation de tentatives, oracle d'erreur SSRF, acceptation d'un corps `text/plain` cross-origin, contournement du middleware (CVE-2025-29927) et vérification hors ligne de la clé HMAC des sessions. Chaque correctif a été vérifié par `git apply --check` depuis la racine, puis appliqué ensemble sur une copie : `tsc --noEmit`, `next lint` et `next build` passent. `npm audit --offline` répond « 0 vulnerabilities » faute de cache local ; ce résultat n'a donc aucune valeur et n'a pas été retenu. |

## Synthèse

Toutes les routes `/api/*` qui touchent MongoDB et toutes les pages protégées revérifient elles-mêmes la session (`getAdminSession()`) : le middleware n'est donc pas l'unique barrière, ce qui limite fortement l'impact de la CVE de contournement de middleware de Next.js. **Aucun secret réel** (URI MongoDB avec identifiants, mot de passe, clé d'API) n'a été trouvé dans l'historique Git. Les seules valeurs présentes sont des exemples (`localhost`, `user:password@cluster.mongodb.net`, `super-secret-password` dans le README).

Le risque principal tient à la conception de l'authentification : un compte administrateur unique donne lecture, écriture, suppression et export complet de toutes les bases configurées. La connexion n'a aucune limitation de tentatives et la clé de signature des sessions est le mot de passe lui-même.

| ID | Sévérité (après relecture) | Titre | Fichier:ligne | Statut (relecture) |
|---|---|---|---|---|
| SEC-01 | Haute | Connexion admin sans limitation de tentatives ni comparaison à temps constant | `app/api/auth/[...nextauth]/route.ts:60-92` | Confirmé · correctif corrigé par la relecture |
| SEC-02 | Moyenne | Clé HMAC des sessions dérivée de `identifiant:mot_de_passe` (cassage hors ligne, pas de révocation, 30 jours) | `src/lib/auth/session.ts:14-24` | Confirmé · correctif confirmé |
| SEC-03 | Basse (était Moyenne) | SSRF / pivot réseau via l'URI MongoDB arbitraire acceptée par toutes les routes | `lib/preconfiguredMongoUris.ts:77-87` | Confirmé (sévérité ajustée : Moyenne → Basse) · correctif confirmé |
| SEC-04 | Moyenne | Redirection ouverte après connexion via `?from=//evil.tld` | `components/LoginForm.tsx:23-24,54` | Confirmé · correctif confirmé |
| SEC-05 | Moyenne | Next.js 14.2.3 figé, touché par plusieurs avis de sécurité publiés depuis (dont CVE-2025-29927) | `package.json:15` | Confirmé · correctif corrigé par la relecture (lockfile obligatoire, 14.2.35 insuffisant à terme) |
| SEC-06 | Basse | URI MongoDB personnalisée (avec identifiants) placée dans l'URL des pages | `components/ExtractorForm.tsx:526,553`, `app/crud/CrudPageClient.tsx:148`, `app/search/SearchPageClient.tsx:338` | Confirmé · correctif confirmé (régression fonctionnelle assumée) |
| SEC-07 | Basse | Zip Slip : noms de collection non assainis dans l'archive ZIP exportée | `app/api/extract/route.ts:84` | Confirmé · correctif confirmé |
| SEC-08 | Basse | Pas de protection CSRF propre : seule `SameSite=Lax` protège, `request.json()` accepte `text/plain` | `src/lib/auth/session.ts:77`, `middleware.ts:53` | Confirmé · correctif confirmé |
| SEC-09 | Info | Aucun en-tête de sécurité HTTP ; `X-Powered-By` exposé | `next.config.mjs:2-4` | Confirmé · correctif confirmé |
| SEC-10 | Info | Historique Git : pas de secret réel, mais une période avec mot de passe côté client (`NEXT_PUBLIC_PAGE_PASSWORD`) et des API non authentifiées | commits `16e7b0a` / `e5cc9d2` → `ddb4ca8` (initialement `512d585` → `ddb4ca8`) | Confirmé (période d'exposition élargie) · actions confirmées et étendues |

Les correctifs proposés sont indépendants et s'appliquent aussi ensemble, dans l'ordre SEC-01 → SEC-09 (SEC-02 et SEC-03 modifient tous deux `.env.example` sur des zones distinctes). Vérifié en relecture avec le diff SEC-01 corrigé : chaque diff passe `git apply --check` seul sur `d279cdc`, et l'ensemble s'applique d'un bloc (voir « Relecture indépendante »).

---

## SEC-01 — Connexion admin sans limitation de tentatives ni comparaison à temps constant

**Sévérité : Haute** · `app/api/auth/[...nextauth]/route.ts:60-92`

**Statut : Confirmé** · **Correctif : Corrigé par la relecture**

**Relecture.** Constat confirmé : `handleLogin` (`route.ts:60-92`) n'a aucune garde, le middleware ne couvre pas `/api` (`middleware.ts:53`) et aucun autre code ne limite les tentatives. Sévérité Haute maintenue : point d'entrée public, compte unique aux pleins pouvoirs, seule la robustesse du mot de passe protège. En revanche, le correctif initial se contourne. Test dynamique sur un build `next start` avec le diff initial :
- en changeant `X-Forwarded-For` à chaque requête, 20 échecs consécutifs donnent tous `401`, sans jamais de `429`. La clé est entièrement fournie par le client quand aucun proxy n'écrase l'en-tête ;
- derrière un proxy qui *ajoute* l'IP au lieu de remplacer l'en-tête (`$proxy_add_x_forwarded_for` de nginx, configuration la plus courante), le diff initial retient la première entrée, qui est celle de l'attaquant. Avec `X-Forwarded-For: <aléatoire>, 2.2.2.2`, 8 échecs donnent 8 `401` ;
- la `Map` grossit sans borne quand la clé tourne, ce qui ouvre un risque d'épuisement mémoire.

Le diff ci-dessous remplace celui de l'audit initial. Il retient la **dernière** entrée de `X-Forwarded-For`, celle qu'ajoute le proxy le plus proche. Il ajoute un **plafond global** de 30 échecs par 15 minutes, indépendant de la clé client, qui borne toute rotation à environ 2 900 essais par jour. Enfin, il borne le nombre de clients suivis. Revérifié dynamiquement : même IP → `429` dès la 6ᵉ tentative ; proxy en ajout → `429` dès la 6ᵉ ; rotation d'IP → `429` dès que 30 échecs cumulés sont atteints ; une connexion légitime avant blocage donne `200`. Contrepartie assumée : un attaquant peut maintenir le plafond global atteint et bloquer l'administrateur, qui reçoit `429` pendant la fenêtre. Si ce risque de déni de service est jugé plus grave, il faut un stockage partagé avec une IP fiable, un WAF, ou une MFA/SSO. Une rafale de 40 requêtes parallèles sur la même IP a donné 5 `401` et 35 `429` : aucune course exploitable n'a été observée.

**Description.** Le point d'entrée public `POST /api/auth/login` compare l'identifiant et le mot de passe soumis aux variables d'environnement avec `!==`. Il n'y a ni limitation de débit, ni verrouillage, ni délai, ni journalisation des échecs. Un compte unique protège un accès complet en lecture, écriture, suppression et export à toutes les bases MongoDB préconfigurées.

**Preuve.**

```ts
// app/api/auth/[...nextauth]/route.ts:87-92
    if (
      trimmedIdentifier !== credentials.identifier ||
      trimmedPassword !== credentials.password
    ) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
    }
```

Test dynamique : 30 requêtes successives avec un mauvais mot de passe renvoient toutes `401`, sans `429` ni ralentissement.

**Scénario d'exploitation.** L'attaquant trouve l'instance (page `/login` publique), devine l'identifiant (souvent une adresse e-mail, cf. l'exemple `admin@example.com` du README) puis lance un dictionnaire ou du credential stuffing sur `/api/auth/login`, sans limite. Une fois connecté, `POST /api/extract` avec `allCollections: true` télécharge chaque base entière en ZIP, et `POST /api/crud` (`action: "delete"`) ou `/api/edit` modifient ou détruisent les données.

**Impact.** Compromission totale en confidentialité, intégrité et disponibilité des bases MongoDB configurées. La comparaison `!==` n'est pas à temps constant ; c'est un facteur aggravant théorique, difficile à exploiter à distance.

**Correctif proposé (version corrigée par la relecture).** Limitation par client (5 échecs par 15 min) et plafond global (30 échecs par 15 min), comparaison à temps constant et journalisation des échecs. Le compteur est en mémoire, donc propre à chaque instance : en déploiement multi-instances ou serverless, utiliser un stockage partagé (Redis, KV) ou une règle WAF. Ne faire confiance à `x-forwarded-for` que derrière un reverse proxy maîtrisé ; seule sa dernière entrée est retenue. À terme, ajouter une MFA ou un SSO devant l'outil.

```diff
diff --git a/app/api/auth/[...nextauth]/route.ts b/app/api/auth/[...nextauth]/route.ts
index cd0d263..505d09a 100644
--- a/app/api/auth/[...nextauth]/route.ts
+++ b/app/api/auth/[...nextauth]/route.ts
@@ -1,3 +1,4 @@
+import { createHash, timingSafeEqual } from 'crypto';
 import { NextResponse } from 'next/server';
 
 import {
@@ -25,6 +26,59 @@ function getAdminCredentials(): { identifier: string; password: string } | null
   return { identifier, password };
 }
 
+const MAX_LOGIN_ATTEMPTS = 5;
+const MAX_GLOBAL_FAILED_ATTEMPTS = 30;
+const LOGIN_WINDOW_MS = 15 * 60 * 1000;
+const MAX_TRACKED_CLIENTS = 10_000;
+const GLOBAL_KEY = '*';
+const loginAttempts = new Map<string, { count: number; resetAt: number }>();
+
+function getClientKey(request: Request): string {
+  // x-forwarded-for est fourni par le client : seule la dernière entrée (ajoutée par le proxy le plus
+  // proche) est fiable, et seulement derrière un reverse proxy maîtrisé. Le plafond global couvre le reste.
+  return request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
+}
+
+function isOverLimit(key: string, max: number, now: number): boolean {
+  const entry = loginAttempts.get(key);
+  return Boolean(entry && entry.resetAt > now && entry.count >= max);
+}
+
+function isRateLimited(key: string): boolean {
+  const now = Date.now();
+  return isOverLimit(GLOBAL_KEY, MAX_GLOBAL_FAILED_ATTEMPTS, now) || isOverLimit(key, MAX_LOGIN_ATTEMPTS, now);
+}
+
+function incrementAttempts(key: string, now: number): void {
+  const entry = loginAttempts.get(key);
+  if (!entry || entry.resetAt <= now) {
+    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
+    return;
+  }
+  entry.count += 1;
+}
+
+function recordFailedAttempt(key: string): void {
+  const now = Date.now();
+  if (loginAttempts.size >= MAX_TRACKED_CLIENTS) {
+    loginAttempts.forEach((entry, storedKey) => {
+      if (entry.resetAt <= now) {
+        loginAttempts.delete(storedKey);
+      }
+    });
+  }
+  incrementAttempts(GLOBAL_KEY, now);
+  if (loginAttempts.has(key) || loginAttempts.size < MAX_TRACKED_CLIENTS) {
+    incrementAttempts(key, now);
+  }
+}
+
+function safeEqual(a: string, b: string): boolean {
+  const left = createHash('sha256').update(a).digest();
+  const right = createHash('sha256').update(b).digest();
+  return timingSafeEqual(left, right);
+}
+
 function isBooleanString(value: unknown): value is 'true' | 'false' {
   return value === 'true' || value === 'false';
 }
@@ -58,6 +112,12 @@ export async function GET(_request: Request, { params }: { params: { nextauth?:
 }
 
 async function handleLogin(request: Request) {
+  const clientKey = getClientKey(request);
+
+  if (isRateLimited(clientKey)) {
+    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
+  }
+
   try {
     const { identifier, password, rememberMe } = (await request.json()) as Partial<{
       identifier: string;
@@ -84,13 +144,17 @@ async function handleLogin(request: Request) {
       );
     }
 
-    if (
-      trimmedIdentifier !== credentials.identifier ||
-      trimmedPassword !== credentials.password
-    ) {
+    const identifierMatches = safeEqual(trimmedIdentifier, credentials.identifier);
+    const passwordMatches = safeEqual(trimmedPassword, credentials.password);
+
+    if (!identifierMatches || !passwordMatches) {
+      recordFailedAttempt(clientKey);
+      console.warn('Failed admin login attempt from', clientKey);
       return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
     }
 
+    loginAttempts.delete(clientKey);
+
     const rememberFlag =
       typeof rememberMe === 'boolean'
         ? rememberMe
```

---

## SEC-02 — Clé HMAC des sessions dérivée de `identifiant:mot_de_passe`

**Sévérité : Moyenne** · `src/lib/auth/session.ts:14-24` (et `:7`, `:110-112`)

**Statut : Confirmé** · **Correctif : Confirmé**

**Relecture.** Reproduit hors ligne : un JWT signé par `jose` avec la clé `identifiant:mot_de_passe` est vérifié avec un simple HMAC-SHA256 Node, et le bon candidat est retrouvé parmi une liste. `handleLogout` (`route.ts:110-115`) supprime seulement le cookie et aucune liste de révocation n'existe. Le diff passe `git apply --check`, `tsc`, `next lint` et `next build`. Avec `ADMIN_SESSION_SECRET` défini, la connexion, les routes API et le middleware (runtime Edge) acceptent la session (tests dynamiques T5/T6/T9/T13). Sans cette variable, la signature lève une exception et la connexion répond `500` : c'est le comportement fail-closed annoncé. Le diff ne met pas à jour la note de `README.md:192`, qui indique encore « signed with your admin credentials ». À corriger lors de l'application ; ce n'est pas bloquant.

**Description.** Le cookie `admin-session` est un JWT HS256 signé avec la clé `${ADMIN_IDENTIFIER}:${ADMIN_PASSWORD}`. Le secret de signature est donc un mot de passe humain, dont la partie identifiant est probablement connue. Les jetons durent jusqu'à 30 jours (« Se souvenir de moi »). La déconnexion supprime seulement le cookie côté navigateur : un jeton copié reste valide jusqu'à son expiration, et le seul moyen de le révoquer est de changer le mot de passe admin.

**Preuve.**

```ts
// src/lib/auth/session.ts:14-24
function getSigningSecret(): Uint8Array {
  const identifier = process.env.ADMIN_IDENTIFIER;
  const password = process.env.ADMIN_PASSWORD;
  ...
  return encoder.encode(`${identifier}:${password}`);
}
// src/lib/auth/session.ts:7
const LONG_LIVED_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
```

Test : à partir d'un cookie émis par l'application, un simple `HMAC-SHA256("admin@example.com:" + candidat, header.payload)` comparé à la signature identifie le bon mot de passe parmi une liste de candidats, hors ligne et sans aucune requête au serveur.

**Scénario d'exploitation.** L'attaquant obtient un jeton : poste partagé, extension de navigateur, fichier HAR joint à un ticket, journaux d'un proxy à inspection TLS, etc. Il casse la clé hors ligne à vitesse GPU (format JWT HS256, hashcat mode 16500), sans être gêné par une éventuelle limitation de débit (SEC-01). Il récupère alors le **mot de passe admin en clair**, peut se connecter normalement et forger des jetons arbitraires. Même sans cassage, un jeton volé donne 30 jours d'accès que la déconnexion n'interrompt pas.

**Impact.** Récupération du mot de passe administrateur et accès persistant à toutes les bases.

**Correctif proposé.** Utiliser un secret aléatoire dédié (`ADMIN_SESSION_SECRET`, au moins 32 caractères aléatoires) et réduire la durée des sessions longues. Faire tourner ce secret invalide toutes les sessions, ce qui fournit un mécanisme de révocation. Le déploiement doit définir la nouvelle variable : sans elle, les sessions échouent volontairement (fail-closed).

```diff
diff --git a/.env.example b/.env.example
index 1b31e7d..49e524e 100644
--- a/.env.example
+++ b/.env.example
@@ -1,6 +1,9 @@
 # Admin credentials used server-side to protect the application UI.
 ADMIN_IDENTIFIER=""
 ADMIN_PASSWORD=""
+# Secret aléatoire dédié à la signature des sessions (ex. `openssl rand -base64 48`).
+# Le changer invalide toutes les sessions existantes.
+ADMIN_SESSION_SECRET=""
 
 # Preconfigured MongoDB connection strings used by the application.
 # Define up to four pairs. Both the URI and the NAME must be populated for the option
diff --git a/src/lib/auth/session.ts b/src/lib/auth/session.ts
index f57cffb..f647bd3 100644
--- a/src/lib/auth/session.ts
+++ b/src/lib/auth/session.ts
@@ -4,7 +4,7 @@ import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
 
 const SESSION_COOKIE_NAME = 'admin-session';
 const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
-const LONG_LIVED_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
+const LONG_LIVED_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
 
 export interface AdminSession {
   rememberMe: boolean;
@@ -12,15 +12,14 @@ export interface AdminSession {
 }
 
 function getSigningSecret(): Uint8Array {
-  const identifier = process.env.ADMIN_IDENTIFIER;
-  const password = process.env.ADMIN_PASSWORD;
+  const secret = process.env.ADMIN_SESSION_SECRET;
 
-  if (!identifier || !password) {
-    throw new Error('ADMIN_IDENTIFIER and ADMIN_PASSWORD must be configured');
+  if (!secret || secret.length < 32) {
+    throw new Error('ADMIN_SESSION_SECRET must be configured (at least 32 random characters)');
   }
 
   const encoder = new TextEncoder();
-  return encoder.encode(`${identifier}:${password}`);
+  return encoder.encode(secret);
 }
 
 function getMaxAge(rememberMe: boolean): number {
```

---

## SEC-03 — SSRF / pivot réseau via l'URI MongoDB arbitraire

**Sévérité : Basse** (initialement Moyenne) · `lib/preconfiguredMongoUris.ts:77-87` (utilisé par `app/api/{databases,collections,extract,view,search,crud,edit}/route.ts`)

**Statut : Confirmé (sévérité ajustée : Moyenne → Basse)** · **Correctif : Confirmé**

**Relecture.** Le chemin est confirmé : les 7 routes appellent `resolveMongoConnectionUri` puis `new MongoClient(resolved.uri)`, et toutes renvoient `error.message` (par exemple `app/api/databases/route.ts:57-62`). Mais chacune exige d'abord `getAdminSession()` (par exemple `app/api/databases/route.ts:25-29`), et l'application n'a qu'un seul rôle. Seul l'administrateur peut donc exploiter le problème, et la connexion à une URI arbitraire est une fonction documentée (`README.md:8`, `:89`). Le constat est un durcissement face à un compte déjà compromis (SEC-01, SEC-02, SEC-04), pas une élévation de privilège : d'où Basse. Correctif testé : URI personnalisée → `403 Custom MongoDB URIs are disabled on this server.` ; identifiant préconfiguré → inchangé ; corps vide → `400 MongoDB URI is required` comme avant. Le correctif désactive par défaut une fonction documentée. Il faut donc documenter `ALLOW_CUSTOM_MONGODB_URI` dans le README. Si le drapeau est activé, l'oracle `error.message` subsiste.

**Description.** Si aucun `preconfiguredMongoUriId` n'est fourni, `resolveMongoConnectionUri` renvoie tel quel le `mongoUri` du corps de requête, puis chaque route fait `new MongoClient(uri).connect()` depuis le serveur. Il n'y a ni liste d'hôtes autorisés, ni interrupteur pour désactiver la fonction. Le message d'erreur du pilote est renvoyé au client (`message: error.message`), ce qui en fait un oracle.

**Preuve.**

```ts
// lib/preconfiguredMongoUris.ts:77-87
  const trimmedMongoUri = mongoUri.trim();
  if (!trimmedMongoUri) { ... }
  return { success: true, uri: trimmedMongoUri };
// app/api/databases/route.ts:40-45 / 56-63
    const client = new MongoClient(resolved.uri);
    await client.connect();
    ...
    return NextResponse.json({ error: 'Failed to load databases', message }, { status: 500 });
```

Test dynamique : `POST /api/databases` avec `{"mongoUri":"mongodb://127.0.0.1:6399/?serverSelectionTimeoutMS=1500"}` renvoie `{"message":"connect ECONNREFUSED 127.0.0.1:6399"}`.

**Scénario d'exploitation.** Avec une session admin (ou après SEC-01, SEC-02 ou SEC-04), l'attaquant fait se connecter le serveur à des adresses du réseau interne (`10.x`, `172.16.x`, `169.254.x`, services du même VPC ou cluster). La différence entre `ECONNREFUSED`, un délai d'attente dépassé et une erreur de protocole donne un scan de ports interne. Si une instance MongoDB interne sans authentification (cas fréquent derrière un pare-feu) est joignable depuis le serveur, `/api/extract` la vide entièrement et `/api/crud` la modifie. Une URI `mongodb+srv://` déclenche en plus des résolutions DNS SRV vers un domaine contrôlé par l'attaquant.

**Impact.** Le serveur devient un rebond vers des bases et services internes qui ne devaient pas être exposés : exfiltration et altération hors du périmètre prévu.

**Correctif proposé.** Désactiver par défaut les URI personnalisées et ne les autoriser que par un drapeau explicite. Si la fonction doit rester ouverte, ajouter une liste blanche d'hôtes et ne plus renvoyer `error.message` brut au client. Après ce correctif, l'option « Enter custom MongoDB URI » de l'interface renvoie une erreur 403 explicite tant que le drapeau n'est pas activé.

```diff
diff --git a/.env.example b/.env.example
index 1b31e7d..de827f8 100644
--- a/.env.example
+++ b/.env.example
@@ -17,3 +17,6 @@ MONGODB_URI3_NAME=""
 
 MONGODB_URI4=""
 MONGODB_URI4_NAME=""
+
+# Autorise la saisie d'une URI MongoDB arbitraire (risque SSRF). Désactivé par défaut.
+ALLOW_CUSTOM_MONGODB_URI="false"
diff --git a/lib/preconfiguredMongoUris.ts b/lib/preconfiguredMongoUris.ts
index d6ea96e..7783ced 100644
--- a/lib/preconfiguredMongoUris.ts
+++ b/lib/preconfiguredMongoUris.ts
@@ -76,6 +76,14 @@ export function resolveMongoConnectionUri(
 
   const trimmedMongoUri = mongoUri.trim();
 
+  if (trimmedMongoUri && process.env.ALLOW_CUSTOM_MONGODB_URI !== 'true') {
+    return {
+      success: false,
+      error: 'Custom MongoDB URIs are disabled on this server.',
+      status: 403
+    };
+  }
+
   if (!trimmedMongoUri) {
     return {
       success: false,
```

---

## SEC-04 — Redirection ouverte après connexion

**Sévérité : Moyenne** · `components/LoginForm.tsx:23-24,54`

**Statut : Confirmé** · **Correctif : Confirmé**

**Relecture.** Chemin vérifié dans Next 14.2.3 installé : `useNavigate` construit `new URL(href, location.href)` puis `isExternalURL(url)` (`next/dist/client/components/app-router.js:95-97,167-175`). `handleExternalUrl` positionne `mpaNavigation` (`router-reducer/reducers/navigate-reducer.js`), puis `location.assign(canonicalUrl)` est appelé (`app-router.js:388-393`). `//evil.com`, `/\evil.com` et `/<TAB>/evil.com` résolvent tous vers `https://evil.com/`. Aucune garde serveur : `app/login/page.tsx` ne lit pas `from`. La regex corrigée a été testée : `/admin`, `/crud?x=1` et `/%2F%2Fevil.com` sont acceptés et restent sur la même origine. `//evil.com`, `/\evil.com`, `/<TAB>/evil.com`, `https://evil.com`, les espaces Unicode et l'espace insécable sont refusés et renvoient vers `/admin`.

**Description.** Après une connexion réussie, le formulaire redirige vers le paramètre `from` dès qu'il commence par `/`. Les URL relatives au protocole (`//evil.tld`), `/\evil.tld` (le navigateur normalise `\` en `/`) ou `/<TAB>/evil.tld` (tabulation supprimée par le parseur d'URL) passent ce test. Or le routeur App Router de Next 14 traite une URL d'une autre origine par une navigation complète (`location.assign`, cf. `node_modules/next/dist/client/components/app-router.js`, `isExternalURL` puis `mpaNavigation`).

**Preuve.**

```ts
// components/LoginForm.tsx:23-24
  const redirectToParam = searchParams?.get('from') ?? null;
  const redirectTo = redirectToParam && redirectToParam.startsWith('/') ? redirectToParam : '/admin';
// components/LoginForm.tsx:54
      router.push(redirectTo);
```

`new URL('//evil.com', 'https://app')` et `new URL('/\\evil.com', 'https://app')` donnent tous deux `https://evil.com/` (vérifié avec Node).

**Scénario d'exploitation.** L'attaquant envoie à l'administrateur un lien légitime `https://<app>/login?from=//evil.tld/login`. L'administrateur se connecte sur le vrai site, puis atterrit sur une copie contrôlée par l'attaquant qui affiche « Session expirée, veuillez vous reconnecter ». L'identifiant et le mot de passe saisis sont capturés, ce qui donne un accès complet (cf. SEC-01).

**Impact.** Hameçonnage crédible des identifiants du compte administrateur unique.

**Correctif proposé.** N'accepter qu'un chemin interne strict.

```diff
diff --git a/components/LoginForm.tsx b/components/LoginForm.tsx
index cad6464..cd8fb18 100644
--- a/components/LoginForm.tsx
+++ b/components/LoginForm.tsx
@@ -21,7 +21,9 @@ export default function LoginForm() {
   const [error, setError] = useState<string | null>(null);
 
   const redirectToParam = searchParams?.get('from') ?? null;
-  const redirectTo = redirectToParam && redirectToParam.startsWith('/') ? redirectToParam : '/admin';
+  // Chemin relatif interne uniquement : refuse `//host`, `/\host` et les caractères de contrôle/espaces.
+  const redirectTo =
+    redirectToParam && /^\/(?![\/\\])[^\s\\]*$/.test(redirectToParam) ? redirectToParam : '/admin';
 
   async function handleSubmit(event: FormEvent<HTMLFormElement>) {
     event.preventDefault();
```

---

## SEC-05 — Next.js 14.2.3 vulnérable

**Sévérité : Moyenne** · `package.json:15` (`"next": "14.2.3"`, version exacte confirmée dans `package-lock.json`)

**Statut : Confirmé** · **Correctif : Corrigé par la relecture** (complété)

**Relecture.** Contournement reproduit sur 14.2.3 : avec `x-middleware-subrequest`, `GET /crud` renvoie `307 → /login?from=/crud` (redirection de la page) ; sans cet en-tête, `307 → /login?from=%2Fcrud` (redirection du middleware). Toutes les pages et routes revérifient bien la session, ce qui contient l'impact. Sur 14.2.35, les deux requêtes donnent la redirection du middleware : le contournement est corrigé. `npm audit --omit=dev` en ligne (registre accessible pendant la relecture) recense **37 avis** Next.js sur le lockfile actuel, dont 4 critiques. Deux réserves sur le correctif initial :
1. **Le diff seul casse l'installation reproductible** : sans régénération du lockfile, `npm ci` échoue (« package.json and package-lock.json are not in sync »), constaté. Le lockfile régénéré (`npm install`, environ 630 lignes modifiées) doit être commité avec le diff. Un build avec 14.2.35 passe `tsc`, `next lint` et `next build`.
2. **14.2.35 est la dernière 14.x (dist-tag `next-14`) et reste vulnérable** : `npm audit` y recense encore **25 avis**, dont 3 critiques (RCE non authentifiée dans l'Image Optimization API avec des fichiers SVG ou AVIF, et RCE sur les serveurs Windows), corrigés seulement dans les 15.5.x. Leur applicabilité n'est pas démontrée : pas de dossier `public/`, pas d'usage de `next/image`. La montée en 14.2.35 est donc un palliatif immédiat, pas une correction complète. La migration vers une branche maintenue (`15.5.29`, dist-tag `backport`, ou `16.4.5`, dist-tag `latest`) impose React 19, ainsi que `cookies()` et `params` asynchrones (`src/lib/auth/session.ts`, `app/api/auth/[...nextauth]/route.ts`). Elle n'est ni minimale ni testée ici, et doit être planifiée.

Commandes à appliquer avec le diff : `npm install next@14.2.35 eslint-config-next@14.2.35 && git add package.json package-lock.json`.

**Description.** La version est figée sur une 14.2.x de mai 2024. Plusieurs avis de sécurité Next.js corrigés dans les 14.2.x suivantes la concernent, notamment :
- **CVE-2025-29927** (contournement de l'autorisation du middleware via l'en-tête `x-middleware-subrequest`, corrigé en 14.2.25) ;
- **CVE-2024-51479** (contournement du middleware pour les chemins à la racine, corrigé en 14.2.15) ;
- des déni de service et problèmes de l'optimiseur d'images ou de cache (CVE-2024-47831, CVE-2025-55173, CVE-2025-57752) ;
- les correctifs de décembre 2025 sur les composants serveur (DoS, corrigé dans la dernière 14.2.x).

**Preuve / vérification dynamique.** `GET /crud` avec `x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware` saute bien le middleware : la redirection obtenue est celle de la page (`/login?from=/crud`, non encodée), pas celle du middleware (`/login?from=%2Fcrud`). L'impact reste **contenu** grâce aux contrôles de session redondants dans chaque page (`app/*/page.tsx`, `app/admin/layout.tsx`) et dans chaque route API. Cette défense en profondeur ne tient toutefois que tant qu'aucune nouvelle page ne repose uniquement sur le middleware.

**Scénario d'exploitation.** Aujourd'hui : déni de service et attaques sur le cache et l'optimiseur d'images. Demain : toute page ajoutée sans `getAdminSession()` serait accessible sans authentification grâce à l'en-tête ci-dessus.

**Impact.** Disponibilité ; régression d'autorisation latente.

**Correctif proposé.** Monter en 14.2.35 (palliatif, voir la relecture ci-dessus), dernière 14.2.x publiée au moment de l'audit (`npm view next@14 version`), puis régénérer le lockfile (`npm install`) et relancer `npm audit` en ligne. Envisager ensuite une migration vers une branche maintenue. En complément, bloquer l'en-tête `x-middleware-subrequest` au niveau du reverse proxy.

```diff
diff --git a/package.json b/package.json
index a81eb85..aef38fa 100644
--- a/package.json
+++ b/package.json
@@ -12,7 +12,7 @@
     "archiver": "^5.3.2",
     "jose": "^6.1.0",
     "mongodb": "^6.5.0",
-    "next": "14.2.3",
+    "next": "14.2.35",
     "react": "18.3.1",
     "react-dom": "18.3.1"
   },
@@ -22,7 +22,7 @@
     "@types/react": "^18.2.66",
     "@types/react-dom": "^18.2.22",
     "eslint": "^8.57.0",
-    "eslint-config-next": "14.2.3",
+    "eslint-config-next": "14.2.35",
     "typescript": "^5.4.5"
   }
 }
```

---

## SEC-06 — URI MongoDB personnalisée placée dans l'URL

**Sévérité : Basse** · `components/ExtractorForm.tsx:526,553`, `app/crud/CrudPageClient.tsx:148`, `app/search/SearchPageClient.tsx:338`

**Statut : Confirmé** · **Correctif : Confirmé** (régression fonctionnelle assumée)

**Relecture.** Les quatre points d'émission sont confirmés et il n'y en a pas d'autre (`grep params.set` / `router.push` / `href=`). `router.push` côté App Router émet une requête RSC vers l'URL complète, query string comprise : l'URI atteint donc bien les journaux serveur. Petite inexactitude du constat : aucun lien ne mène à `/edit` (`EditPageClient.tsx:52` lit `mongoUri`, mais aucune page ne le produit). Le diff couvre les 4 sites et compile. Conséquence vérifiée dans le code : en mode URI personnalisée, `/view` reçoit une URI vide et affiche « MongoDB URI is required ». L'audit annonce cette régression, cohérente avec SEC-03. `CrudPageClient.tsx:694-713` et `SearchPageClient.tsx:323` affichent toujours l'URI saisie : c'est un risque d'exposition à l'écran, sans fuite réseau.

**Description.** Quand l'utilisateur saisit une URI personnalisée (qui contient en général `user:motdepasse@`), l'application la recopie dans la query string des liens vers `/view`, `/crud` et `/edit` (`?mongoUri=mongodb+srv://user:****@...`). Ces pages sont rendues côté serveur. L'URI complète, avec ses identifiants, se retrouve donc dans les journaux d'accès du reverse proxy et de l'hébergeur, dans l'historique et la synchronisation du navigateur, et dans toute URL copiée ou partagée. `CrudPageClient.tsx:713` l'affiche aussi en clair (« Connected through: … »).

**Preuve.**

```ts
// components/ExtractorForm.tsx:525-527
    if (isUsingCustomMongoUri) {
      params.set('mongoUri', trimmedMongoUri);
    } else if (selectedPreconfiguredId) {
```

**Scénario d'exploitation.** Une personne ayant accès aux journaux HTTP de l'hébergement (équipe d'exploitation, prestataire, fuite de logs) ou au profil de navigateur récupère des identifiants MongoDB valides et se connecte directement à la base, sans passer par l'application.

**Impact.** Fuite d'identifiants de bases de données.

**Correctif proposé.** Ne plus propager l'URI dans l'URL : seul l'identifiant préconfiguré l'est. En mode URI personnalisée, l'utilisateur ressaisit l'URI sur `/crud`. Les pages `/view` et `/edit`, qui n'ont pas de champ de saisie, ne fonctionnent alors plus qu'avec des connexions préconfigurées, ce qui va dans le sens de SEC-03. Si ce flux doit être conservé, transmettre l'URI par `sessionStorage` plutôt que par l'URL.

```diff
diff --git a/app/crud/CrudPageClient.tsx b/app/crud/CrudPageClient.tsx
index c7b417e..d14aaa5 100644
--- a/app/crud/CrudPageClient.tsx
+++ b/app/crud/CrudPageClient.tsx
@@ -144,9 +144,7 @@ export default function CrudPageClient({ preconfiguredOptions }: CrudPageClientP
       params.set('collectionName', trimmedCollectionName);
     }
 
-    if (isUsingCustomMongoUri && trimmedMongoUri) {
-      params.set('mongoUri', trimmedMongoUri);
-    } else if (selectedPreconfiguredId) {
+    if (!isUsingCustomMongoUri && selectedPreconfiguredId) {
       params.set('preconfiguredMongoUriId', selectedPreconfiguredId);
     }
 
@@ -163,7 +161,6 @@ export default function CrudPageClient({ preconfiguredOptions }: CrudPageClientP
   }, [
     isUsingCustomMongoUri,
     selectedPreconfiguredId,
-    trimmedMongoUri,
     trimmedDatabaseName,
     trimmedCollectionName,
     trimmedQuery,
diff --git a/app/search/SearchPageClient.tsx b/app/search/SearchPageClient.tsx
index 539720a..1e8ae7f 100644
--- a/app/search/SearchPageClient.tsx
+++ b/app/search/SearchPageClient.tsx
@@ -334,9 +334,7 @@ export default function SearchPageClient({ preconfiguredOptions }: SearchPageCli
       params.set('collectionName', trimmedCollectionName);
     }
 
-    if (isUsingCustomMongoUri && trimmedMongoUri) {
-      params.set('mongoUri', trimmedMongoUri);
-    } else if (selectedPreconfiguredId) {
+    if (!isUsingCustomMongoUri && selectedPreconfiguredId) {
       params.set('preconfiguredMongoUriId', selectedPreconfiguredId);
     }
 
@@ -353,7 +351,6 @@ export default function SearchPageClient({ preconfiguredOptions }: SearchPageCli
   }, [
     isUsingCustomMongoUri,
     selectedPreconfiguredId,
-    trimmedMongoUri,
     trimmedDatabaseName,
     trimmedCollectionName,
     trimmedQuery,
diff --git a/components/ExtractorForm.tsx b/components/ExtractorForm.tsx
index dd9c25c..2194719 100644
--- a/components/ExtractorForm.tsx
+++ b/components/ExtractorForm.tsx
@@ -522,9 +522,7 @@ export default function ExtractorForm({ preconfiguredOptions }: ExtractorFormPro
       params.set('collectionName', trimmedCollectionName);
     }
 
-    if (isUsingCustomMongoUri) {
-      params.set('mongoUri', trimmedMongoUri);
-    } else if (selectedPreconfiguredId) {
+    if (!isUsingCustomMongoUri && selectedPreconfiguredId) {
       params.set('preconfiguredMongoUriId', selectedPreconfiguredId);
     }
 
@@ -549,9 +547,7 @@ export default function ExtractorForm({ preconfiguredOptions }: ExtractorFormPro
     params.set('databaseName', trimmedDatabaseName);
     params.set('collectionName', trimmedCollectionName);
 
-    if (isUsingCustomMongoUri) {
-      params.set('mongoUri', trimmedMongoUri);
-    } else if (selectedPreconfiguredId) {
+    if (!isUsingCustomMongoUri && selectedPreconfiguredId) {
       params.set('preconfiguredMongoUriId', selectedPreconfiguredId);
     }
 
```

---

## SEC-07 — Zip Slip dans l'archive exportée

**Sévérité : Basse** · `app/api/extract/route.ts:84`

**Statut : Confirmé** · **Correctif : Confirmé**

**Relecture.** Vérifié sur `archiver` 5.3.2 / `archiver-utils` 2.1.0 installés (`index.js:98-100`). Une archive produite avec l'entrée `a/../../../x_<horodatage>.json` conserve ce nom tel quel. `../../evil…` est en revanche nettoyé en tête. Avec le correctif, le nom devient `a_.._.._.._x_<horodatage>.json`, sans aucun séparateur. Le nom du fichier unique (`route.ts:171`) passe par `encodeURIComponent` dans `Content-Disposition` et n'est pas concerné. Les noms non ASCII deviennent des `_`, avec un risque de collision déjà signalé.

**Description.** En export « toutes collections », chaque entrée du ZIP s'appelle `${collectionName}_${timestamp}.json`, et le nom de collection vient de `db.listCollections()` sans assainissement. MongoDB n'interdit pas `/` ni `..` dans un nom de collection (seuls `$`, `\0`, la chaîne vide et le préfixe `system.` le sont). Côté archiver 5.3.2, `archiver-utils.sanitizePath` (`normalizePath(p).replace(/^\w+:/, '').replace(/^(\.\.\/|\/)+/, '')`) ne retire les `../` qu'en **tête** de chemin. Vérifié : `a/../../../x_1.json` est conservé tel quel.

**Preuve.**

```ts
// app/api/extract/route.ts:84
      archive.append(jsonContent, { name: `${result.collectionName}_${timestampSuffix}.json` });
```

**Scénario d'exploitation.** Un acteur qui a seulement le droit d'écrire dans une base exportée (par exemple le compte applicatif d'un autre service) crée une collection `x/../../../../home/<user>/.config/<app>/settings`. Quand l'administrateur exporte la base puis décompresse l'archive avec un outil ou une bibliothèque qui ne protège pas contre le Zip Slip, un fichier `settings_<horodatage>.json` est écrit hors du répertoire d'extraction. Le suffixe imposé `_<horodatage>.json` limite fortement les cibles exploitables, et beaucoup d'outils récents (Info-ZIP, Explorateur Windows, `zipfile` Python) bloquent ce type de chemin.

**Impact.** Écriture de fichiers JSON arbitraires sur le poste de l'administrateur, selon l'outil de décompression utilisé.

**Correctif proposé.** Assainir le nom d'entrée. Deux collections aux noms proches pourraient alors produire le même nom de fichier ; si nécessaire, ajouter un index.

```diff
diff --git a/app/api/extract/route.ts b/app/api/extract/route.ts
index d6c68bd..c4446f2 100644
--- a/app/api/extract/route.ts
+++ b/app/api/extract/route.ts
@@ -81,7 +81,8 @@ async function createZip(results: DocumentData[], timestampSuffix: string): Prom
 
     for (const result of results) {
       const jsonContent = JSON.stringify(result.documents, null, 2);
-      archive.append(jsonContent, { name: `${result.collectionName}_${timestampSuffix}.json` });
+      const safeName = result.collectionName.replace(/[^A-Za-z0-9._-]/g, '_');
+      archive.append(jsonContent, { name: `${safeName}_${timestampSuffix}.json` });
     }
 
     archive
```

---

## SEC-08 — Protection CSRF reposant uniquement sur `SameSite=Lax`

**Sévérité : Basse** · `src/lib/auth/session.ts:77`, `middleware.ts:53`, routes `app/api/*/route.ts` (`await request.json()`)

**Statut : Confirmé** · **Correctif : Confirmé**

**Relecture.** `Request.json()` analyse bien un corps `text/plain` (vérifié avec Node 22). Aucune route ne lit `Origin` ou `Content-Type`, et le cookie est `SameSite=Lax`. Toutes les routes d'état sont en `POST` ; aucun `GET` ne modifie d'état. Correctif testé sur build : `Origin: https://evil.example` + `text/plain` → `403` ; `Origin: null` → `403` ; même origine → la requête passe ; `GET /api/health` reste accessible. La connexion, la déconnexion et les appels de l'interface envoient tous `Origin`, puisque les navigateurs l'ajoutent à tout `fetch` non-GET. Ils fonctionnent donc. Points d'exploitation à connaître : (1) une requête **sans** `Origin` est refusée, donc les clients scriptés (`curl`) des endpoints documentés dans le README doivent désormais envoyer `Origin` ; (2) un `x-forwarded-host` multivalué (`a, b`) ou un proxy qui réécrit `Host` sans poser `x-forwarded-host` bloquerait les requêtes légitimes. L'en-tête de contournement de CVE-2025-29927 ne permet pas d'éviter ce contrôle depuis un navigateur, car un en-tête personnalisé cross-site déclenche un preflight CORS refusé.

**Description.** Les routes d'état (`/api/crud`, `/api/edit`, `/api/extract`, `/api/auth/*`) ne vérifient ni l'en-tête `Origin`, ni un jeton CSRF, ni le `Content-Type` : `request.json()` analyse aussi un corps envoyé en `text/plain`. Le middleware ne couvre pas `/api`. La seule protection est l'attribut `SameSite=Lax` du cookie, qui bloque les requêtes *cross-site* mais pas celles d'un site *same-site* (autre sous-domaine du même domaine enregistrable).

**Preuve.** Test dynamique : `POST /api/databases` avec `Content-Type: text/plain` et `Origin: https://evil.example` (cookie de session fourni) est traité normalement.

**Scénario d'exploitation.** Si l'outil est hébergé sous un sous-domaine d'un domaine partagé (par exemple `extract.<organisation>.fr`) et qu'un autre sous-domaine est compromis ou permet du XSS, une page de ce sous-domaine envoie un `<form enctype="text/plain">` (ou un `fetch` `no-cors`) vers `/api/crud` avec `{"action":"delete",...}`. Le cookie est envoyé, puisque la requête est same-site, et la suppression est exécutée au nom de l'administrateur connecté.

**Impact.** Modification ou suppression de documents, limitée à des attaquants same-site.

**Correctif proposé.** Vérifier l'origine des requêtes non-GET vers `/api`. Le contrôle utilise `x-forwarded-host` en priorité : derrière un proxy, s'assurer que celui-ci réécrit bien cet en-tête.

```diff
diff --git a/middleware.ts b/middleware.ts
index 3c4e214..4ea037a 100644
--- a/middleware.ts
+++ b/middleware.ts
@@ -14,6 +14,21 @@ export async function middleware(request: NextRequest) {
     return NextResponse.next();
   }
 
+  if (pathname.startsWith('/api/') && request.method !== 'GET' && request.method !== 'HEAD') {
+    const origin = request.headers.get('origin');
+    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
+    let originHost: string | null = null;
+    try {
+      originHost = origin ? new URL(origin).host : null;
+    } catch {
+      originHost = null;
+    }
+    if (!originHost || originHost !== host) {
+      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
+    }
+    return NextResponse.next();
+  }
+
   const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
   const hasSession = await isValidAdminSessionToken(sessionToken);
 
@@ -50,5 +65,5 @@ export async function middleware(request: NextRequest) {
 }
 
 export const config = {
-  matcher: ['/admin/:path*', '/login', '/search', '/extract', '/crud', '/view', '/edit']
+  matcher: ['/admin/:path*', '/login', '/search', '/extract', '/crud', '/view', '/edit', '/api/:path*']
 };
```

---

## SEC-09 — Absence d'en-têtes de sécurité HTTP

**Sévérité : Info** · `next.config.mjs:2-4`

**Statut : Confirmé** · **Correctif : Confirmé**

**Relecture.** `next.config.mjs` ne définit ni `headers()` ni `poweredByHeader`. Après correctif, `curl -I /login` renvoie bien les 5 en-têtes, sans `X-Powered-By`. `form-action 'self'` ne gêne pas l'application, qui soumet ses formulaires par `fetch`. `includeSubDomains` ne s'applique qu'aux sous-domaines de l'hôte de l'outil.

Aucun `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Strict-Transport-Security`, `Referrer-Policy` ni `X-Content-Type-Options` n'est défini, et `X-Powered-By: Next.js` est envoyé. Le clickjacking cross-site est déjà atténué par `SameSite=Lax`, puisque le cookie n'est pas envoyé dans une iframe tierce. Il s'agit d'un durcissement de bonne pratique.

```diff
diff --git a/next.config.mjs b/next.config.mjs
index 7d08ffa..b3087bf 100644
--- a/next.config.mjs
+++ b/next.config.mjs
@@ -1,6 +1,18 @@
 /** @type {import('next').NextConfig} */
+const securityHeaders = [
+  { key: 'X-Frame-Options', value: 'DENY' },
+  { key: 'X-Content-Type-Options', value: 'nosniff' },
+  { key: 'Referrer-Policy', value: 'no-referrer' },
+  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
+  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
+];
+
 const nextConfig = {
-  reactStrictMode: true
+  reactStrictMode: true,
+  poweredByHeader: false,
+  async headers() {
+    return [{ source: '/:path*', headers: securityHeaders }];
+  }
 };
 
 export default nextConfig;
```

---

## SEC-10 — Historique Git : mot de passe côté client et API ouvertes (période `512d585` → `ddb4ca8`)

**Sévérité : Info** · **Statut : Confirmé (période d'exposition élargie)** · **Correctif : Confirmé (actions étendues)**

**Relecture.** Aucun secret réel trouvé, confirmé. Sur toutes les versions de `.env.example`, toutes les valeurs sont vides. `.env` n'a jamais été suivi. Les fichiers supprimés (`server/`, `extract-db-app/`, `components/PasswordGate.tsx`) ne contiennent que des exemples. `README.md:69-70` contient un exemple (`admin@example.com`) et non un secret. Le point sur `NEXT_PUBLIC_PAGE_PASSWORD` est confirmé (`512d585:components/PasswordGate.tsx:5`, valeur incluse dans le bundle). **Désaccord sur la période** : les API étaient sans authentification **dès le premier backend**, pas seulement à partir de `512d585`. `git grep -i "session\|password"` ne trouve rien dans `app/api` ni `server/src` à `16e7b0a`, `f839135`, `512d585` et `ddb4ca8^`. Plus précisément :
- `16e7b0a` (22/10/2025) → `9854553` (23/10/2025) : serveur Express `server/src/index.ts` avec `app.use(cors())` (toutes origines autorisées) et `POST /api/extract` ouvert, mais l'URI était fournie par l'appelant ;
- `e5cc9d2` (23/10/2025) : apparition des URI préconfigurées (`MONGODB_URI1`…, identifiants côté serveur). À partir de ce commit, et **avant même** le mot de passe côté client de `512d585`, un déploiement exposait l'export complet des bases préconfigurées sans authentification, jusqu'à `ddb4ca8` (27/10/2025).

Les actions 1 à 3 restent valables, mais l'action 3 doit couvrir toute build déployée entre `e5cc9d2` et `ddb4ca8` (23/10 → 27/10/2025), et pas seulement celles construites à partir de `512d585`.


**Constat.** Aucun secret réel dans l'historique : `.env` n'a jamais été commis, et `.env.example` n'a jamais contenu que des valeurs vides. Toutes les URI rencontrées sont des exemples (`mongodb://localhost:27017/mydb`, `mongodb+srv://user:****@cluster.mongodb.net`). En revanche :
- le commit `512d585` (24/10/2025) a introduit `components/PasswordGate.tsx`, qui comparait côté navigateur la saisie à `NEXT_PUBLIC_PAGE_PASSWORD`. Une variable `NEXT_PUBLIC_*` est **incluse en clair dans le bundle JavaScript** servi à tout visiteur ;
- jusqu'au commit `ddb4ca8` (27/10/2025), qui a supprimé ce composant et ajouté l'authentification serveur, les routes `/api/extract`, `/api/databases`, `/api/collections` et `/api/view` **ne vérifiaient aucune session** : elles étaient appelables directement, hors navigateur.

Le commit `309b20b` retire seulement la variable devenue inutile de `.env.example`.

**Scénario.** Une instance construite et déployée entre ces deux commits avec `NEXT_PUBLIC_PAGE_PASSWORD` renseigné a publié ce mot de passe dans ses fichiers `/_next/static/chunks/*.js`, et a exposé l'export complet des bases préconfigurées sans authentification. Ces fichiers ont pu être mis en cache par des CDN ou archivés.

**Action.**
1. Vérifier dans l'historique des déploiements (Vercel ou autre) si une build de cette période a été exposée avec `NEXT_PUBLIC_PAGE_PASSWORD` non vide.
2. Si oui, **considérer ce mot de passe comme public** et le changer partout où il a été réutilisé, notamment s'il a servi pour `ADMIN_PASSWORD`.
3. Faire tourner les identifiants des bases `MONGODB_URI*` qui étaient configurées sur cette instance, et consulter les journaux d'accès de l'époque à la recherche d'appels à `/api/extract`.

Aucune réécriture d'historique n'est nécessaire, puisque le dépôt ne contient aucune valeur sensible. Si un secret était découvert ultérieurement, il faudrait d'abord le révoquer, puis purger l'historique (`git filter-repo --replace-text`), forcer le push de toutes les branches et tags, et demander l'invalidation des caches et forks.

---

## Relecture indépendante

| Élément | Valeur |
|---|---|
| Date | 2026-11-04 |
| Base relue | `d279cdc` (audit initial) sur `309b20b`, branche `ccr-f9f6ef8d-r2mrqx` |
| Posture | Chaque affirmation de l'audit a été traitée comme une hypothèse. Le code cité a été relu, avec tout le chemin d'exécution (middleware, revérification de session dans les pages et les routes, validation en amont) ; chaque correctif a été appliqué et éprouvé dans un worktree jetable, supprimé à la fin. Seul ce fichier est modifié dans le dépôt. |

### Méthode

1. **Relecture statique.** Fichiers relus : `middleware.ts`, `src/lib/auth/session.ts`, `app/api/auth/[...nextauth]/route.ts`, les 8 autres routes `app/api/*`, toutes les `page.tsx` et `app/admin/layout.tsx`, `lib/preconfiguredMongoUris.ts`, `components/LoginForm.tsx`, ainsi que les sites de construction d'URL (`grep params.set|router.push|href=`). Code tiers vérifié dans `node_modules` : routeur App Router de Next 14.2.3 (`app-router.js`, `navigate-reducer.js`), `archiver-utils` 2.1.0.
2. **Historique Git.** Commandes : `git log --all` (44 commits, branches `main` et `ccr-f9f6ef8d-r2mrqx`), toutes les versions de `.env.example`, chemins jamais suivis (`git ls-tree` sur chaque commit), fichiers supprimés, `git grep` de l'authentification à `16e7b0a`, `f839135`, `512d585`, `ddb4ca8^` et `ddb4ca8`, `git log -S MONGODB_URI1`.
3. **Correctifs.** Les 9 diffs ont été extraits automatiquement du document. Chacun passe `git apply --check` seul ; tous ont ensuite été appliqués ensemble dans le worktree.
4. **Vérifications statiques et build** (Node 22.23.4, npm 10.9.9, `npm ci`) :
   - diffs de l'audit, Next 14.2.3 : `tsc --noEmit` OK, `next lint` OK (« No ESLint warnings or errors »), `next build` OK ;
   - première version du SEC-01 corrigé : `tsc` et `next build` **échouent** (TS2802, itération d'une `Map` avec la cible `es5` du tsconfig). Remplacée par `forEach`, puis `tsc`, `next lint` et `next build` OK ;
   - avec `npm install next@14.2.35 eslint-config-next@14.2.35` : `tsc`, `next lint` et `next build` OK (« Next.js 14.2.35 »). `npm ci` sur le `package.json` modifié sans lockfile régénéré : **échec**.
5. **Tests dynamiques** sur `next start -H 127.0.0.1` (port libre, identifiants de test aléatoires jamais écrits sur disque, sans MongoDB) :
   - SEC-01, diff initial : même IP ×7 → `401×5, 429×2` ; rotation de `X-Forwarded-For` ×20 → `401×20` (**contournement**) ; proxy en ajout ×8 → `401×8` (**contournement**) ; rafale parallèle ×40 → `401×5, 429×35`.
   - SEC-01, diff corrigé : bonne connexion → `200` ; même IP ×7 → `401×5, 429×2` ; proxy en ajout ×7 → `401×5, 429×2` ; rotation ×30 → `401` jusqu'à 30 échecs cumulés puis `429` ; bonne connexion une fois le plafond global atteint → `429` (contrepartie documentée).
   - T5/T6 : connexion `200`, puis URI personnalisée → `403` (SEC-03).
   - T7/T8/T9/T9b : `Origin` étranger + `text/plain` → `403` ; sans `Origin` → `403` ; même origine → `400` métier ; `Origin: null` → `403` (SEC-08).
   - T10 : les 5 en-têtes de sécurité sont présents, `X-Powered-By` absent (SEC-09).
   - T11 : `x-middleware-subrequest` sur `/crud` → redirection de la page en 14.2.3 (contournement), redirection du middleware en 14.2.35 (corrigé) (SEC-05).
   - T12/T13 : `GET /api/health` → `200` ; déconnexion → `200`.
6. **Vérifications hors ligne (Node).** `Request.json()` analyse un corps `text/plain`. Mot de passe retrouvé depuis un JWT signé `identifiant:mot_de_passe` par simple HMAC. Comportement de la regex SEC-04 sur 12 cas. Archive ZIP produite par `archiver` 5.3.2 avec et sans assainissement, relue par `zipfile`.
7. **Dépendances.** `npm audit --omit=dev`, en ligne cette fois, contrairement à l'audit initial : `next` 14.2.3 → 37 avis (4 critiques, 13 hauts) ; `next` 14.2.35 → 25 avis (3 critiques, 9 hauts). Autres paquets signalés dans les deux cas : `postcss`, `nanoid`, `source-map-js`, `brace-expansion`, `minimatch`. Ce sont surtout des dépendances de build ou d'outillage, et leur exposition à l'exécution n'a pas été établie : ils ne font pas l'objet d'un constat distinct.

### Désaccords avec l'audit initial

1. **SEC-01, correctif contournable.** La clé de limitation est la première entrée de `X-Forwarded-For`, fournie par le client. Une rotation de l'en-tête, ou un proxy en mode ajout, annule la protection (démontré). La `Map` n'est pas bornée. Le diff a été remplacé : dernière entrée de `X-Forwarded-For`, plafond global, borne mémoire. Il a été testé.
2. **SEC-03, sévérité Moyenne → Basse.** L'exploitation exige la session de l'unique administrateur (contrôle `getAdminSession()` dans les 7 routes), et la connexion à une URI arbitraire est une fonction documentée. Il s'agit d'un durcissement, pas d'une élévation de privilège.
3. **SEC-05, correctif incomplet.** (a) Sans lockfile régénéré, `npm ci` échoue. (b) 14.2.35 est la fin de la branche 14 et reste dans la plage de 25 avis, dont 3 critiques, corrigés seulement en 15.5.x. C'est un palliatif ; la migration vers 15.5.29 ou 16.x est à planifier. La phrase « `npm audit --offline` … sans valeur » de l'audit initial était juste ; l'audit en ligne confirme le risque résiduel.
4. **SEC-10, période sous-estimée.** Les API étaient sans authentification dès `16e7b0a` (22/10/2025, Express avec `cors()` ouvert). L'export sans authentification des bases **préconfigurées** est possible dès `e5cc9d2` (23/10/2025), et non à partir de `512d585`. L'action 3 est étendue en conséquence.
5. **Précisions mineures, sans changement de verdict.** SEC-06 : aucun lien ne mène à `/edit`. SEC-02 : `README.md:192` est à mettre à jour avec le correctif. SEC-03 : `ALLOW_CUSTOM_MONGODB_URI` est à documenter dans le README. SEC-08 : les clients scriptés doivent envoyer `Origin`, et un `x-forwarded-host` multivalué casse le contrôle.

Aucune nouvelle faille manifeste n'a été trouvée dans le périmètre relu. Les routes CRUD, recherche et édition n'offrent à l'administrateur que des pouvoirs qu'il a déjà par conception. Aucun `dangerouslySetInnerHTML`, `eval`, `new Function` ni `child_process` dans `app/`, `components/`, `lib/`, `src/`.
