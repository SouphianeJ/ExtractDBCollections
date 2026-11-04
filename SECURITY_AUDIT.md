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

| ID | Sévérité | Titre | Fichier:ligne | Statut |
|---|---|---|---|---|
| SEC-01 | Haute | Connexion admin sans limitation de tentatives ni comparaison à temps constant | `app/api/auth/[...nextauth]/route.ts:60-92` | Ouvert |
| SEC-02 | Moyenne | Clé HMAC des sessions dérivée de `identifiant:mot_de_passe` (cassage hors ligne, pas de révocation, 30 jours) | `src/lib/auth/session.ts:14-24` | Ouvert |
| SEC-03 | Moyenne | SSRF / pivot réseau via l'URI MongoDB arbitraire acceptée par toutes les routes | `lib/preconfiguredMongoUris.ts:77-87` | Ouvert |
| SEC-04 | Moyenne | Redirection ouverte après connexion via `?from=//evil.tld` | `components/LoginForm.tsx:23-24,54` | Ouvert |
| SEC-05 | Moyenne | Next.js 14.2.3 figé, touché par plusieurs avis de sécurité publiés depuis (dont CVE-2025-29927) | `package.json:15` | Ouvert |
| SEC-06 | Basse | URI MongoDB personnalisée (avec identifiants) placée dans l'URL des pages | `components/ExtractorForm.tsx:526,553`, `app/crud/CrudPageClient.tsx:148`, `app/search/SearchPageClient.tsx:338` | Ouvert |
| SEC-07 | Basse | Zip Slip : noms de collection non assainis dans l'archive ZIP exportée | `app/api/extract/route.ts:84` | Ouvert |
| SEC-08 | Basse | Pas de protection CSRF propre : seule `SameSite=Lax` protège, `request.json()` accepte `text/plain` | `src/lib/auth/session.ts:77`, `middleware.ts:53` | Ouvert |
| SEC-09 | Info | Aucun en-tête de sécurité HTTP ; `X-Powered-By` exposé | `next.config.mjs:2-4` | Ouvert |
| SEC-10 | Info | Historique Git : pas de secret réel, mais une période avec mot de passe côté client (`NEXT_PUBLIC_PAGE_PASSWORD`) et des API non authentifiées | commits `512d585` → `ddb4ca8` | À vérifier |

Les correctifs proposés sont indépendants et s'appliquent aussi ensemble, dans l'ordre SEC-01 → SEC-09 (SEC-02 et SEC-03 modifient tous deux `.env.example` sur des zones distinctes).

---

## SEC-01 — Connexion admin sans limitation de tentatives ni comparaison à temps constant

**Sévérité : Haute** · `app/api/auth/[...nextauth]/route.ts:60-92`

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

**Correctif proposé.** Limitation par client (5 échecs par 15 min), comparaison à temps constant et journalisation des échecs. Le compteur est en mémoire, donc propre à chaque instance : en déploiement multi-instances ou serverless, utiliser un stockage partagé (Redis, KV) ou une règle WAF. Ne faire confiance à `x-forwarded-for` que derrière un reverse proxy qui l'écrase. À terme, ajouter une MFA ou un SSO devant l'outil.

```diff
diff --git a/app/api/auth/[...nextauth]/route.ts b/app/api/auth/[...nextauth]/route.ts
index cd0d263..985599e 100644
--- a/app/api/auth/[...nextauth]/route.ts
+++ b/app/api/auth/[...nextauth]/route.ts
@@ -1,3 +1,4 @@
+import { createHash, timingSafeEqual } from 'crypto';
 import { NextResponse } from 'next/server';
 
 import {
@@ -25,6 +26,37 @@ function getAdminCredentials(): { identifier: string; password: string } | null
   return { identifier, password };
 }
 
+const MAX_LOGIN_ATTEMPTS = 5;
+const LOGIN_WINDOW_MS = 15 * 60 * 1000;
+const loginAttempts = new Map<string, { count: number; resetAt: number }>();
+
+function getClientKey(request: Request): string {
+  // À adapter : ne faire confiance à x-forwarded-for que derrière un reverse proxy maîtrisé.
+  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
+}
+
+function isRateLimited(key: string): boolean {
+  const now = Date.now();
+  const entry = loginAttempts.get(key);
+  return Boolean(entry && entry.resetAt > now && entry.count >= MAX_LOGIN_ATTEMPTS);
+}
+
+function recordFailedAttempt(key: string): void {
+  const now = Date.now();
+  const entry = loginAttempts.get(key);
+  if (!entry || entry.resetAt <= now) {
+    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
+    return;
+  }
+  entry.count += 1;
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
@@ -58,6 +90,12 @@ export async function GET(_request: Request, { params }: { params: { nextauth?:
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
@@ -84,13 +122,17 @@ async function handleLogin(request: Request) {
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

**Sévérité : Moyenne** · `lib/preconfiguredMongoUris.ts:77-87` (utilisé par `app/api/{databases,collections,extract,view,search,crud,edit}/route.ts`)

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

**Description.** La version est figée sur une 14.2.x de mai 2024. Plusieurs avis de sécurité Next.js corrigés dans les 14.2.x suivantes la concernent, notamment :
- **CVE-2025-29927** (contournement de l'autorisation du middleware via l'en-tête `x-middleware-subrequest`, corrigé en 14.2.25) ;
- **CVE-2024-51479** (contournement du middleware pour les chemins à la racine, corrigé en 14.2.15) ;
- des déni de service et problèmes de l'optimiseur d'images ou de cache (CVE-2024-47831, CVE-2025-55173, CVE-2025-57752) ;
- les correctifs de décembre 2025 sur les composants serveur (DoS, corrigé dans la dernière 14.2.x).

**Preuve / vérification dynamique.** `GET /crud` avec `x-middleware-subrequest: middleware:middleware:middleware:middleware:middleware` saute bien le middleware : la redirection obtenue est celle de la page (`/login?from=/crud`, non encodée), pas celle du middleware (`/login?from=%2Fcrud`). L'impact reste **contenu** grâce aux contrôles de session redondants dans chaque page (`app/*/page.tsx`, `app/admin/layout.tsx`) et dans chaque route API. Cette défense en profondeur ne tient toutefois que tant qu'aucune nouvelle page ne repose uniquement sur le middleware.

**Scénario d'exploitation.** Aujourd'hui : déni de service et attaques sur le cache et l'optimiseur d'images. Demain : toute page ajoutée sans `getAdminSession()` serait accessible sans authentification grâce à l'en-tête ci-dessus.

**Impact.** Disponibilité ; régression d'autorisation latente.

**Correctif proposé.** Monter en 14.2.35, dernière 14.2.x publiée au moment de l'audit (`npm view next@14 version`), puis régénérer le lockfile (`npm install`) et relancer `npm audit` en ligne. Envisager ensuite une migration vers une branche maintenue. En complément, bloquer l'en-tête `x-middleware-subrequest` au niveau du reverse proxy.

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

**Sévérité : Info** · **Statut : À vérifier** · **Correctif : À vérifier**

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
