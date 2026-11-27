# Thuis

Een app voor het huishouden, voor iPhone en iPad: **boodschappenlijst**, **gedeelde agenda** en **huishoudtaken**,
plus een **muurscherm** voor een iPad aan de muur. Alles wat de een toevoegt of afvinkt, ziet de ander meteen.

De app is een web-app die je op je beginscherm zet. Je hebt geen App Store, Mac of ontwikkelaarsaccount nodig.
Hij werkt ook offline: wijzigingen worden verstuurd zodra je weer verbinding hebt.

## Wat zit erin

- **Boodschappen**: toevoegen, afvinken ("in het mandje") en in één keer wissen. Ongedaan maken kan.
  Met suggesties van wat je vaak haalt.
- **Agenda**: afspraken met tijd of voor de hele dag, voor jou, Isabel of samen (elk een eigen kleur).
  Ze kunnen elke week, maand of jaar terugkomen, handig voor verjaardagen.
- **Taken**: eenmalig of terugkerend (dagelijks, wekelijks, om de week, maandelijks). Afgevinkte terugkerende taken
  schuiven automatisch door naar de volgende keer. Je kunt filteren per persoon.
- **Muurscherm**: een iPad-weergave met klok, agenda voor 7 dagen, taken voor vandaag en de boodschappenlijst.
  Je kunt alles direct op het scherm afvinken.

## Eenmalig instellen (ongeveer 15 minuten)

### 1. Database aanmaken (Supabase, gratis)

1. Maak een account aan op <https://supabase.com> en kies **New project**. Kies als regio bijvoorbeeld *West EU (Ireland)* of *Central EU (Frankfurt)*.
2. Ga naar **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Ga naar **Authentication → Sign In / Providers** en zet **Allow new users to sign up** **uit**.
   Zo kan niemand anders een account aanmaken.
4. Ga naar **Authentication → Users → Add user → Create new user** en maak een account voor jezelf en een voor Isabel
   (e-mailadres en wachtwoord, vink *Auto Confirm User* aan).
   Voor de iPad aan de muur kun je een van die accounts gebruiken, of een derde account maken.
5. Ga naar **Project Settings → API** en kopieer de **Project URL** en de **anon public**-sleutel.

### 2. App koppelen

Vul die twee waarden in [`js/config.js`](js/config.js) in:

```js
window.THUIS_CONFIG = {
  SUPABASE_URL: 'https://jouwproject.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```

De anon-sleutel mag openbaar zijn. De database laat alleen ingelogde gebruikers toe.

### 3. Online zetten (GitHub Pages)

1. Zet deze code op de `main`-branch.
2. Ga in GitHub naar **Settings → Pages** en kies bij *Source* voor **GitHub Actions**.
3. Na elke wijziging op `main` publiceert de workflow de app op `https://<gebruikersnaam>.github.io/Thuis/`.

> GitHub Pages werkt gratis voor openbare repositories. Bij een privé-repository heb je GitHub Pro nodig.
> Als alternatief kun je de map (zonder `supabase/` en `.github/`) gratis neerzetten op Netlify of Cloudflare Pages.

### 4. Op je iPhone en iPad zetten

1. Open de link in **Safari**.
2. Tik op de deelknop (vierkantje met pijl omhoog) en kies **Zet op beginscherm**.
3. Open de app vanaf het beginscherm en log in.
4. Kies onder **Meer** wie dit apparaat gebruikt en pas de namen aan (standaard "Isabel" en "Ik").

**iPad aan de muur:**

- Zet onder **Meer** de optie **Altijd openen als muurscherm** aan.
- Zet bij Instellingen → **Beeldscherm en helderheid → Automatisch vergrendelen** op **Nooit**, en laat de iPad aan de lader.
- Tip: met **Begeleide toegang** (Instellingen → Toegankelijkheid) blijft de iPad in deze app.

## Zonder database uitproberen

Laat `js/config.js` leeg. De app werkt dan alleen op het apparaat zelf, zonder delen.
Lokaal starten:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Technisch

- Gewone HTML, CSS en JavaScript, zonder build-stap.
- `js/store.js` regelt de opslag: cache in `localStorage`, een wachtrij voor offline wijzigingen en live updates via Supabase Realtime.
- `sw.js` zorgt dat de app offline opstart.
- `js/vendor/supabase.js` is de officiële supabase-js-bundel (v2.119.2), zodat de app niet afhankelijk is van een CDN.
